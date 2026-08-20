/**
 * Guest classification.
 *
 * A guest is someone outside the practice — a client, a consultant, a
 * contractor — who has been given access to a specific conversation and
 * nothing else. They reach channels through an explicit ChannelMember row
 * and never through a ProjectAssignment, so they see a discussion rather
 * than a portfolio.
 *
 * `User.isExternal` is the source of truth, set from the admin's decision at
 * invite time. The domain check below is a *safety net*, not the rule: it
 * exists so an admin who types a client address into the ordinary invite
 * field gets warned rather than silently creating a staff account.
 *
 * Pure — no DB, no session.
 */

/**
 * The practice's own email domain.
 *
 * A constant rather than configuration: this build targets one workspace
 * (MEMORY.md scope discipline), and a mistyped env var here would classify
 * every colleague as a guest — or worse, every client as staff.
 */
export const WORKSPACE_DOMAIN = "dbsarc.com";

/** Domain of an address, lowercased. Null if the address is malformed. */
export function domainOf(email: string): string | null {
  const at = email.lastIndexOf("@");
  if (at <= 0 || at === email.length - 1) return null;
  return email.slice(at + 1).trim().toLowerCase();
}

/**
 * True when an address sits outside the practice.
 *
 * A malformed address counts as outside. Failing closed matters here: the
 * consequence of mistaking a guest for staff is portfolio-wide visibility,
 * while mistaking staff for a guest is a fixable inconvenience.
 */
export function isExternalAddress(email: string): boolean {
  const domain = domainOf(email);
  if (domain === null) return true;
  return domain !== WORKSPACE_DOMAIN;
}

/**
 * Does the admin's stated intent disagree with the address they typed?
 *
 * Returned as a warning rather than an error — an admin may legitimately
 * invite a subcontractor on a `dbsarc.com` alias, or a colleague using a
 * personal address during onboarding. The UI surfaces the mismatch and lets
 * them confirm; it does not overrule them.
 */
export function guestIntentMismatch(
  email: string,
  markedExternal: boolean,
): { mismatch: false } | { mismatch: true; reason: string } {
  const looksExternal = isExternalAddress(email);
  if (looksExternal === markedExternal) return { mismatch: false };

  if (looksExternal && !markedExternal) {
    return {
      mismatch: true,
      reason: `${email} is outside ${WORKSPACE_DOMAIN}. Invite as a guest unless they are joining the practice.`,
    };
  }
  return {
    mismatch: true,
    reason: `${email} is a ${WORKSPACE_DOMAIN} address. Guests normally sit outside the practice.`,
  };
}

/** Excludes guests from a list. Used by staff-facing surfaces. */
export function staffOnly<T extends { isExternal: boolean }>(people: readonly T[]): T[] {
  return people.filter((p) => !p.isExternal);
}
