import { prisma } from "@knownissue/db";
import type { BugInput } from "@knownissue/shared";
import { bugInputSchema } from "@knownissue/shared";
import { generateEmbedding } from "./embedding";
import { checkDuplicate, validateContent } from "./spam";

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

    // Build filter conditions for raw SQL
    const conditions: string[] = [];
    if (library) conditions.push(`"library" = '${library}'`);
    if (version) conditions.push(`"version" = '${version}'`);
    if (ecosystem) conditions.push(`"ecosystem" = '${ecosystem}'`);

    const whereClause = conditions.length > 0
      ? `WHERE ${conditions.join(" AND ")}`
      : "";

    const bugs = await prisma.$queryRawUnsafe<Array<Record<string, unknown>>>(
      `SELECT id, title, description, library, version, ecosystem, severity, status, tags,
              "reporterId", "createdAt", "updatedAt",
              1 - (embedding <=> $1::vector) as similarity
       FROM "Bug"
       ${whereClause}
       ORDER BY embedding <=> $1::vector
       LIMIT $2 OFFSET $3`,
      vectorStr,
      limit,
      offset
    );

    return { bugs, total: bugs.length };
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

  return { bug, warning: dupCheck.warning };
}

export async function listBugs(params: {
  library?: string;
  version?: string;
  ecosystem?: string;
  status?: string;
  severity?: string;
  limit?: number;
  offset?: number;
}) {
  const { library, version, ecosystem, status, severity, limit = 20, offset = 0 } = params;

  const where: Record<string, unknown> = {};
  if (library) where.library = library;
  if (version) where.version = version;
  if (ecosystem) where.ecosystem = ecosystem;
  if (status) where.status = status;
  if (severity) where.severity = severity;

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

export async function getUserBugs(userId: string) {
  return prisma.bug.findMany({
    where: { reporterId: userId },
    include: {
      _count: { select: { patches: true } },
    },
    orderBy: { createdAt: "desc" },
  });
}
