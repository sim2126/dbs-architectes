/**
 * Token utilities for invitation + password-reset flows.
 *
 * What we store: the SHA-256 hash of the random token.
 * What we send out: the raw token (URL-encoded) in the email link.
 * What we verify against: SHA-256(received) == stored tokenHash.
 *
 * This keeps the DB row useless if the table leaks — an attacker can't
 * reconstruct valid URLs from the stored hashes. Bcrypt would be
 * overkill here because the input domain is already 256 bits of
 * entropy (the random token itself); sha256 is the right choice for
 * fast lookup with no rainbow-table risk.
 *
 * Token shape: 32 bytes (256 bits) of crypto-grade randomness, encoded
 * as URL-safe base64 (~43 chars). Brute-forcing requires 2^256 / 2 ~
 * 5.8e76 guesses on average — not the attack vector to worry about.
 *
 * Expiry windows live at the call site (invite: 7 days, password
 * reset: 1 hour). Single-use is enforced by the route — on accept /
 * use the row's status flips terminal.
 */

import { randomBytes, createHash } from "crypto";

/** Produce { raw, hash } pair. Store hash, mail raw. */
export function issueToken(): { raw: string; hash: string } {
  const raw = randomBytes(32).toString("base64url");
  const hash = hashToken(raw);
  return { raw, hash };
}

/** SHA-256 of a raw token, hex-encoded. */
export function hashToken(raw: string): string {
  return createHash("sha256").update(raw).digest("hex");
}

/** Standard expiry windows. Edit here; call sites import the constant. */
export const INVITATION_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days
export const PASSWORD_RESET_TTL_MS = 60 * 60 * 1000;      // 1 hour
