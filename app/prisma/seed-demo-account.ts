/**
 * The public "Try demo" account.
 *
 * One account, reachable from the sign-in page without credentials being
 * typed. Its password necessarily ships in the client bundle, so everything
 * about this account is designed on the assumption that the whole internet
 * has it.
 *
 * Two decisions follow from that:
 *
 *   1. Role "viewer". Not in WRITE_ROLES, so authorize() refuses every
 *      mutation. A stranger can look at the demo; they cannot delete a
 *      project, edit a workbook cell, invite anyone or remove a file.
 *
 *   2. Its own password, NOT the shared dbs2025. Publishing dbs2025 in a
 *      JS bundle would hand out admin@, owner@ and pm@ as well, and those
 *      can write. The blast radius of a public password has to be one
 *      read-only account.
 *
 * The one exception to read-only is ai:invoke, granted through the existing
 * PermissionGrant mechanism rather than by changing a role. DBS AI is the
 * point of the demo, and ai:invoke is limited to managers and above, so
 * without the grant the visitor would land on the product's headline feature
 * and be told they are not allowed to use it. ai:invoke is already in
 * OVERRIDABLE_ACTIONS, so this is the sanctioned route — no authz change, and
 * the NO-ESCALATION INVARIANT is untouched.
 *
 * Idempotent. Safe to re-run, and safe to run against a database that has
 * already been seeded, because it only touches this one account.
 *
 *   npx tsx prisma/seed-demo-account.ts
 */

import "dotenv/config";
import bcrypt from "bcryptjs";
import { createSeedPrisma } from "./seed-db";

const prisma = createSeedPrisma(process.env.DATABASE_URL!);

/** Kept in step with DEMO_EMAIL / DEMO_PASSWORD in src/app/login/page.tsx.
 *  If these drift, the button on the sign-in page stops working. */
export const DEMO_EMAIL = "demo@dbsarc.com";
export const DEMO_PASSWORD = "friday-demo-2026";

async function main() {
  const password = await bcrypt.hash(DEMO_PASSWORD, 10);

  const user = await prisma.user.upsert({
    where: { email: DEMO_EMAIL },
    update: {
      // Re-asserted on every run. If someone has raised this account's role
      // by hand, a re-run puts it back to read-only rather than leaving a
      // publicly-known password attached to a writable account.
      role: "viewer",
      password,
      isActive: true,
      canCreate: false,
      canEdit: false,
      canDelete: false,
    },
    create: {
      email: DEMO_EMAIL,
      name: "Demo Visitor",
      initials: "DV",
      role: "viewer",
      defaultCountry: "CH",
      password,
      isActive: true,
      canCreate: false,
      canEdit: false,
      canDelete: false,
    },
    select: { id: true, email: true, role: true },
  });

  // The grant needs an accountable author — the schema requires one, on the
  // stated grounds that a permission change without one is not auditable.
  // Attributed to the owner account with a reason, so this shows up in the
  // Settings audit view as a deliberate act rather than an orphan row.
  const owner = await prisma.user.findFirst({
    where: { email: "owner@dbsarc.com" },
    select: { id: true },
  });
  if (!owner) {
    throw new Error(
      "owner@dbsarc.com not found. Run `npm run db:seed` first — the grant needs an author.",
    );
  }

  // Only ai:invoke. Named explicitly rather than looped over a list, so
  // widening what an anonymous visitor can do means editing this call.
  await prisma.permissionGrant.upsert({
    where: { userId_action: { userId: user.id, action: "ai:invoke" } },
    update: {
      effect: "allow",
      grantedById: owner.id,
      reason: "Public demo access — read-only account, DBS AI enabled",
      // No expiry. The demo door closes with NEXT_PUBLIC_DEMO_ACCESS=off,
      // which is a deploy decision, rather than lapsing mid-demo.
      expiresAt: null,
    },
    create: {
      userId: user.id,
      action: "ai:invoke",
      effect: "allow",
      grantedById: owner.id,
      reason: "Public demo access — read-only account, DBS AI enabled",
    },
  });

  const grants = await prisma.permissionGrant.findMany({
    where: { userId: user.id },
    select: { action: true, effect: true },
  });

  console.log(`Demo account ready: ${user.email} (role ${user.role})`);
  console.log(`Password: ${DEMO_PASSWORD}  — public by design`);
  console.log(
    `Grants: ${grants.map((g) => `${g.action}=${g.effect}`).join(", ") || "none"}`,
  );
  console.log(
    "Read-only everywhere else. Run prisma/seed-ai-files.ts to give it files and conversations.",
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
