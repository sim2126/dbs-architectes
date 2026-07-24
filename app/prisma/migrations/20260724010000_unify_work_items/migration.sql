BEGIN;

-- The repository used db push before this baseline. Keep the DDL safe to
-- re-run so a partially prepared development database can be recovered.
DO $$
BEGIN
    CREATE TYPE "WorkItemType" AS ENUM ('task', 'meeting', 'milestone', 'deadline');
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS "WorkItem" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "projectId" TEXT,
    "parentId" TEXT,
    "legacyTaskId" TEXT,
    "legacyAgendaId" TEXT,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "type" "WorkItemType" NOT NULL DEFAULT 'task',
    "startDate" TIMESTAMP(3),
    "dueDate" TIMESTAMP(3),
    "status" TEXT NOT NULL DEFAULT 'todo',
    "priority" TEXT NOT NULL DEFAULT 'medium',
    "position" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "completedAt" TIMESTAMP(3),
    "color" TEXT,
    "allDay" BOOLEAN NOT NULL DEFAULT false,
    "googleEventId" TEXT,
    "sourceSystem" TEXT,
    "sourceId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WorkItem_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "WorkItem_legacyTaskId_key"
    ON "WorkItem"("legacyTaskId");
CREATE UNIQUE INDEX IF NOT EXISTS "WorkItem_legacyAgendaId_key"
    ON "WorkItem"("legacyAgendaId");
CREATE INDEX IF NOT EXISTS "WorkItem_userId_status_position_idx"
    ON "WorkItem"("userId", "status", "position");
CREATE INDEX IF NOT EXISTS "WorkItem_userId_dueDate_idx"
    ON "WorkItem"("userId", "dueDate");
CREATE INDEX IF NOT EXISTS "WorkItem_dueDate_status_idx"
    ON "WorkItem"("dueDate", "status");
CREATE INDEX IF NOT EXISTS "WorkItem_projectId_dueDate_idx"
    ON "WorkItem"("projectId", "dueDate");
CREATE INDEX IF NOT EXISTS "WorkItem_parentId_position_idx"
    ON "WorkItem"("parentId", "position");
CREATE INDEX IF NOT EXISTS "WorkItem_projectId_parentId_position_idx"
    ON "WorkItem"("projectId", "parentId", "position");

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'WorkItem_userId_fkey'
          AND conrelid = '"WorkItem"'::regclass
    ) THEN
        ALTER TABLE "WorkItem"
            ADD CONSTRAINT "WorkItem_userId_fkey"
            FOREIGN KEY ("userId") REFERENCES "User"("id")
            ON DELETE RESTRICT ON UPDATE CASCADE;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'WorkItem_projectId_fkey'
          AND conrelid = '"WorkItem"'::regclass
    ) THEN
        ALTER TABLE "WorkItem"
            ADD CONSTRAINT "WorkItem_projectId_fkey"
            FOREIGN KEY ("projectId") REFERENCES "Project"("id")
            ON DELETE SET NULL ON UPDATE CASCADE;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'WorkItem_parentId_fkey'
          AND conrelid = '"WorkItem"'::regclass
    ) THEN
        ALTER TABLE "WorkItem"
            ADD CONSTRAINT "WorkItem_parentId_fkey"
            FOREIGN KEY ("parentId") REFERENCES "WorkItem"("id")
            ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
END $$;

-- Refuse ambiguous or lossy legacy data rather than silently guessing.
DO $$
BEGIN
    IF EXISTS (
        SELECT 1
        FROM "Task" t
        INNER JOIN "AgendaItem" a ON a.id = t.id
    ) THEN
        RAISE EXCEPTION 'Task/AgendaItem ID collision';
    END IF;

    IF EXISTS (
        SELECT 1
        FROM "AgendaItem"
        WHERE lower(trim(type)) NOT IN ('task', 'meeting', 'call', 'milestone', 'deadline')
    ) THEN
        RAISE EXCEPTION 'Unsupported AgendaItem.type present';
    END IF;
END $$;

-- Preserve Task IDs and all Task fields. ON CONFLICT makes the backfill
-- repeatable without overwriting WorkItems edited after cut-over.
INSERT INTO "WorkItem" (
    "id", "userId", "projectId", "parentId",
    "legacyTaskId", "legacyAgendaId", "title", "description", "type",
    "startDate", "dueDate", "status", "priority", "position", "completedAt",
    "color", "allDay", "googleEventId", "sourceSystem", "sourceId",
    "createdAt", "updatedAt"
)
SELECT
    t.id, t."userId", t."projectId", NULL,
    t.id, NULL, t.title, t.description, 'task'::"WorkItemType",
    NULL, t."dueDate", t.status, t.priority, t.position, t."completedAt",
    NULL, false, NULL, NULL, NULL,
    t."createdAt", t."updatedAt"
FROM "Task" t
ON CONFLICT ("legacyTaskId") DO NOTHING;

-- A single-date AgendaItem becomes a due date. A ranged AgendaItem becomes
-- startDate/dueDate, allowing the legacy date/endDate pair to be rebuilt.
INSERT INTO "WorkItem" (
    "id", "userId", "projectId", "parentId",
    "legacyTaskId", "legacyAgendaId", "title", "description", "type",
    "startDate", "dueDate", "status", "priority", "position", "completedAt",
    "color", "allDay", "googleEventId", "sourceSystem", "sourceId",
    "createdAt", "updatedAt"
)
SELECT
    a.id, a."userId", a."projectId", NULL,
    NULL, a.id, a.title, a.description,
    (
        CASE lower(trim(a.type))
            WHEN 'meeting' THEN 'meeting'
            WHEN 'call' THEN 'meeting'
            WHEN 'milestone' THEN 'milestone'
            WHEN 'deadline' THEN 'deadline'
            ELSE 'task'
        END
    )::"WorkItemType",
    CASE WHEN a."endDate" IS NULL THEN NULL ELSE a.date END,
    COALESCE(a."endDate", a.date),
    a.status, a.priority, 0, NULL,
    a.color, a."allDay", a."googleEventId", a."sourceSystem", a."sourceId",
    a."createdAt", a."updatedAt"
FROM "AgendaItem" a
ON CONFLICT ("legacyAgendaId") DO NOTHING;

-- Every legacy row must resolve to exactly one WorkItem. The unique indexes
-- enforce the "exactly one" side; these checks enforce completeness.
DO $$
BEGIN
    IF EXISTS (
        SELECT 1
        FROM "Task" t
        WHERE NOT EXISTS (
            SELECT 1 FROM "WorkItem" w WHERE w."legacyTaskId" = t.id
        )
    ) THEN
        RAISE EXCEPTION 'WorkItem backfill omitted one or more Task rows';
    END IF;

    IF EXISTS (
        SELECT 1
        FROM "AgendaItem" a
        WHERE NOT EXISTS (
            SELECT 1 FROM "WorkItem" w WHERE w."legacyAgendaId" = a.id
        )
    ) THEN
        RAISE EXCEPTION 'WorkItem backfill omitted one or more AgendaItem rows';
    END IF;
END $$;

COMMIT;
