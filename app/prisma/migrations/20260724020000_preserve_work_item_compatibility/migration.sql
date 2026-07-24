BEGIN;

-- Preserve the original free-form AgendaItem type for compatibility reads.
-- In particular, legacy `call` rows are represented canonically as meetings
-- while the old API continues to return `call` during the transition.
ALTER TABLE "WorkItem"
    ADD COLUMN IF NOT EXISTS "legacyAgendaType" TEXT;

UPDATE "WorkItem" w
SET "legacyAgendaType" = a.type
FROM "AgendaItem" a
WHERE w."legacyAgendaId" = a.id
  AND w."legacyAgendaType" IS NULL;

-- Ranged timeline records filter by startDate, while single-date records use
-- dueDate. Index both halves of that compatibility query.
CREATE INDEX IF NOT EXISTS "WorkItem_userId_startDate_idx"
    ON "WorkItem"("userId", "startDate");
CREATE INDEX IF NOT EXISTS "WorkItem_startDate_status_idx"
    ON "WorkItem"("startDate", "status");
CREATE INDEX IF NOT EXISTS "WorkItem_projectId_startDate_idx"
    ON "WorkItem"("projectId", "startDate");

-- Transitional origin markers are mutually exclusive and, because the
-- migration preserves IDs, must identify the WorkItem itself.
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'WorkItem_legacy_origin_check'
          AND conrelid = '"WorkItem"'::regclass
    ) THEN
        ALTER TABLE "WorkItem"
            ADD CONSTRAINT "WorkItem_legacy_origin_check"
            CHECK (
                NOT ("legacyTaskId" IS NOT NULL AND "legacyAgendaId" IS NOT NULL)
                AND ("legacyTaskId" IS NULL OR "legacyTaskId" = id)
                AND ("legacyAgendaId" IS NULL OR "legacyAgendaId" = id)
            );
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'WorkItem_parent_not_self_check'
          AND conrelid = '"WorkItem"'::regclass
    ) THEN
        ALTER TABLE "WorkItem"
            ADD CONSTRAINT "WorkItem_parent_not_self_check"
            CHECK ("parentId" IS NULL OR "parentId" <> id);
    END IF;
END $$;

-- Refuse drifted legacy mappings rather than reporting a successful backfill.
DO $$
BEGIN
    IF EXISTS (
        SELECT 1
        FROM "Task" t
        LEFT JOIN "WorkItem" w ON w."legacyTaskId" = t.id
        WHERE w.id IS DISTINCT FROM t.id
    ) THEN
        RAISE EXCEPTION 'Task WorkItem IDs do not match legacy IDs';
    END IF;

    IF EXISTS (
        SELECT 1
        FROM "AgendaItem" a
        LEFT JOIN "WorkItem" w ON w."legacyAgendaId" = a.id
        WHERE w.id IS DISTINCT FROM a.id
           OR w."legacyAgendaType" IS DISTINCT FROM a.type
    ) THEN
        RAISE EXCEPTION 'AgendaItem WorkItem compatibility data does not match legacy data';
    END IF;
END $$;

COMMIT;
