# Prisma migration runbook

This repository adopted Prisma Migrate with the
`20260724000000_baseline` migration. The baseline represents the schema that
previously reached environments through `prisma db push`.

For a new, empty database, run `npx prisma migrate deploy`; Prisma must apply
the baseline and every later migration in order.

For an existing database created through `db push`:

1. Confirm that its pre-WorkItem schema matches the baseline.
2. Run
   `npx prisma migrate resolve --applied 20260724000000_baseline` once for that
   database.
3. Run `npx prisma migrate deploy` to apply the WorkItem backfill and later
   additive/data-normalisation migrations.
4. Run `npx prisma db push` only as a drift check; it must report that the
   database is already in sync.

Do not resolve the later migrations as already applied: they contain the
WorkItem backfill, compatibility checks, and project-phase normalisation. Neon
development was baselined and all four migrations were applied on 24 July 2026.

`Task` and `AgendaItem` remain rollback snapshots from the cut-over. New
application writes intentionally go only to `WorkItem`, which is the source of
truth. After post-cut-over writes, an application rollback requires a data
reconciliation plan; reverting only the application binary would discard new
work and revive deleted legacy rows.
