/**
 * Demo roles the journeys sign in as, and where each role's saved session
 * lives. A plain module — Playwright forbids a test file importing another
 * test file, so this cannot live in auth.setup.ts.
 *
 * Only the roles the journeys need. The credentials endpoint allows 10 logins
 * a minute per IP and CI's k6 setup draws on the same budget.
 */
export const ROLES = {
  pm: { email: "pm@dbsarc.com", password: "dbs2025" },
  admin: { email: "admin@dbsarc.com", password: "dbs2025" },
  employee: { email: "employee@dbsarc.com", password: "dbs2025" },
} as const;

export type Role = keyof typeof ROLES;

export const stateFor = (role: Role) => `e2e/.auth/${role}.json`;
