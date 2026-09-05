# Load, stress and concurrency testing

Two suites, two questions.

| Suite | Question | Tool |
|---|---|---|
| `load/k6/friday.js` | How fast, at how many users | Grafana k6 |
| `load/concurrency.ts` | When N people do the same thing at once, do the invariants hold | tsx + pg |

Neither is a unit test. Both need a running server and a database they are
allowed to hammer.

## Isolated acceptance run

From the repository root, `docker compose -f app/load/compose.acceptance.yml -p friday-review up -d`
starts a separate disposable PostgreSQL database on 55433 and Soketi on 6001.
Existing staging containers and databases are untouched. Then, from `app/`:

```bash
npm run acceptance:local -- prepare
npm run acceptance:local -- build
npm run acceptance:local -- start
# In another terminal:
npm run acceptance:local -- test
npm run acceptance:local -- concurrency
```

The runner fixes the database to `127.0.0.1:55433/friday_review` and the app to
`http://localhost:3100`, disables model keys and S3 uploads, and configures the
local broker. `prepare` replaces only that disposable database. Optional
`npm run acceptance:local -- scale` tops up to 800 projects; `scale --clean`
removes its marked fixtures. Do not run performance measurements alongside
builds or the acceptance suite.

Both load suites reject non-loopback app origins and refuse HTTP redirects.
The concurrency suite also rejects non-loopback databases, connection-query
overrides, and databases outside its explicit test-name allowlist. It requires
`FRIDAY_LOAD_TARGET=host:port/database?schema=public` to match the exact URL.
The local runner supplies this for its fixed target. `npm run test:load` checks
these guards offline; `npm run test:realtime` checks the transport restriction.
All three harnesses verify `/api/acceptance-target` before logging in. This
test-only endpoint returns 404 unless the running server's own `DATABASE_URL`
passes the local guard and matches its `FRIDAY_LOAD_TARGET`. A localhost app
pointing at Neon therefore cannot be mistaken for the disposable test server.
Hosted Pusher keeps TLS; `PUSHER_HOST`/`PUSHER_PORT` and the corresponding
`NEXT_PUBLIC_` variables accept plain transport only on loopback.

CI runs Soketi as a service. The realtime journey must connect and receive an
invalidation; it fails when the broker is missing rather than skipping.

## Never against the demo

The Vercel deployment talks to Neon, and Neon is the database Ali Reza sees.
A load test there exhausts Neon's compute budget, pollutes the demo data, and
— on `/api/agent` — bills a provider request per call. Run against a local
production build over a throwaway Postgres:

```bash
# throwaway database (55432, because a native Windows Postgres may own 5432)
docker run -d --name friday-staging -e POSTGRES_USER=friday -e POSTGRES_PASSWORD=friday \
  -e POSTGRES_DB=friday_staging -p 55432:5432 postgres:16-alpine

export DATABASE_ADAPTER=pg
export DATABASE_URL=postgresql://friday:friday@localhost:55432/friday_staging
export FRIDAY_DEMO_SEED_ALLOW=I_UNDERSTAND_THIS_REPLACES_DEMO_DATA
export FRIDAY_DEMO_SEED_TARGET='localhost:55432/friday_staging?schema=public'
export FRIDAY_LOAD_TARGET='localhost:55432/friday_staging?schema=public'

npx prisma migrate deploy
npx tsx prisma/seed-demo.ts && npx tsx prisma/seed-demo-account.ts && npx tsx prisma/seed-ai-files.ts

npm run build
NEXTAUTH_URL=http://localhost:3100 AUTH_URL=http://localhost:3100 AUTH_TRUST_HOST=true \
  NODE_ENV=production npx next start -p 3100
```

`DATABASE_ADAPTER=pg` selects node-postgres instead of the Neon WebSocket
driver. Plain Postgres cannot speak Neon's protocol, and neither can Aurora —
so this switch is also the production path, not a test convenience.

## k6

Install: `winget install GrafanaLabs.k6` (or the release zip). Then:

```bash
npm run load:smoke    # 2 VUs, 30 s   — does anything work
npm run load:load     # →30 VUs, 2 m  — the whole studio online at once
npm run load:stress   # 50→100→150    — where does it bend
npm run load:spike    # 0→150 in 10 s — does it recover
npm run load:soak     # 25 VUs, 4 m   — does anything leak (a real soak is hours)
```

Set `BASE_URL` if not `http://localhost:3000`, and set `FRIDAY_LOAD_TARGET` to
the exact identifier configured on the test server. Summaries land in
`load/k6/results/<scenario>.json` (ignored by git).

Thresholds are the product's stated targets from `MEMORY.md` — p95 ≤ 200 ms,
error rate < 1 % — so a failing threshold is a finding, not a broken test.
Latency thresholds are evaluated on `status:200` responses only: an
authorization denial is answered in milliseconds and would flatter the
percentile of the requests that actually did work.

### Run with nothing else on the machine

k6, the server and the database all share one box here, so anything else that
runs during a scenario is measured as product latency. The first honest load
run came out twice as slow as its predecessor at the same 30 users — p50
572 ms against 105 ms — because a full test sweep, `tsc` and eslint were
running alongside it for the commit. Nothing was wrong with the build; the
laptop was busy. Treat a run as void if anything heavier than `cat` ran during
it, and warm the process with a smoke run first so JIT and connection-pool
warm-up are not attributed to the first scenario.

### Authorization is modelled, not counted as failure

`authorize()` limits team workload and every AI surface to managers and above,
and conversations to assignment (including directors). Every project returned
by the region-filtered list must open successfully. Three of the eight k6 accounts are below
manager, so roughly a third of their requests to those routes are correctly
refused. The first run counted every one of those 403s as a failed request — a
17 % "error rate" that was authorization holding under load. Each request now
declares whether its role predicts a denial; a predicted 403 is recorded in
`authz_denied_expected` (visible, because a sudden change there is a
regression) and excluded from `http_req_failed`. An unpredicted 403 still
fails the run. A predicted denial also requires 403: an unexpected 200 fails
the dedicated 100% authorisation threshold. Chat writes accept the endpoint's
200/201 success responses or 429 throttling for writers, and require 403 for
read-only interns, with their own 100% check gate.

### What k6 deliberately does not do

**`/api/agent` is never called.** Each call is a paid provider request and the
route is serialised to one in-flight request per user by design. The
concurrency suite covers its guard contract with a handful of requests.

**Writes are off unless `WRITES=1`.** Twelve routes use an in-memory rate
limiter keyed by client IP: chat messages 60/min, channel creation 10/min,
credentials login 10/min. A load test from one machine measures that limiter,
not the write path. Two consequences worth knowing:

- k6 logs in eight accounts once in `setup()` and never again. Nine would sit
  on the login limit; a per-iteration login would fail on the eleventh.
- The limiter is per serverless instance, so on Vercel it does not actually
  bound anything globally — and the whole Sion office sits behind one NAT, so
  in production it caps the *entire studio* at 60 chat messages a minute.

## Concurrency

```bash
DATABASE_URL=postgresql://friday:friday@localhost:55432/friday_staging \
FRIDAY_LOAD_TARGET='localhost:55432/friday_staging?schema=public' \
BASE_URL=http://localhost:3100 npm run test:concurrency
```

Six scenarios (seven checks), checked against the database after the burst, not just
against the HTTP statuses:

| | Race | Invariant |
|---|---|---|
| T1 | 8× same user → `/api/agent`, no provider | all 503, no quota charged or lease taken |
| T2 | 25× same user → `/api/agent`, no provider | all 503, no quota charged or lease taken |
| T3 | 10× same reaction toggle, initially absent and present | all 2xx, ≤ 1 row |
| T4 | 10× open the same DM from both sides | exactly one direct channel |
| T5 | 10× add the same guest to a channel | exactly one membership row |
| T6 | 20 writes ∥ 10 reads on one channel | no 5xx, every 2xx persisted once |

The suite refuses to run unless `/api/ai-status` explicitly confirms that no
provider is configured. These availability probes cannot bill a model and do
not claim to measure provider-on lease contention or quota ceilings. Exact
provider-on response counts depend on scheduling and immediate quota refunds.

Run it when nothing else is hitting the server: T1/T2 assume a clean lease and
quota table (the script clears them for its two users), and the login limiter
is shared with k6's `setup()`.

## Historical baseline (before the harness corrections)

These earlier measurements have not been rerun with the stricter authorisation
checks. They are historical observations, not acceptance evidence for this fix.

One production `next start` process, one laptop (16 logical cores), local
Postgres 16 in Docker, k6 on the same machine. Not Vercel: there, instances
scale horizontally, so the ceiling below is per instance, not for the product.

| Scenario | Users | req/s | p50 | p95 (200s) | Failures |
|---|---|---|---|---|---|
| load, clean | 30 | 55.6 | 23 ms | **115 ms** | 0 |
| soak, 4 min | 25 | 46.6 | 77 ms | 390 ms | 0 |
| stress | 150 | 40.1 | 1.24 s | 4.5 s | 0 |
| spike, 0→150 in 10 s | 150 | 62.9 | 1.38 s | 4.0 s | 0 |

- **At studio-scale concurrency the 200 ms p95 target is met** — 115 ms at
  30 users on one process, with memory flat at ~245 MB.
- **One process saturates at ~40–45 req/s.** CPU cost measured from process
  samples is 22–25 ms per request under load. Beyond that point latency grows
  as queueing, throughput stays flat, and nothing fails: across every scenario
  there were zero 5xx, zero refused connections and zero error lines in the
  server log. The spike recovered fully; the soak plateaued at ~560 MB with no
  climb.
- **The fixed authorization tax is ~8 ms per request** (`/api/ai-status`, which
  does almost nothing else, at p50 on an idle server) against 12–24 ms for real
  endpoints. It is JWT decode plus four DB round-trips in
  `requirePermission()` — user, session revocation, region access, grants.
  Those four could be one query with the same semantics; on Neon's network
  latency that is the first lever to pull.
- **The soak figure is not a soak.** Four minutes shows warm-up growth and a
  plateau; a leak that takes hours to matter would not appear.

Two earlier 30-user runs reported p95 of 535 ms and 1.9 s. Both were
contaminated by test suites and `tsc` running on the same machine — see
"Run with nothing else on the machine" above. They are kept in
`load/k6/results/load.json` and `load-v2.json` as a record of why that rule
exists.

## What the first run found

Recorded so the next person does not rediscover it.

- **Advisory locks broke under the pg adapter.** `pg_advisory_xact_lock()`
  returns `void`; Neon's driver decodes that, `@prisma/adapter-pg` refuses
  (`UnsupportedNativeDataType`). Every AI request 503'd and DM creation 500'd.
  Fixed by taking the lock via `$executeRaw`, whose result is never decoded and
  was never read anyway. On Aurora this would have been a production outage on
  day one.
- **A missing provider key was a 500, charged to the caller.** `new OpenAI()`
  threw after the quota slot was consumed and before the lease. Twenty-five
  simultaneous requests on a keyless box produced twenty 500s and twenty spent
  slots; `/api/ai-status` meanwhile reported `enabled: true`. Availability is
  now decided before quota, every early exit between quota and lease refunds,
  and `ai-status` reports `providerConfigured`. A structural test asserts the
  ordering and the refunds.
- **Neon's cold start beat Prisma's 2 s transaction start.** After scale-to-
  zero, `SELECT 1` took 1.58 s and the lock transaction ~0.8 s more, so the
  first AI request after a quiet spell failed to start its transaction and the
  guard returned a spurious 503. Lock transactions now allow 10 s to start.
- **Reaction toggles raced to a 500.** `findUnique → create` with a unique
  index: ten simultaneous clicks produced nine unhandled `P2002`s. Fixed by
  treating the duplicate as success — the loser wanted the reaction on, and it
  is.
- **Port 5432 on this machine is owned by a native Windows `postgres.exe`**, so
  `docker-compose.yml`'s Postgres is unreachable from the host here. Hence
  55432.
