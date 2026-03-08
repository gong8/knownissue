-- Backfill BugRevision v1 for all existing bugs
-- Run this ONCE after the add_version_control migration

INSERT INTO "BugRevision" (id, version, action, title, description, severity, status, tags, "bugId", "actorId", "createdAt")
SELECT gen_random_uuid(), 1, 'create', title, description, severity, status, tags, id, "reporterId", "createdAt"
FROM "Bug"
WHERE id NOT IN (SELECT DISTINCT "bugId" FROM "BugRevision");
