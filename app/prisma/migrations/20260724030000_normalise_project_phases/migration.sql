-- Canonicalise slash-delimited project phases without changing updatedAt.
-- The WHERE clause makes the data operation safe to replay.
UPDATE "Project"
SET "phase" = regexp_replace(
  BTRIM("phase"),
  '[[:space:]]*/[[:space:]]*',
  '/',
  'g'
)
WHERE "phase" IS DISTINCT FROM regexp_replace(
  BTRIM("phase"),
  '[[:space:]]*/[[:space:]]*',
  '/',
  'g'
);
