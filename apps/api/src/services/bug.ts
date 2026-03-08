import { prisma } from "@knownissue/db";
import type { BugInput, BugUpdate, Role } from "@knownissue/shared";
import { bugInputSchema, bugUpdateSchema } from "@knownissue/shared";
import { generateEmbedding } from "./embedding";
import { checkDuplicate, validateContent } from "./spam";
import { logAudit } from "./audit";
import { createBugRevision } from "./revision";

export async function searchBugs(params: {
  query: string;
  library?: string;
  version?: string;
  ecosystem?: string;
  limit?: number;
  offset?: number;
}) {
  const { query, library, version, ecosystem, limit = 10, offset = 0 } = params;

  // Build where clause for exact filters
  const where: Record<string, unknown> = {};
  if (library) where.library = library;
  if (version) where.version = version;
  if (ecosystem) where.ecosystem = ecosystem;

  // Try semantic search with embeddings
  const embedding = await generateEmbedding(query);

  if (embedding) {
    const vectorStr = `[${embedding.join(",")}]`;

    // Build filter conditions with parameterized placeholders
    const conditions: string[] = [];
    const params: unknown[] = [vectorStr, limit, offset];
    let paramIndex = 4;

    if (library) {
      conditions.push(`"library" = $${paramIndex++}`);
      params.push(library);
    }
    if (version) {
      conditions.push(`"version" = $${paramIndex++}`);
      params.push(version);
    }
    if (ecosystem) {
      conditions.push(`"ecosystem" = $${paramIndex++}`);
      params.push(ecosystem);
    }

    const whereClause = conditions.length > 0
      ? `WHERE ${conditions.join(" AND ")}`
      : "";

    const countQuery = `SELECT COUNT(*)::int as count FROM "Bug" ${whereClause}`;
    const countParams = params.slice(3); // only the filter params

    const [bugs, countResult] = await Promise.all([
      prisma.$queryRawUnsafe<Array<Record<string, unknown>>>(
        `SELECT id, title, description, library, version, ecosystem, severity, status, tags,
                "reporterId", "createdAt", "updatedAt",
                1 - (embedding <=> $1::vector) as similarity
         FROM "Bug"
         ${whereClause}
         ORDER BY embedding <=> $1::vector
         LIMIT $2 OFFSET $3`,
        ...params
      ),
      prisma.$queryRawUnsafe<[{ count: number }]>(
        countQuery,
        ...countParams
      ),
    ]);

    return { bugs, total: countResult[0].count };
  }

  // Fallback: text search
  const [bugs, total] = await Promise.all([
    prisma.bug.findMany({
      where: {
        ...where,
        OR: [
          { title: { contains: query, mode: "insensitive" as const } },
          { description: { contains: query, mode: "insensitive" as const } },
        ],
      },
      include: {
        reporter: true,
        _count: { select: { patches: true } },
      },
      orderBy: { createdAt: "desc" },
      take: limit,
      skip: offset,
    }),
    prisma.bug.count({
      where: {
        ...where,
        OR: [
          { title: { contains: query, mode: "insensitive" as const } },
          { description: { contains: query, mode: "insensitive" as const } },
        ],
      },
    }),
  ]);

  return { bugs, total };
}

export async function getBugById(id: string) {
  return prisma.bug.findUnique({
    where: { id },
    include: {
      reporter: true,
      patches: {
        include: {
          submitter: true,
          reviews: {
            include: { reviewer: true },
            orderBy: { createdAt: "desc" },
          },
        },
        orderBy: { score: "desc" },
      },
    },
  });
}

export async function createBug(input: BugInput, userId: string) {
  // Validate input
  const parsed = bugInputSchema.parse(input);

  // Content validation
  const contentCheck = validateContent(parsed.title, parsed.description);
  if (!contentCheck.valid) {
    throw new Error(contentCheck.reason);
  }

  // Duplicate check
  const dupCheck = await checkDuplicate(parsed.title, parsed.description);
  if (dupCheck.isDuplicate) {
    throw new Error(
      `Duplicate detected: ${dupCheck.warning}. Similar bugs: ${dupCheck.similarBugs?.map((b) => b.title).join(", ")}`
    );
  }

  // Generate embedding
  const embedding = await generateEmbedding(`${parsed.title} ${parsed.description}`);

  // Create bug
  const bug = await prisma.bug.create({
    data: {
      title: parsed.title,
      description: parsed.description,
      library: parsed.library,
      version: parsed.version,
      ecosystem: parsed.ecosystem,
      severity: parsed.severity,
      tags: parsed.tags,
      reporterId: userId,
    },
    include: { reporter: true },
  });

  // Store embedding if available (raw query since Prisma doesn't support vector type directly)
  if (embedding) {
    const vectorStr = `[${embedding.join(",")}]`;
    await prisma.$executeRawUnsafe(
      `UPDATE "Bug" SET embedding = $1::vector WHERE id = $2`,
      vectorStr,
      bug.id
    );
  }

  // Audit + revision
  await Promise.all([
    createBugRevision(bug.id, "create", userId),
    logAudit({
      action: "create",
      entityType: "bug",
      entityId: bug.id,
      actorId: userId,
    }),
  ]);

  return { bug, warning: dupCheck.warning };
}

export async function listBugs(params: {
  library?: string;
  version?: string;
  ecosystem?: string;
  status?: string[];
  severity?: string[];
  limit?: number;
  offset?: number;
}) {
  const { library, version, ecosystem, status, severity, limit = 20, offset = 0 } = params;

  const where: Record<string, unknown> = {};
  if (library) where.library = library;
  if (version) where.version = version;
  if (ecosystem) where.ecosystem = ecosystem;
  if (status && status.length > 0) {
    where.status = status.length === 1 ? status[0] : { in: status };
  }
  if (severity && severity.length > 0) {
    where.severity = severity.length === 1 ? severity[0] : { in: severity };
  }

  const [bugs, total] = await Promise.all([
    prisma.bug.findMany({
      where,
      include: {
        reporter: true,
        _count: { select: { patches: true } },
      },
      orderBy: { createdAt: "desc" },
      take: limit,
      skip: offset,
    }),
    prisma.bug.count({ where }),
  ]);

  return { bugs, total };
}

export async function updateBug(id: string, input: BugUpdate, userId: string, userRole?: Role) {
  const parsed = bugUpdateSchema.parse(input);

  const bug = await prisma.bug.findUnique({ where: { id } });
  if (!bug) throw new Error("Bug not found");
  if (bug.reporterId !== userId && userRole !== "admin") {
    throw new Error("Only the reporter can edit this bug");
  }

  // Compute diff for audit log
  const changes: Record<string, { from: unknown; to: unknown }> = {};
  for (const [key, value] of Object.entries(parsed)) {
    if (value !== undefined) {
      const oldValue = bug[key as keyof typeof bug];
      if (JSON.stringify(oldValue) !== JSON.stringify(value)) {
        changes[key] = { from: oldValue, to: value };
      }
    }
  }

  const updated = await prisma.bug.update({
    where: { id },
    data: parsed,
    include: { reporter: true },
  });

  // Audit + revision
  await Promise.all([
    createBugRevision(id, "update", userId),
    logAudit({
      action: "update",
      entityType: "bug",
      entityId: id,
      actorId: userId,
      changes: Object.keys(changes).length > 0 ? changes : undefined,
    }),
  ]);

  return updated;
}

export async function deleteBug(id: string, userId: string, userRole?: Role) {
  const bug = await prisma.bug.findUnique({ where: { id } });
  if (!bug) throw new Error("Bug not found");
  if (bug.reporterId !== userId && userRole !== "admin") {
    throw new Error("Only the reporter can delete this bug");
  }

  // Log audit with full snapshot before deletion
  await logAudit({
    action: "delete",
    entityType: "bug",
    entityId: id,
    actorId: userId,
    changes: {
      title: { from: bug.title, to: null },
      description: { from: bug.description, to: null },
      severity: { from: bug.severity, to: null },
      status: { from: bug.status, to: null },
    },
  });

  await prisma.bug.delete({ where: { id } });
}

export async function updateBugStatus(id: string, status: string) {
  const bug = await prisma.bug.findUnique({ where: { id } });
  if (!bug) throw new Error("Bug not found");

  return prisma.bug.update({
    where: { id },
    data: { status: status as "open" | "confirmed" | "patched" | "closed" },
    include: { reporter: true },
  });
}

export async function getUserBugs(userId: string) {
  return prisma.bug.findMany({
    where: { reporterId: userId },
    include: {
      _count: { select: { patches: true } },
    },
    orderBy: { createdAt: "desc" },
  });
}
