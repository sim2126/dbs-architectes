import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import {
  domainOf,
  guestIntentMismatch,
  isExternalAddress,
  safeInvitationRole,
  staffOnly,
  WORKSPACE_DOMAIN,
} from "./guests";

test("addresses on the workspace domain are internal", () => {
  assert.equal(isExternalAddress(`admin@${WORKSPACE_DOMAIN}`), false);
  assert.equal(isExternalAddress(`Admin@${WORKSPACE_DOMAIN.toUpperCase()}`), false);
});

test("addresses on any other domain are external", () => {
  assert.equal(isExternalAddress("client@example.com"), true);
  assert.equal(isExternalAddress("consultant@gmail.com"), true);
});

test("a lookalike domain is external", () => {
  // The check must be an exact domain match, not a substring. A subdomain or
  // a suffix collision would otherwise grant portfolio-wide access.
  assert.equal(isExternalAddress("attacker@notdbsarc.com"), true);
  assert.equal(isExternalAddress("attacker@dbsarc.com.evil.net"), true);
  assert.equal(isExternalAddress("attacker@mail.dbsarc.com"), true);
});

test("a malformed address fails closed as external", () => {
  // Mistaking a guest for staff exposes the whole portfolio; mistaking staff
  // for a guest is a fixable inconvenience. Fail towards the cheaper error.
  assert.equal(isExternalAddress("not-an-email"), true);
  assert.equal(isExternalAddress("@dbsarc.com"), true);
  assert.equal(isExternalAddress("trailing@"), true);
  assert.equal(isExternalAddress("person@@dbsarc.com"), true);
  assert.equal(isExternalAddress("person@outside.example@dbsarc.com"), true);
  assert.equal(isExternalAddress("person@ dbsarc.com"), true);
  assert.equal(isExternalAddress("person @dbsarc.com"), true);
  assert.equal(isExternalAddress(""), true);
});

test("domainOf extracts the domain, or null when malformed", () => {
  assert.equal(domainOf("a@b.com"), "b.com");
  assert.equal(domainOf("a@B.CoM"), "b.com");
  // Multiple @ characters are malformed and must fail closed.
  assert.equal(domainOf("weird@name@b.com"), null);
  assert.equal(domainOf("nope"), null);
});

test("intent matching the address raises no warning", () => {
  assert.deepEqual(guestIntentMismatch("client@example.com", true), { mismatch: false });
  assert.deepEqual(guestIntentMismatch(`staff@${WORKSPACE_DOMAIN}`, false), {
    mismatch: false,
  });
});

test("an outside address not marked as a guest is flagged", () => {
  // The case that matters: an admin typing a client address into the
  // ordinary invite field would otherwise create a staff account.
  const result = guestIntentMismatch("client@example.com", false);
  assert.equal(result.mismatch, true);
  if (result.mismatch) assert.match(result.reason, /guest/i);
});

test("an internal address marked as a guest is flagged but permitted", () => {
  // Warned, not blocked — a subcontractor on a workspace alias is legitimate.
  const result = guestIntentMismatch(`contractor@${WORKSPACE_DOMAIN}`, true);
  assert.equal(result.mismatch, true);
});

test("staffOnly removes guests and keeps order", () => {
  const people = [
    { id: "a", isExternal: false },
    { id: "b", isExternal: true },
    { id: "c", isExternal: false },
  ];
  assert.deepEqual(
    staffOnly(people).map((p) => p.id),
    ["a", "c"],
  );
});

test("external invitations cannot retain privileged staff roles", () => {
  for (const role of ["admin", "director", "manager", "employee", "intern"]) {
    assert.equal(safeInvitationRole(role, true), "employee");
  }
  assert.equal(safeInvitationRole("director", false), "director");
});

test("replacing a pending invitation is serialised and atomic", () => {
  const source = readFileSync(
    join(process.cwd(), "src/app/api/invitations/route.ts"),
    "utf8",
  );
  const transaction = source.match(
    /prisma\.\$transaction\(async \(tx\) => \{([\s\S]*?)\n  \}\);/,
  )?.[1];
  assert.ok(transaction, "invitation replacement must use one database transaction");
  assert.match(transaction, /pg_advisory_xact_lock/);
  assert.match(transaction, /tx\.invitation\.updateMany/);
  assert.match(transaction, /tx\.invitation\.create/);
});
