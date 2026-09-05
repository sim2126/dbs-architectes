// Friday load and stress suite — Grafana k6.
//
// Usage (from app/):
//   k6 run -e BASE_URL=http://localhost:3000 -e SCENARIO=smoke  load/k6/friday.js
//   k6 run -e BASE_URL=http://localhost:3000 -e SCENARIO=load   load/k6/friday.js
//   k6 run -e BASE_URL=http://localhost:3000 -e SCENARIO=stress load/k6/friday.js
//   k6 run -e BASE_URL=http://localhost:3000 -e SCENARIO=spike  load/k6/friday.js
//   k6 run -e BASE_URL=http://localhost:3000 -e SCENARIO=soak   load/k6/friday.js
//
// Method — the standard k6 progression, each stage answering one question:
//   smoke   does the script and the deployment work at all
//   load    the expected concurrency: 30 VUs is the entire DBS studio online
//   stress  well past expected: 50 → 100 → 150 VUs, where does it bend
//   spike   0 → 150 in ten seconds, does it recover
//   soak    moderate load held, does anything leak (shortened here; a real
//           soak runs for hours and this one is minutes — the number is a
//           smoke test of the soak, not the soak)
//
// Thresholds are the product's own stated targets from MEMORY.md, not
// invented: p95 API latency at or under 200 ms steady-state, error rate under
// 1 %. A threshold failing is a finding, not a broken test.
//
// What is deliberately NOT exercised:
//   /api/agent   Every call is a paid provider request and the route is
//                serialised to one in-flight request per user by design. A
//                load test against it measures the guard, not the product,
//                and bills you for the privilege. Its concurrency behaviour is
//                covered by load/concurrency.ts, which asserts the guard's
//                exact contract with a handful of requests.
//   writes       Off by default (-e WRITES=1 enables). The chat write paths
//                are limited to 60/min per IP by an in-memory limiter, so a
//                single-machine load test measures that limiter rather than
//                the write path. Enabling it is useful precisely to observe
//                the limiter under load; the 429s it produces are expected.
//
// Traffic mix models a working day at an architecture practice, not uniform
// endpoint hammering. Each iteration is one person doing one thing.

import http from "k6/http";
import { check, group, sleep } from "k6";
import { Trend, Rate, Counter } from "k6/metrics";
import { textSummary } from "https://jslib.k6.io/k6-summary/0.1.0/index.js";
import { login } from "./lib/auth.js";
import { assertLocalBaseUrl, assertLoadTargetIdentifier, assertServerTarget } from "../target-safety.mjs";
import { accountFor, sessionFor, expectsThreadAccess, expectedReadStatus, expectedWriteStatus } from "./lib/expectations.mjs";

const BASE_URL = assertLocalBaseUrl(__ENV.BASE_URL || "http://localhost:3000");
const TARGET = assertLoadTargetIdentifier(__ENV.FRIDAY_LOAD_TARGET);
const SCENARIO = __ENV.SCENARIO || "smoke";
const WRITES = __ENV.WRITES === "1";

/**
 * One demo login per role, minus viewer. Eight keeps setup() comfortably under
 * the 10/min login limiter even when a manual login preceded the run. Viewer
 * is left out on purpose: several routes correctly answer it 403, and k6
 * counts 4xx as failed requests — a viewer VU would report authorization
 * working as if it were the server breaking.
 */
const ACCOUNTS = [
  "owner",
  "admin",
  "director",
  "manager",
  "pm",
  "employee",
  "partner",
  "intern",
].map(accountFor);

// ── Scenario definitions ─────────────────────────────────────────────────

const SCENARIOS = {
  smoke: {
    executor: "constant-vus",
    vus: 2,
    duration: "30s",
  },
  load: {
    executor: "ramping-vus",
    startVUs: 0,
    stages: [
      { duration: "45s", target: 30 },
      { duration: "2m", target: 30 },
      { duration: "20s", target: 0 },
    ],
    gracefulRampDown: "10s",
  },
  stress: {
    executor: "ramping-vus",
    startVUs: 0,
    stages: [
      { duration: "45s", target: 50 },
      { duration: "60s", target: 100 },
      { duration: "60s", target: 150 },
      { duration: "20s", target: 0 },
    ],
    gracefulRampDown: "10s",
  },
  spike: {
    executor: "ramping-vus",
    startVUs: 0,
    stages: [
      { duration: "10s", target: 150 },
      { duration: "40s", target: 150 },
      { duration: "10s", target: 0 },
    ],
    gracefulRampDown: "10s",
  },
  soak: {
    executor: "constant-vus",
    vus: 25,
    duration: "4m",
  },
};

if (!SCENARIOS[SCENARIO]) {
  throw new Error(`Unknown SCENARIO "${SCENARIO}". One of: ${Object.keys(SCENARIOS).join(", ")}`);
}

export const options = {
  scenarios: { [SCENARIO]: SCENARIOS[SCENARIO] },
  thresholds: {
    // MEMORY.md: p95 API latency ≤ 200 ms steady-state. Measured on 200s only:
    // an authorization denial is answered in a few milliseconds and would
    // flatter the percentile of the requests that actually did work.
    "http_req_duration{status:200}": ["p(95)<200", "p(99)<600"],
    // http_req_failed excludes the 403s declared expected per request below,
    // so this is the rate of *unexpected* failures — 5xx, timeouts, and a 403
    // handed to a role that should have been allowed through.
    http_req_failed: ["rate<0.01"],
    checks: ["rate>0.99"],
    "checks{contract:authorization}": ["rate==1"],
    ...(WRITES ? { "checks{contract:chat-write}": ["rate==1"] } : {}),
    // Per-journey visibility so a regression in one surface is not averaged
    // away by the others. Also on successful responses only.
    "http_req_duration{journey:morning,status:200}": ["p(95)<200"],
    "http_req_duration{journey:portfolio,status:200}": ["p(95)<250"],
    "http_req_duration{journey:chat,status:200}": ["p(95)<200"],
    "http_req_duration{journey:ai-surface,status:200}": ["p(95)<200"],
  },
  // Login cookies are ~1 KB; discard bodies we do not inspect to keep memory
  // flat during the soak.
  discardResponseBodies: false,
  maxRedirects: 0,
  userAgent: "friday-k6/1.0",
};

// ── Custom metrics ───────────────────────────────────────────────────────

const rateLimited = new Counter("rate_limited_responses");
const authRejected = new Counter("auth_rejected_responses");
const serverErrors = new Counter("server_error_responses");
/** 403s the role predicted. Reported, not hidden — a sudden change in this
 *  number is an authorization regression even though no request "failed". */
const authzDenied = new Counter("authz_denied_expected");
const ttfbApi = new Trend("api_ttfb", true);
const jsonOk = new Rate("json_parseable");

// ── Setup: log every account in once ─────────────────────────────────────

export function setup() {
  const attestation = http.get(`${BASE_URL}/api/acceptance-target`, { redirects: 0 });
  if (attestation.status !== 200) throw new Error("The server must attest its local database before load probes may run.");
  assertServerTarget(attestation.json(), TARGET);
  const sessions = ACCOUNTS.map((a) => {
    const cookie = login(BASE_URL, a.email, a.password);
    const identity = http.get(`${BASE_URL}/api/auth/session`, { headers: hdr(cookie) });
    const userId = identity.json("user.id");
    if (identity.status !== 200 || typeof userId !== "string") throw new Error(`Missing session identity for ${a.email}`);
    return sessionFor(a, cookie, userId);
  });
  // Warm one request so the first VU does not pay a cold start that then
  // gets attributed to the product.
  http.get(`${BASE_URL}/api/ai-status`, { headers: hdr(sessions[0].cookie) });
  return { sessions, startedAt: new Date().toISOString() };
}

// ── The iteration: one person, one thing ────────────────────────────────

export default function iteration(data) {
  const session = data.sessions[(__VU - 1) % data.sessions.length];
  const h = hdr(session.cookie);
  const mgr = session.managerPlus;

  // Weighted journey pick. Weights reflect a day in a studio: people check
  // their own work far more than they browse the portfolio, and they read
  // chat far more than they write it.
  const r = Math.random();
  if (r < 0.4) morningCheck(h, mgr);
  else if (r < 0.65) portfolio(h, session);
  else if (r < 0.85) chatRead(h);
  else if (r < 0.97 || !WRITES) aiSurface(h, mgr);
  else chatWrite(h, session);

  // Think time. Real users pause between requests; a test without it is a
  // benchmark of the server's ceiling, not of the experience at N users.
  sleep(0.8 + Math.random() * 1.7);
}

// ── Journeys ─────────────────────────────────────────────────────────────

function morningCheck(h, mgr) {
  group("morning", () => {
    api("GET", "/api/ai-status", h, "ai-status", "morning", (r) => r.json("enabled") !== undefined);
    api("GET", "/api/agenda", h, "agenda", "morning");
    api("GET", "/api/tasks", h, "tasks", "morning");
    // team:workload.read is manager+. Below that, 403 is the right answer.
    api("GET", "/api/team-workload", h, "team-workload", "morning", null, { denied: !mgr });
    api("GET", "/api/activity?limit=20", h, "activity", "morning");
  });
}

function portfolio(h, session) {
  group("portfolio", () => {
    const list = api("GET", "/api/projects", h, "projects", "portfolio");
    api("GET", "/api/projects?phase=CHANTIER", h, "projects?phase", "portfolio");
    const id = firstId(list);
    if (id) {
      // Every listed project must open; its conversation additionally requires assignment.
      const project = (Array.isArray(list) ? list : list.projects).find((p) => p.id === id);
      api("GET", `/api/projects/${id}`, h, "projects/[id]", "portfolio");
      api("GET", `/api/projects/${id}/thread`, h, "projects/[id]/thread", "portfolio", null, { denied: !expectsThreadAccess(session, project) });
      api("GET", `/api/projects/${id}/status-updates`, h, "projects/[id]/status-updates", "portfolio");
    }
  });
}

function chatRead(h) {
  group("chat", () => {
    const channels = api("GET", "/api/chat/channels", h, "chat/channels", "chat");
    const id = firstId(channels);
    if (id) {
      api("GET", `/api/chat/messages?channelId=${id}&limit=50`, h, "chat/messages", "chat");
    }
  });
}

function aiSurface(h, mgr) {
  group("ai-surface", () => {
    // ai:invoke is manager+ by role. Below that the whole surface is 403.
    const opts = { denied: !mgr };
    const chats = api("GET", "/api/ai-chats", h, "ai-chats", "ai-surface", null, opts);
    api("GET", "/api/ai-attachments", h, "ai-attachments", "ai-surface", null, opts);
    const id = firstId(chats);
    if (id) api("GET", `/api/ai-chats/${id}`, h, "ai-chats/[id]", "ai-surface", null, opts);
  });
}

function chatWrite(h, session) {
  group("chat-write", () => {
    const channels = api("GET", "/api/chat/channels", h, "chat/channels", "chat-write");
    const id = firstId(channels);
    if (!id) return;
    const res = http.post(
      `${BASE_URL}/api/chat/messages`,
      JSON.stringify({ channelId: id, content: `k6 ${__VU}-${__ITER} ${Date.now()}` }),
      { headers: { ...h, "Content-Type": "application/json" }, responseCallback: session.canPost ? http.expectedStatuses(200, 201, 429) : http.expectedStatuses(403), tags: { name: "chat/messages POST", kind: "api", journey: "chat-write" } },
    );
    classify(res);
    check(res, { "chat write: expected role response": (r) => expectedWriteStatus(r.status, !session.canPost) }, { contract: "chat-write" });
  });
}

// ── Helpers ──────────────────────────────────────────────────────────────

function hdr(cookie) {
  return { Cookie: cookie, Accept: "application/json", "X-Load-Test": "k6" };
}

/**
 * One API call with the checks every read shares: authenticated, not an
 * error, parseable JSON. Extra per-endpoint assertions come via `extra`.
 * Returns the parsed body or null so a journey can chain on it.
 */
function api(method, path, h, name, journey, extra, opts = {}) {
  const expectDenied = Boolean(opts.denied);
  const res = http.request(method, `${BASE_URL}${path}`, null, {
    headers: h,
    tags: { name, kind: "api", journey },
    // A 403 the role predicts is an expected response and must not count in
    // http_req_failed; one it did not predict still does.
    responseCallback: expectDenied
      ? http.expectedStatuses(403)
      : http.expectedStatuses({ min: 200, max: 299 }),
  });
  if (res.status === 403 && expectDenied) authzDenied.add(1, { name });
  classify(res);
  ttfbApi.add(res.timings.waiting, { name });

  let body = null;
  let parseable = false;
  try {
    body = res.json();
    parseable = true;
  } catch {
    parseable = false;
  }
  jsonOk.add(parseable, { name });

  const ok2xx = res.status >= 200 && res.status < 300;
  const denied = res.status === 403 && expectDenied;
  check(res, {
    [`${name}: ${expectDenied ? "403 required" : "2xx required"}`]: () => expectedReadStatus(res.status, expectDenied),
  }, { contract: "authorization" });
  check(res, {
    [`${name}: json`]: () => parseable,
    // Shape only applies to a successful body.
    ...(extra ? { [`${name}: shape`]: () => denied || safe(() => extra(res)) } : {}),
  });
  return ok2xx ? body : null;
}

function classify(res) {
  if (res.status === 429) rateLimited.add(1);
  else if (res.status === 401 || res.status === 403) authRejected.add(1);
  else if (res.status >= 500) serverErrors.add(1);
}

/** Pulls an id out of the common list shapes: [{id}], {items:[{id}]},
 *  {channels:[{id}]}, {projects:[{id}]}, {sessions:[{id}]}. */
function firstId(body) {
  if (!body) return null;
  const list = Array.isArray(body)
    ? body
    : body.items || body.channels || body.projects || body.sessions || body.data || null;
  const first = Array.isArray(list) ? list[0] : null;
  return first && typeof first.id === "string" ? first.id : null;
}

function safe(fn) {
  try {
    return Boolean(fn());
  } catch {
    return false;
  }
}

// ── Summary: terminal table plus a JSON file for the report ─────────────

export function handleSummary(data) {
  const out = __ENV.SUMMARY_OUT || `load/k6/results/${SCENARIO}.json`;
  return {
    stdout: textSummary(data, { indent: " ", enableColors: true }),
    [out]: JSON.stringify(data, null, 2),
  };
}
