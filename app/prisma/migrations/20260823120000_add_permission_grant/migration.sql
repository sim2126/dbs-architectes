-- PermissionGrant existed in schema.prisma and on the Neon demo database, but
-- no migration ever created it: it arrived through `prisma db push`. A
-- greenfield deploy replaying migrations alone would therefore have had no
-- permissions table, and every request-scoped grant lookup would fail.
--
-- Caught by the schema-parity step in CI (`prisma migrate diff --exit-code`),
-- which is precisely the divergence that check exists to find.
--
-- Generated with `prisma migrate diff --from-migrations --to-schema` against a
-- throwaway shadow database, so this is the DDL Prisma itself emits rather
-- than a hand-written approximation.

-- CreateTable
CREATE TABLE "PermissionGrant" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "effect" TEXT NOT NULL,
    "grantedById" TEXT NOT NULL,
    "reason" TEXT,
    "expiresAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PermissionGrant_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PermissionGrant_userId_idx" ON "PermissionGrant"("userId");

-- CreateIndex
CREATE INDEX "PermissionGrant_expiresAt_idx" ON "PermissionGrant"("expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "PermissionGrant_userId_action_key" ON "PermissionGrant"("userId", "action");

-- AddForeignKey
ALTER TABLE "PermissionGrant" ADD CONSTRAINT "PermissionGrant_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PermissionGrant" ADD CONSTRAINT "PermissionGrant_grantedById_fkey" FOREIGN KEY ("grantedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
