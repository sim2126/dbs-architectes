/** Shared by Node and k6. Validate before login or any database connection. */
export function assertLocalBaseUrl(value) {
  const match = /^http:\/\/(localhost|127\.0\.0\.1|\[::1\]):([1-9]\d{0,4})\/?$/.exec(value ?? "");
  if (!match || match[0] !== value || Number(match[2]) > 65535) {
    throw new Error("Load tests require an explicit loopback HTTP origin and port; remote targets and redirects are refused.");
  }
  return value.replace(/\/$/, "");
}

export function assertLoadTargetIdentifier(value) {
  const match = /^(localhost|127\.0\.0\.1|\[::1\]):([1-9]\d{0,4})\/friday_(staging|e2e|ci|review)\?schema=public$/.exec(value ?? "");
  if (!match || match[0] !== value || Number(match[2]) > 65535) {
    throw new Error("Set FRIDAY_LOAD_TARGET to the exact disposable loopback host:port/database?schema=public.");
  }
  return value;
}

/** A loopback app can still be connected to a remote database: verify both. */
export function assertServerTarget(body, expected) {
  assertLoadTargetIdentifier(expected);
  if (!body || typeof body !== "object" || body.target !== expected) {
    throw new Error("The server did not attest the expected local database; no test logins or writes are allowed.");
  }
}

export function assertLocalDatabaseTarget(env) {
  if ([env.APP_ENV, env.FRIDAY_ENVIRONMENT, env.VERCEL_ENV].some((v) => v?.toLowerCase() === "production")) {
    throw new Error("Load tests are disabled in production environments.");
  }
  let target;
  try { target = new URL(env.DATABASE_URL); } catch { throw new Error("A local PostgreSQL DATABASE_URL is required."); }
  const database = decodeURIComponent(target.pathname.slice(1));
  if (!['postgres:', 'postgresql:'].includes(target.protocol) ||
      !['localhost', '127.0.0.1', '[::1]'].includes(target.hostname) ||
      !['friday_staging', 'friday_e2e', 'friday_ci', 'friday_review'].includes(database)) {
    throw new Error("Load tests only accept loopback PostgreSQL databases named friday_staging, friday_e2e, friday_ci or friday_review.");
  }
  // libpq query parameters can override the host/database in the authority.
  if ([...target.searchParams].some(([key, value]) => key !== 'schema' || value !== 'public')) {
    throw new Error("Load-test database URLs only permit schema=public; connection overrides are refused.");
  }
  const identifier = `${target.hostname}:${target.port || '5432'}/${database}?schema=public`;
  if (env.FRIDAY_LOAD_TARGET !== identifier) {
    throw new Error(`Confirm the disposable database with FRIDAY_LOAD_TARGET=${identifier}.`);
  }
  return env.DATABASE_URL;
}
