BEGIN;

-- Add external-user classification without changing existing access.
ALTER TABLE "User"
ADD COLUMN "isExternal" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "Invitation"
ADD COLUMN "isExternal" BOOLEAN NOT NULL DEFAULT false;

-- Existing invitations pre-date the explicit guest flag. Fail closed for any
-- trimmed domain other than the practice's exact domain, including malformed
-- addresses, subdomains and lookalike domains. External invitations never
-- carry a privileged role.
UPDATE "Invitation"
SET
    "isExternal" = true,
    "role" = 'employee'
WHERE BTRIM("email") ~ '[[:space:]]'
   OR BTRIM("email") !~ '^[^@]+@[^@]+$'
   OR LOWER(SPLIT_PART(BTRIM("email"), '@', 2)) <> 'dbsarc.com';

-- acceptedUserId is informational rather than a foreign key, so require an
-- accepted invitation and an exact normalised email match before changing an
-- existing user. Do not infer guest status from User.email alone.
UPDATE "User" AS u
SET
    "isExternal" = true,
    "role" = 'employee'
WHERE EXISTS (
    SELECT 1
    FROM "Invitation" AS i
    WHERE i."status" = 'accepted'
      AND i."isExternal" = true
      AND i."acceptedUserId" = u."id"
      AND LOWER(BTRIM(i."email")) = LOWER(BTRIM(u."email"))
);

-- Store DBS AI attachment metadata and extracted text. File bytes remain in
-- the configured upload store rather than PostgreSQL.
CREATE TABLE "AiChatAttachment" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "sessionId" TEXT,
    "messageId" TEXT,
    "filename" TEXT NOT NULL,
    "contentType" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "url" TEXT NOT NULL,
    "extractedText" TEXT,
    "extractedUnits" INTEGER,
    "ingestedAt" TIMESTAMP(3),
    "ingestError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AiChatAttachment_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "AiChatAttachment_userId_createdAt_idx"
ON "AiChatAttachment"("userId", "createdAt");

CREATE INDEX "AiChatAttachment_sessionId_idx"
ON "AiChatAttachment"("sessionId");

CREATE UNIQUE INDEX "AiChatAttachment_userId_url_key"
ON "AiChatAttachment"("userId", "url");

ALTER TABLE "AiChatAttachment"
ADD CONSTRAINT "AiChatAttachment_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "User"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

-- Distributed AI cost and concurrency guards. These live in PostgreSQL so
-- multiple ECS tasks share one quota and one active-generation lease.
CREATE TABLE "AiRequestEvent" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AiRequestEvent_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "AiRequestEvent_userId_createdAt_idx"
ON "AiRequestEvent"("userId", "createdAt");

ALTER TABLE "AiRequestEvent"
ADD CONSTRAINT "AiRequestEvent_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "User"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "AiAgentLease" (
    "userId" TEXT NOT NULL,
    "requestId" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AiAgentLease_pkey" PRIMARY KEY ("userId")
);

CREATE UNIQUE INDEX "AiAgentLease_requestId_key"
ON "AiAgentLease"("requestId");

CREATE INDEX "AiAgentLease_expiresAt_idx"
ON "AiAgentLease"("expiresAt");

ALTER TABLE "AiAgentLease"
ADD CONSTRAINT "AiAgentLease_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "User"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

-- Earlier chat-to-task conversion was not idempotent. Preserve every existing
-- work item, but retain source provenance on only the first conversion so the
-- new uniqueness contract can be installed without deleting user work.
WITH ranked_sources AS (
    SELECT
        "id",
        ROW_NUMBER() OVER (
            PARTITION BY "userId", "sourceSystem", "sourceId"
            ORDER BY "createdAt" ASC, "id" ASC
        ) AS source_rank
    FROM "WorkItem"
    WHERE "sourceSystem" IS NOT NULL AND "sourceId" IS NOT NULL
)
UPDATE "WorkItem" AS work_item
SET "sourceSystem" = NULL, "sourceId" = NULL
FROM ranked_sources
WHERE work_item."id" = ranked_sources."id"
  AND ranked_sources.source_rank > 1;

-- A source can be converted once per user. PostgreSQL still permits multiple
-- rows where sourceSystem or sourceId is NULL, preserving ordinary work items.
CREATE UNIQUE INDEX "WorkItem_userId_sourceSystem_sourceId_key"
ON "WorkItem"("userId", "sourceSystem", "sourceId");

-- A project has one canonical discussion channel. Consolidate any historical
-- duplicates without losing messages or memberships before enforcing that
-- invariant. Null projectIds (ordinary and direct channels) remain unrestricted
-- under PostgreSQL's null semantics.
CREATE TEMP TABLE "_FridayChannelMerge" (
    "duplicateId" TEXT PRIMARY KEY,
    "keeperId" TEXT NOT NULL
) ON COMMIT DROP;

INSERT INTO "_FridayChannelMerge" ("duplicateId", "keeperId")
SELECT "id", "keeperId"
FROM (
    SELECT
        "id",
        FIRST_VALUE("id") OVER (
            PARTITION BY "projectId", "type"
            ORDER BY "createdAt" ASC, "id" ASC
        ) AS "keeperId",
        ROW_NUMBER() OVER (
            PARTITION BY "projectId", "type"
            ORDER BY "createdAt" ASC, "id" ASC
        ) AS "channelRank"
    FROM "Channel"
    WHERE "projectId" IS NOT NULL
) AS ranked
WHERE "channelRank" > 1;

UPDATE "Message" AS message
SET "channelId" = merge."keeperId"
FROM "_FridayChannelMerge" AS merge
WHERE message."channelId" = merge."duplicateId";

WITH member_rollup AS (
    SELECT
        COALESCE(merge."keeperId", member."channelId") AS "keeperId",
        member."userId",
        MIN(member."joinedAt") AS "joinedAt",
        MAX(member."lastRead") AS "lastRead",
        CASE
            WHEN BOOL_OR(member."role" = 'owner') THEN 'owner'
            WHEN BOOL_OR(member."role" = 'admin') THEN 'admin'
            ELSE 'member'
        END AS "role"
    FROM "ChannelMember" AS member
    LEFT JOIN "_FridayChannelMerge" AS merge
      ON member."channelId" = merge."duplicateId"
    GROUP BY COALESCE(merge."keeperId", member."channelId"), member."userId"
)
UPDATE "ChannelMember" AS keeper
SET
    "joinedAt" = rollup."joinedAt",
    "lastRead" = rollup."lastRead",
    "role" = rollup."role"
FROM member_rollup AS rollup
WHERE keeper."channelId" = rollup."keeperId"
  AND keeper."userId" = rollup."userId";

-- If the keeper channel did not already contain a user, retain one of that
-- user's duplicate membership rows and fold the strongest role/read metadata
-- into it before remapping its channelId.
WITH duplicate_rollup AS (
    SELECT
        merge."keeperId",
        member."userId",
        (ARRAY_AGG(member."id" ORDER BY member."joinedAt" ASC, member."id" ASC))[1]
            AS "chosenId",
        MIN(member."joinedAt") AS "joinedAt",
        MAX(member."lastRead") AS "lastRead",
        CASE
            WHEN BOOL_OR(member."role" = 'owner') THEN 'owner'
            WHEN BOOL_OR(member."role" = 'admin') THEN 'admin'
            ELSE 'member'
        END AS "role"
    FROM "ChannelMember" AS member
    JOIN "_FridayChannelMerge" AS merge
      ON member."channelId" = merge."duplicateId"
    WHERE NOT EXISTS (
        SELECT 1
        FROM "ChannelMember" AS keeper
        WHERE keeper."channelId" = merge."keeperId"
          AND keeper."userId" = member."userId"
    )
    GROUP BY merge."keeperId", member."userId"
)
UPDATE "ChannelMember" AS chosen
SET
    "joinedAt" = rollup."joinedAt",
    "lastRead" = rollup."lastRead",
    "role" = rollup."role"
FROM duplicate_rollup AS rollup
WHERE chosen."id" = rollup."chosenId";

WITH duplicate_ranked AS (
    SELECT
        member."id",
        ROW_NUMBER() OVER (
            PARTITION BY merge."keeperId", member."userId"
            ORDER BY member."joinedAt" ASC, member."id" ASC
        ) AS "memberRank"
    FROM "ChannelMember" AS member
    JOIN "_FridayChannelMerge" AS merge
      ON member."channelId" = merge."duplicateId"
    WHERE NOT EXISTS (
        SELECT 1
        FROM "ChannelMember" AS keeper
        WHERE keeper."channelId" = merge."keeperId"
          AND keeper."userId" = member."userId"
    )
)
DELETE FROM "ChannelMember" AS duplicate
USING duplicate_ranked
WHERE duplicate."id" = duplicate_ranked."id"
  AND duplicate_ranked."memberRank" > 1;

DELETE FROM "ChannelMember" AS duplicate
USING "_FridayChannelMerge" AS merge, "ChannelMember" AS keeper
WHERE duplicate."channelId" = merge."duplicateId"
  AND keeper."channelId" = merge."keeperId"
  AND duplicate."userId" = keeper."userId";

UPDATE "ChannelMember" AS member
SET "channelId" = merge."keeperId"
FROM "_FridayChannelMerge" AS merge
WHERE member."channelId" = merge."duplicateId";

DELETE FROM "Channel" AS channel
USING "_FridayChannelMerge" AS merge
WHERE channel."id" = merge."duplicateId";

DROP INDEX "Channel_projectId_type_idx";

CREATE UNIQUE INDEX "Channel_projectId_type_key"
ON "Channel"("projectId", "type");

COMMIT;
