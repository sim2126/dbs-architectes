/**
 * Concurrency-correctness tests.
 *
 * Different question from the k6 suite. k6 asks "how fast, at how many users".
 * This asks "when N people do the same thing at the same instant, does the
 * system hold its invariants" — the races that a throughput test never
 * notices because it never checks the database afterwards.
 *
 * Each test fires N genuinely parallel requests (Promise.all over fetch, not
 * sequential), then verifies the outcome two ways: the HTTP statuses that came
 * back, and the rows actually in the database. A test that only looked at
 * statuses would pass a race that wrote duplicate rows and returned 200 to
 * both writers.
 *
 * Runs against an attested disposable local server with no AI provider.
 * The availability probes assert that concurrent /api/agent requests fail
 * before consuming quota or acquiring leases. They do not test provider-on
 * lease contention or quota ceilings, and must never make paid model calls.
 *
 *   DATABASE_URL=postgresql://friday:friday@localhost:55432/friday_staging \
 *   BASE_URL=http://localhost:3000 npx tsx load/concurrency.ts
 */

import { Client } from "pg";
import { assertLocalBaseUrl, assertLocalDatabaseTarget, assertServerTarget } from "./target-safety.mjs";
import { assertNoProvider } from "./provider-safety";

const BASE_URL = assertLocalBaseUrl(process.env.BASE_URL ?? "http://localhost:3000");
const DATABASE_URL = assertLocalDatabaseTarget(process.env);

// A local app must not redirect a probe (or its credentials) to another host.
const localFetch = (input: string, init?: RequestInit) => fetch(input, { ...init, redirect: init?.redirect ?? "error" });

type Session = { email: string; cookie: string; userId: string };
type Outcome = { name: string; pass: boolean; detail: string };
const outcomes: Outcome[] = [];

function record(name: string, pass: boolean, detail: string) {
  const why = !pass && lastFailureBody ? ` | server said: ${lastFailureBody}` : "";
  outcomes.push({ name, pass, detail: detail + why });
  console.log(`${pass ? "PASS" : "FAIL"}  ${name}\n      ${detail}${why}`);
}

// ── Auth (same flow as the sign-in form) ────────────────────────────────

async function login(email: string, password: string): Promise<string> {
  const csrfRes = await localFetch(`${BASE_URL}/api/auth/csrf`);
  const { csrfToken } = (await csrfRes.json()) as { csrfToken: string };
  const csrfCookie = mergeCookies("", csrfRes.headers.getSetCookie());

  const res = await localFetch(`${BASE_URL}/api/auth/callback/credentials`, {
    method: "POST",
    redirect: "manual",
    headers: { "Content-Type": "application/x-www-form-urlencoded", Cookie: csrfCookie },
    body: new URLSearchParams({ csrfToken, email, password, mfaCode: "", redirect: "false", json: "true" }),
  });
  const cookie = mergeCookies(csrfCookie, res.headers.getSetCookie());
  if (!/session-token=/.test(cookie)) {
    throw new Error(`login failed for ${email}: HTTP ${res.status}`);
  }
  return cookie;
}

function mergeCookies(prior: string, setCookies: string[]): string {
  const jar = new Map<string, string>();
  for (const part of prior.split(";")) {
    const [k, ...v] = part.trim().split("=");
    if (k) jar.set(k, v.join("="));
  }
  for (const sc of setCookies) {
    const [k, ...v] = sc.split(";")[0]!.split("=");
    if (k) jar.set(k.trim(), v.join("="));
  }
  return [...jar].map(([k, v]) => `${k}=${v}`).join("; ");
}

function headers(s: Session, extra: Record<string, string> = {}) {
  return { Cookie: s.cookie, "Content-Type": "application/json", "X-Load-Test": "concurrency", ...extra };
}

/** First non-2xx body seen by the most recent burst(), so a FAIL says why. */
let lastFailureBody = "";

async function burst(n: number, make: () => Promise<Response>): Promise<number[]> {
  lastFailureBody = "";
  const results = await Promise.all(Array.from({ length: n }, () => make().then(async (r) => {
    const sse = (r.headers.get("content-type") ?? "").includes("event-stream");
    if (r.status >= 400 && !lastFailureBody && !sse) {
      try { lastFailureBody = (await r.text()).slice(0, 200); } catch { /* ignore */ }
    } else {
      // Drain or cancel so the connection is released; for SSE the status is
      // all we need and reading the stream would wait on the model.
      try { await r.body?.cancel(); } catch { /* already closed */ }
    }
    return r.status;
  })));
  return results;
}

function tally(statuses: number[]): string {
  const m = new Map<number, number>();
  for (const s of statuses) m.set(s, (m.get(s) ?? 0) + 1);
  return [...m].sort(([a], [b]) => a - b).map(([s, c]) => `${c}×${s}`).join(" ");
}

// ── Tests ────────────────────────────────────────────────────────────────

async function main() {
  const attestation = await localFetch(`${BASE_URL}/api/acceptance-target`);
  if (!attestation.ok) throw new Error("The server must attest its local database before concurrency probes may run.");
  assertServerTarget(await attestation.json(), process.env.FRIDAY_LOAD_TARGET);
  const db = new Client({ connectionString: DATABASE_URL });
  await db.connect();

  const idOf = async (email: string) =>
    (await db.query<{ id: string }>('SELECT id FROM "User" WHERE email=$1', [email])).rows[0]!.id;

  const A: Session = { email: "pm@dbsarc.com", cookie: await login("pm@dbsarc.com", "dbs2025"), userId: await idOf("pm@dbsarc.com") };
  const B: Session = { email: "employee@dbsarc.com", cookie: await login("employee@dbsarc.com", "dbs2025"), userId: await idOf("employee@dbsarc.com") };
  console.log(`logged in ${A.email} and ${B.email}\n`);

  // Require an explicit no-provider response before changing guard tables or
  // posting any agent request. A disabled UI alone does not prove no key exists.
  const statusRes = await localFetch(`${BASE_URL}/api/ai-status`, { headers: headers(A) });
  const status: unknown = await statusRes.json().catch(() => null);
  assertNoProvider(statusRes.status, status);
  console.log("ai-status: provider absence verified\n");

  // Clean slate for the guard tables so counts below are exact.
  await db.query('DELETE FROM "AiAgentLease" WHERE "userId" IN ($1,$2)', [A.userId, B.userId]);
  await db.query('DELETE FROM "AiRequestEvent" WHERE "userId" IN ($1,$2)', [A.userId, B.userId]);

  // T1: no-provider availability at eight concurrent requests
  //
  // Eight concurrent requests must all fail before quota or lease acquisition.
  // This checks unavailable-provider behaviour, not provider-on admission.
  {
    const chatRes = await localFetch(`${BASE_URL}/api/ai-chats`, { method: "POST", headers: headers(A) });
    const chat = (await chatRes.json()) as { id: string };
    const statuses = await burst(8, () =>
      localFetch(`${BASE_URL}/api/agent`, {
        method: "POST",
        headers: headers(A, { Accept: "text/event-stream" }),
        body: JSON.stringify({ sessionId: chat.id, message: "concurrency probe" }),
      }),
    );
    const unavailable = statuses.filter((s) => s === 503).length;

    const leases = Number((await db.query('SELECT count(*) FROM "AiAgentLease" WHERE "userId"=$1', [A.userId])).rows[0]!.count);
    const events = Number((await db.query('SELECT count(*) FROM "AiRequestEvent" WHERE "userId"=$1', [A.userId])).rows[0]!.count);

    record(
      "T1 AI unavailable: 8 simultaneous, all 503, no quota or lease",
      unavailable === statuses.length && leases === 0 && events === 0,
      `statuses ${tally(statuses)} (want ${statuses.length}×503) | leases: ${leases} (want 0) | quota events: ${events} (want 0)`,
    );
  }

  // T2: no-provider availability at twenty-five concurrent requests
  //
  // Twenty-five concurrent requests exercise the same unavailable-provider
  // contract above the normal quota size; none may consume a quota slot.
  {
    const chatRes = await localFetch(`${BASE_URL}/api/ai-chats`, { method: "POST", headers: headers(A) });
    const chat = (await chatRes.json()) as { id: string };
    const statuses = await burst(25, () =>
      localFetch(`${BASE_URL}/api/agent`, {
        method: "POST",
        headers: headers(A, { Accept: "text/event-stream" }),
        body: JSON.stringify({ sessionId: chat.id, message: "quota probe" }),
      }),
    );
    const unavailable = statuses.filter((s) => s === 503).length;
    const leases = Number((await db.query('SELECT count(*) FROM "AiAgentLease" WHERE "userId"=$1', [A.userId])).rows[0]!.count);
    const events = Number((await db.query('SELECT count(*) FROM "AiRequestEvent" WHERE "userId"=$1', [A.userId])).rows[0]!.count);
    record(
      "T2 AI unavailable: 25 simultaneous, all 503, no quota or lease",
      unavailable === 25 && leases === 0 && events === 0,
      `statuses ${tally(statuses)} (want 25×503) | leases: ${leases} (want 0) | quota events: ${events} (want 0)`,
    );
  }

  // ── T3: reaction toggle race ──────────────────────────────────────────
  //
  // The route reads then writes (findUnique → delete | create) with a unique
  // constraint on (messageId, userId, emoji). Ten simultaneous identical
  // toggles: the invariant is no 5xx and at most one row afterwards. Parity
  // of the final state is legitimately undefined for a toggle.
  {
    const channels = (await (await localFetch(`${BASE_URL}/api/chat/channels`, { headers: headers(A) })).json()) as Array<{ id: string; name: string }> | { channels?: Array<{ id: string; name: string }> };
    const list = Array.isArray(channels) ? channels : channels.channels ?? [];
    const general = list.find((c) => c.name === "general") ?? list[0];
    const msgs = (await (await localFetch(`${BASE_URL}/api/chat/messages?channelId=${general!.id}&limit=5`, { headers: headers(A) })).json()) as Array<{ id: string }> | { messages?: Array<{ id: string }> };
    const mlist = Array.isArray(msgs) ? msgs : msgs.messages ?? [];
    const msg = mlist[0]!;
    for (const initiallyPresent of [false, true]) {
      await db.query('DELETE FROM "MessageReaction" WHERE "messageId"=$1 AND "userId"=$2 AND emoji=$3', [msg.id, A.userId, "👍"]);
      const toggleReaction = () => localFetch(`${BASE_URL}/api/chat/messages/${msg.id}/reactions`, {
        method: "POST", headers: headers(A), body: JSON.stringify({ emoji: "👍" }),
      });
      if (initiallyPresent) {
        const initial = await toggleReaction();
        if (!initial.ok) throw new Error(`Could not prepare existing reaction: HTTP ${initial.status}`);
      }
      const statuses = await burst(10, toggleReaction);
      const rows = Number((await db.query('SELECT count(*) FROM "MessageReaction" WHERE "messageId"=$1 AND "userId"=$2 AND emoji=$3', [msg.id, A.userId, "👍"])).rows[0]!.count);
      record(
        `T3 reactions (initially ${initiallyPresent ? "present" : "absent"}): 10 simultaneous toggles`,
        statuses.every((status) => status >= 200 && status < 300) && rows <= 1,
        `statuses ${tally(statuses)} | rows after: ${rows} (want 0 or 1)`,
      );
    }
  }

  // ── T4: direct-message creation race ──────────────────────────────────
  //
  // A and B each try five times at once to open a DM with the other. The
  // route serialises on pg_advisory_xact_lock over the sorted participant
  // key, so exactly one direct channel containing both must exist afterwards.
  {
    await db.query(
      `DELETE FROM "Channel" WHERE type='direct' AND id IN (
         SELECT "channelId" FROM "ChannelMember" WHERE "userId" IN ($1,$2)
         GROUP BY "channelId" HAVING count(DISTINCT "userId")=2)`,
      [A.userId, B.userId],
    );
    const mk = (s: Session, other: Session) => () =>
      localFetch(`${BASE_URL}/api/chat/channels`, {
        method: "POST",
        headers: headers(s),
        body: JSON.stringify({ name: `dm-${s.userId}-${other.userId}`, type: "direct", memberIds: [s.userId, other.userId] }),
      });
    const statuses = await Promise.all([burst(5, mk(A, B)), burst(5, mk(B, A))]).then((x) => x.flat());
    const channels = Number((await db.query(
      `SELECT count(*) FROM (
         SELECT c.id FROM "Channel" c
         JOIN "ChannelMember" m ON m."channelId"=c.id
         WHERE c.type='direct' AND m."userId" IN ($1,$2)
         GROUP BY c.id HAVING count(DISTINCT m."userId")=2) t`,
      [A.userId, B.userId],
    )).rows[0]!.count);
    record(
      "T4 DM: 10 simultaneous opens from both sides → exactly one direct channel",
      channels === 1 && statuses.every((s) => s >= 200 && s < 300),
      `statuses ${tally(statuses)} | direct channels A↔B: ${channels} (want 1)`,
    );
  }

  // ── T5: add-member race ───────────────────────────────────────────────
  //
  // The members endpoint admits GUESTS to a project channel; internal
  // colleagues join through project assignment and are refused here by design
  // (the first run of this suite racing an internal user proved exactly that
  // with ten 400s). So the race is: one wider-team user is marked external for
  // the duration of the test, and ten simultaneous adds of that guest hit one
  // project channel. The route upserts on (channelId, userId), so exactly one
  // membership row must result, with no 5xx.
  {
    const guest = (await db.query<{ id: string; email: string }>(
      `SELECT id, email FROM "User"
       WHERE email NOT IN ('owner@dbsarc.com','admin@dbsarc.com','director@dbsarc.com','manager@dbsarc.com',
                           'pm@dbsarc.com','employee@dbsarc.com','partner@dbsarc.com','intern@dbsarc.com',
                           'viewer@dbsarc.com','demo@dbsarc.com')
         AND "isActive" = true AND "isExternal" = false
       ORDER BY email LIMIT 1`,
    )).rows[0];
    const row = (await db.query<{ id: string }>(
      `SELECT c.id FROM "Channel" c JOIN "Project" p ON p.id=c."projectId"
       WHERE c.type='project'
         AND EXISTS (SELECT 1 FROM "ProjectAssignment" a WHERE a."projectId"=p.id AND a."userId"=$1 AND a.role='lead')
         AND (p.country IS NULL OR p.country='' OR EXISTS (
           SELECT 1 FROM "UserRegionAccess" r WHERE r."userId"=$1 AND r.country=p.country
             AND r."accessLevel"='manage' AND (r."operatingRegion" IS NULL OR r."operatingRegion"='' OR r."operatingRegion"=p."operatingRegion")))
         AND NOT EXISTS (SELECT 1 FROM "ChannelMember" m WHERE m."channelId"=c.id AND m."userId"=$2)
       LIMIT 1`,
      [A.userId, guest?.id ?? ""],
    )).rows[0];
    if (!guest || !row) {
      record("T5 members: fixture missing", false, "no internal candidate or project channel the PM may manage");
    } else {
      await db.query('UPDATE "User" SET "isExternal"=true WHERE id=$1', [guest.id]);
      try {
        const statuses = await burst(10, () =>
          localFetch(`${BASE_URL}/api/chat/channels/${row.id}/members`, { method: "POST", headers: headers(A), body: JSON.stringify({ userId: guest.id }) }),
        );
        const rows = Number((await db.query('SELECT count(*) FROM "ChannelMember" WHERE "channelId"=$1 AND "userId"=$2', [row.id, guest.id])).rows[0]!.count);
        record(
          "T5 members: 10 simultaneous guest adds → exactly one membership, all 2xx",
          rows === 1 && statuses.every((s) => s >= 200 && s < 300),
          `guest ${guest.email} | statuses ${tally(statuses)} | membership rows: ${rows} (want 1)`,
        );
      } finally {
        // Staging is throwaway, but leave the fixture as it was found.
        await db.query('DELETE FROM "ChannelMember" WHERE "channelId"=$1 AND "userId"=$2', [row.id, guest.id]);
        await db.query('UPDATE "User" SET "isExternal"=false WHERE id=$1', [guest.id]);
      }
    }
  }

  // ── T6: parallel writers, one reader ──────────────────────────────────
  //
  // 20 messages posted simultaneously to one channel (under the 60/min
  // limiter) while another user reads. Invariant: no 5xx, and every message
  // that returned 201 is present exactly once.
  {
    const channels = (await (await localFetch(`${BASE_URL}/api/chat/channels`, { headers: headers(A) })).json()) as Array<{ id: string; name: string }> | { channels?: Array<{ id: string; name: string }> };
    const list = Array.isArray(channels) ? channels : channels.channels ?? [];
    const general = list.find((c) => c.name === "general") ?? list[0]!;
    const marker = `cc-${Date.now()}`;
    const writes = burst(20, () =>
      localFetch(`${BASE_URL}/api/chat/messages`, { method: "POST", headers: headers(A), body: JSON.stringify({ channelId: general.id, content: `${marker} ${Math.random()}` }) }),
    );
    const reads = burst(10, () => localFetch(`${BASE_URL}/api/chat/messages?channelId=${general.id}&limit=50`, { headers: headers(B) }));
    const [w, r] = await Promise.all([writes, reads]);
    // The route answers 200 on a successful create, not 201; either is a write.
    const created = w.filter((s) => s >= 200 && s < 300).length;
    const persisted = Number((await db.query('SELECT count(*) FROM "Message" WHERE "channelId"=$1 AND content LIKE $2', [general.id, `${marker}%`])).rows[0]!.count);
    record(
      "T6 fan-in: 20 parallel writes + 10 parallel reads → no 5xx, every 2xx persisted once",
      w.every((s) => s === 200 || s === 201 || s === 429) &&
        r.every((s) => s >= 200 && s < 300) && created > 0 && persisted === created,
      `writes ${tally(w)} | reads ${tally(r)} | persisted: ${persisted} of ${created} created`,
    );
  }

  await db.end();

  const failed = outcomes.filter((o) => !o.pass);
  console.log(`\n${outcomes.length - failed.length}/${outcomes.length} invariants held.`);
  process.exit(failed.length ? 1 : 0);
}

main().catch((e) => {
  console.error("concurrency suite crashed:", e);
  process.exit(2);
});
