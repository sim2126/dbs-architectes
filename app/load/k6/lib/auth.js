// Auth.js v5 credentials login for k6.
//
// The flow is the one the sign-in form performs: fetch a CSRF token, post it
// back with the credentials to the callback endpoint, and keep the cookies the
// server sets. k6's cookie jar is per-VU and does not survive the setup() →
// VU boundary, so the session cookie is extracted to a plain string and each
// VU sends it as a Cookie header.
//
// Rate limit awareness: /api/auth/callback/credentials is limited to 10 per
// minute per IP by the in-memory limiter. A load test runs from one IP, so
// every login must happen once, in setup(), and be reused — never per
// iteration. Nine accounts are logged in; ten would sit exactly on the limit.

import http from "k6/http";
import { check, fail } from "k6";

export function login(baseUrl, email, password) {
  const csrfRes = http.get(`${baseUrl}/api/auth/csrf`, {
    tags: { name: "auth:csrf" },
  });
  if (csrfRes.status !== 200) {
    fail(`csrf fetch failed for ${email}: HTTP ${csrfRes.status}`);
  }
  const csrfToken = csrfRes.json("csrfToken");
  const csrfCookie = cookieHeaderFrom(csrfRes);

  const res = http.post(
    `${baseUrl}/api/auth/callback/credentials`,
    {
      csrfToken,
      email,
      password,
      mfaCode: "",
      redirect: "false",
      json: "true",
    },
    {
      headers: { Cookie: csrfCookie },
      redirects: 0,
      tags: { name: "auth:login" },
    },
  );

  // Auth.js answers a successful credentials login with a 200 carrying a
  // {url} body (when redirect=false) or a 302 to the callback URL. Either way
  // the session cookie is in Set-Cookie. A 401 or a redirect to /login?error=
  // means the credentials were refused; a 429 means the limiter fired, which
  // in setup() is a configuration mistake and must stop the run.
  const cookie = cookieHeaderFrom(res, csrfCookie);
  const hasSession = /session-token=/.test(cookie);
  const ok = check(res, {
    [`login ${email}: not rate limited`]: (r) => r.status !== 429,
    [`login ${email}: session cookie issued`]: () => hasSession,
  });
  if (!ok) {
    fail(
      `login failed for ${email}: HTTP ${res.status}, cookies=${cookie.replace(/=[^;]+/g, "=…")}`,
    );
  }
  return cookie;
}

/** Collapses Set-Cookie headers (plus any prior cookie string) into one
 *  Cookie header value, last write wins per cookie name. */
function cookieHeaderFrom(res, prior = "") {
  const jar = {};
  for (const part of prior.split(";")) {
    const [k, ...v] = part.trim().split("=");
    if (k) jar[k] = v.join("=");
  }
  const raw = res.headers["Set-Cookie"];
  const list = Array.isArray(raw) ? raw : raw ? [raw] : [];
  for (const sc of list) {
    const first = String(sc).split(";")[0];
    const [k, ...v] = first.split("=");
    if (k) jar[k.trim()] = v.join("=");
  }
  return Object.entries(jar)
    .map(([k, v]) => `${k}=${v}`)
    .join("; ");
}
