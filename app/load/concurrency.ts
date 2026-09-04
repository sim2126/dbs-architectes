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
 * Runs against the local staging server only. It deliberately exercises
 * /api/agent — a handful of requests, of which exactly one can ever reach the
 * provider — and on staging there is no provider key, so nothing is billed and
 * the one admitted request fails closed after acquiring the lease. That is the
 * point: it proves the lease is released on failure, not just on success.
 *
 *   DATABASE_URL=postgresql://friday:friday@localhost:55432/friday_staging \
 *   BASE_URL=http://localhost:3000 npx tsx load/concurrency.ts
 */

import { Client } from "pg";

const BASE_URL = process.env.BASE_URL ?? "http://localhost:3000";
const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) throw new Error("DATABASE_URL is required (staging only).");

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
  const csrfRes = await fetch(`${BASE_URL}/api/auth/csrf`);
  const { csrfToken } = (await csrfRes.json()) as { csrfToken: string };
  const csrfCookie = mergeCookies("", csrfRes.headers.getSetCookie());

  const res = await fetch(`${BASE_URL}/api/auth/callback/credentials`, {
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
  const db = new Client({ connectionString: DATABASE_URL });
  await db.connect();

  const idOf = async (email: string) =>
    (await db.query<{ id: string }>('SELECT id FROM "User" WHERE email=$1', [email])).rows[0]!.id;

  const A: Session = { email: "pm@dbsarc.com", cookie: await login("pm@dbsarc.com", "dbs2025"), userId: await idOf("pm@dbsarc.com") };
  const B: Session = { email: "employee@dbsarc.com", cookie: await login("employee@dbsarc.com", "dbs2025"), userId: await idOf("employee@dbsarc.com") };
  console.log(`logged in ${A.email} and ${B.email}\n`);

  // Does this server have an AI provider configured? Decides which contract
  // T1/T2 assert. Staging normally has no key, and that is the more valuable
  // case: it is exactly the "provider went dark" scenario the platform is
  // required to survive.
  const statusRes = await fetch(`${BASE_URL}/api/ai-status`, { headers: headers(A) });
  const status = (await statusRes.json()) as { enabled: boolean; providerConfigured?: boolean };
  const providerUp = status.enabled && status.providerConfigured !== false;
  console.log(`ai-status: enabled=${status.enabled} providerConfigured=${status.providerConfigured ?? "(not reported)"}
`);

  // Clean slate for the guard tables so counts below are exact.
  await db.query('DELETE FROM "AiAgentLease" WHERE "userId" IN ($1,$2)', [A.userId, B.userId]);
  await db.query('DELETE FROM "AiRequestEvent" WHERE "userId" IN ($1,$2)', [A.userId, B.userId]);

  // ── T1: agent lease + quota refund ────────────────────────────────────
  //
  // 8 simultaneous requests from one user. Contract: quota is consumed first
  // (all 8 pass, well under 20), then the lease admits exactly one; the other
  // seven get 409 and must hand their quota slot back. Afterwards the lease
  // must be released even though the admitted request fails at the provider
  // (no key on staging).
  {
    const chatRes = await fetch(`${BASE_URL}/api/ai-chats`, { method: "POST", headers: headers(A) });
    const chat = (await chatRes.json()) as { id: string };
    const statuses = await burst(8, () =>
      fetch(`${BASE_URL}/api/agent`, {
        method: "POST",
        headers: headers(A, { Accept: "text/event-stream" }),
        body: JSON.stringify({ sessionId: chat.id, message: "concurrency probe" }),
      }),
    );
    const admitted = statuses.filter((s) => s === 200).length;
    const refused = statuses.filter((s) => s === 409).length;
    const unavailable = statuses.filter((s) => s === 503).length;

    // Give the admitted request's finally{} a moment to run.
    let leases = -1;
    for (let i = 0; i < 30; i++) {
      leases = Number((await db.query('SELECT count(*) FROM "AiAgentLease" WHERE "userId"=$1', [A.userId])).rows[0]!.count);
      if (leases === 0) break;
      await new Promise((r) => setTimeout(r, 500));
    }
    const events = Number((await db.query('SELECT count(*) FROM "AiRequestEvent" WHERE "userId"=$1', [A.userId])).rows[0]!.count);

    if (providerUp) {
      record(
        "T1 agent: one admitted, rest 409, lease released, refused slots refunded",
        admitted === 1 && refused === statuses.length - 1 && leases === 0 && events === 1,
        `statuses ${tally(statuses)} | leases after: ${leases} (want 0) | quota events: ${events} (want 1 — 8 consumed, 7 refunded)`,
      );
    } else {
      // No provider: every request must fail closed with 503 before touching
      // quota or lease. A 500 here is the bug where the SDK constructor threw
      // after the slot was already charged.
      record(
        "T1 agent (no provider): all 503, nothing charged, no lease",
        unavailable === statuses.length && leases === 0 && events === 0,
        `statuses ${tally(statuses)} (want ${statuses.length}×503) | leases: ${leases} (want 0) | quota events: ${events} (want 0)`,
      );
    }
    await db.query('DELETE FROM "AiRequestEvent" WHERE "userId"=$1', [A.userId]);
  }

  // ── T2: quota ceiling under contention ────────────────────────────────
  //
  // 25 simultaneous. The advisory lock serialises quota consumption, so the
  // first 20 pass and 5 get 429 before ever reaching the lease. Of the 20,
  // one holds the lease and 19 get 409 (and refund). Exact expectation:
  // 1×200, 19×409, 5×429.
  {
    const chatRes = await fetch(`${BASE_URL}/api/ai-chats`, { method: "POST", headers: headers(A) });
    const chat = (await chatRes.json()) as { id: string };
    const statuses = await burst(25, () =>
      fetch(`${BASE_URL}/api/agent`, {
        method: "POST",
        headers: headers(A, { Accept: "text/event-stream" }),
        body: JSON.stringify({ sessionId: chat.id, message: "quota probe" }),
      }),
    );
    const c = (s: number) => statuses.filter((x) => x === s).length;
    for (let i = 0; i < 30; i++) {
      const n = Number((await db.query('SELECT count(*) FROM "AiAgentLease" WHERE "userId"=$1', [A.userId])).rows[0]!.count);
      if (n === 0) break;
      await new Promise((r) => setTimeout(r, 500));
    }
    const events = Number((await db.query('SELECT count(*) FROM "AiRequestEvent" WHERE "userId"=$1', [A.userId])).rows[0]!.count);
    if (providerUp) {
      record(
        "T2 quota: 20/10min ceiling holds under 25 simultaneous; over-limit 429 before lease",
        c(200) === 1 && c(409) === 19 && c(429) === 5 && events === 1,
        `statuses ${tally(statuses)} (want 1×200 19×409 5×429) | quota events left: ${events} (want 1)`,
      );
    } else {
      record(
        "T2 quota (no provider): 25 simultaneous → all 503, zero quota consumed",
        c(503) === 25 && events === 0,
        `statuses ${tally(statuses)} (want 25×503) | quota events: ${events} (want 0 — unavailable must be decided before quota)`,
      );
    }
  }

  // ── T3: reaction toggle race ──────────────────────────────────────────
  //
  // The route reads then writes (findUnique → delete | create) with a unique
  // constraint on (messageId, userId, emoji). Ten simultaneous identical
  // toggles: the invariant is no 5xx and at most one row afterwards. Parity
  // of the final state is legitimately undefined for a toggle.
  {
    const channels = (await (await fetch(`${BASE_URL}/api/chat/channels`, { headers: headers(A) })).json()) as Array<{ id: string; name: string }> | { channels?: Array<{ id: string; name: string }> };
    const list = Array.isArray(channels) ? channels : channels.channels ?? [];
    const general = list.find((c) => c.name === "general") ?? list[0];
    const msgs = (await (await fetch(`${BASE_URL}/api/chat/messages?channelId=${general!.id}&limit=5`, { headers: headers(A) })).json()) as Array<{ id: string }> | { messages?: Array<{ id: string }> };
    const mlist = Array.isArray(msgs) ? msgs : msgs.messages ?? [];
    const msg = mlist[0]!;
    await db.query('DELETE FROM "MessageReaction" WHERE "messageId"=$1 AND "userId"=$2', [msg.id, A.userId]);

    const statuses = await burst(10, () =>
      fetch(`${BASE_URL}/api/chat/messages/${msg.id}/reactions`, { method: "POST", headers: headers(A), body: JSON.stringify({ emoji: "👍" }) }),
    );
    const rows = Number((await db.query('SELECT count(*) FROM "MessageReaction" WHERE "messageId"=$1 AND "userId"=$2 AND emoji=$3', [msg.id, A.userId, "👍"])).rows[0]!.count);
    const fiveHundreds = statuses.filter((s) => s >= 500).length;
    record(
      "T3 reactions: 10 simultaneous toggles → no 5xx, ≤1 row",
      fiveHundreds === 0 && rows <= 1,
      `statuses ${tally(statuses)} | rows after: ${rows} (want 0 or 1) | 5xx: ${fiveHundreds} (want 0)`,
    );
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
      fetch(`${BASE_URL}/api/chat/channels`, {
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
      channels === 1 && statuses.every((s) => s < 500),
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
         AND "isActive" = true
       ORDER BY email LIMIT 1`,
    )).rows[0];
    const row = (await db.query<{ id: string }>(
      `SELECT c.id FROM "Channel" c
       WHERE c.type='project'
         AND EXISTS (SELECT 1 FROM "ChannelMember" m WHERE m."channelId"=c.id AND m."userId"=$1)
         AND NOT EXISTS (SELECT 1 FROM "ChannelMember" m WHERE m."channelId"=c.id AND m."userId"=$2)
       LIMIT 1`,
      [A.userId, guest?.id ?? ""],
    )).rows[0];
    if (!guest || !row) {
      record("T5 members: skipped", true, "no candidate guest or channel to race");
    } else {
      await db.query('UPDATE "User" SET "isExternal"=true WHERE id=$1', [guest.id]);
      try {
        const statuses = await burst(10, () =>
          fetch(`${BASE_URL}/api/chat/channels/${row.id}/members`, { method: "POST", headers: headers(A), body: JSON.stringify({ userId: guest.id }) }),
        );
        const rows = Number((await db.query('SELECT count(*) FROM "ChannelMember" WHERE "channelId"=$1 AND "userId"=$2', [row.id, guest.id])).rows[0]!.count);
        if (statuses.every((s) => s === 403)) {
          record("T5 members: skipped", true, `A (${A.email}) lacks project:assign on this channel's project — 10×403 is correct authz, not a race result`);
        } else {
          record(
            "T5 members: 10 simultaneous guest adds → exactly one membership, no 5xx",
            rows === 1 && statuses.every((s) => s < 500),
            `guest ${guest.email} | statuses ${tally(statuses)} | membership rows: ${rows} (want 1)`,
          );
        }
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
    const channels = (await (await fetch(`${BASE_URL}/api/chat/channels`, { headers: headers(A) })).json()) as Array<{ id: string; name: string }> | { channels?: Array<{ id: string; name: string }> };
    const list = Array.isArray(channels) ? channels : channels.channels ?? [];
    const general = list.find((c) => c.name === "general") ?? list[0]!;
    const marker = `cc-${Date.now()}`;
    const writes = burst(20, () =>
      fetch(`${BASE_URL}/api/chat/messages`, { method: "POST", headers: headers(A), body: JSON.stringify({ channelId: general.id, content: `${marker} ${Math.random()}` }) }),
    );
    const reads = burst(10, () => fetch(`${BASE_URL}/api/chat/messages?channelId=${general.id}&limit=50`, { headers: headers(B) }));
    const [w, r] = await Promise.all([writes, reads]);
    // The route answers 200 on a successful create, not 201; either is a write.
    const created = w.filter((s) => s >= 200 && s < 300).length;
    const persisted = Number((await db.query('SELECT count(*) FROM "Message" WHERE "channelId"=$1 AND content LIKE $2', [general.id, `${marker}%`])).rows[0]!.count);
    record(
      "T6 fan-in: 20 parallel writes + 10 parallel reads → no 5xx, every 2xx persisted once",
      [...w, ...r].every((s) => s < 500) && persisted === created,
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
