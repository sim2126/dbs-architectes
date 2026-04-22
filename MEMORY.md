# DBS Architectes Friday — Product Memory

> Loaded by `CLAUDE.md`. Read this before reasoning about *what* to build; read `CLAUDE.md` for *how* to build it.

## What we are building

**Friday** is a vertical SaaS workspace for architecture firms — a unified surface for project management, team collaboration, video meetings, BIM/plan handling, and AI-augmented decision support. The first paying customer is **DBS Architectes** (dbsarc.com), a Swiss/Italian firm with offices in Sion, Milano, and a collaborator network in Srinagar.

This is **not a horizontal CRM**. It is purpose-built for the way architecture studios actually work: phase-driven projects, multi-jurisdiction compliance, plan/model artefacts, client demos, and small distributed teams.

### Current surface (production-grade)

- **Projects** — 48 real DBS projects seeded from dbsarc.com, with phases, categories, country/region, geocoded locations, hero images, and assignment graph.
- **Map view** — Google Maps with phase-coloured pins, project info cards, in-app geocoding, and a graceful "coming soon / it's not you" fallback when the key is unset.
- **Statistics dashboard** — country-filterable workload, phase distribution, category breakdown, computed reactively client-side.
- **Chat & threads** — channels, project-scoped threads, real-time via Pusher, reactions, mentions.
- **Calls** — Daily.co video with whiteboard, screen share, in-call chat, transcription, recording.
- **AI meeting summarizer** — two-tier (Read-AI-style simple; DBS-grounded detailed), GPT-4o-mini, with rolling per-project memory and shareable public links.
- **Activity feed** — full audit trail across projects, users, and chat.
- **Sheets sync** — bidirectional bridge with Google Sheets for project metadata.
- **Integrations** — Google Workspace (Calendar, Drive), Pusher, OpenAI.
- **Auth & permissions** — NextAuth, role-based (super_admin / admin / project_manager / employee), with adminOnly nav gating.

### Tech baseline

- Next.js 16 (Turbopack) — read `node_modules/next/dist/docs/` before assuming APIs.
- Prisma 7 + PostgreSQL (Neon for demo, **AWS Aurora Serverless v2 for production**).
- TypeScript strict, line-level unit tests on every merge.
- Demo: Vercel + Neon. Production target: **AWS** (ECS Fargate, Aurora Serverless v2, S3 + CloudFront, Bedrock for AI residency, EU region).

---

## What we are aiming to beat — and how

We are not trying to out-feature Monday.com, ClickUp, or Asana. We are trying to make horizontal CRMs feel *generic* the moment an architect uses Friday. The thesis is **vertical depth + AI grounding + zero ceremony**.

### Concrete targets

| Dimension | Friday target | Reference |
|---|---|---|
| **p95 page latency** | < 200 ms | Linear: ~250 ms; Monday: ~500 ms+ |
| **First Meaningful Paint (cold)** | < 1.2 s | Notion: ~2.5 s; Monday: ~3 s |
| **Concurrent user capacity** | 10,000+ at p95 < 200 ms | Sized for 20× DBS's ceiling of ~500 |
| **AI summary grounding accuracy** | ≥ 95% correct user-ID resolution, ≥ 90% correct project-ID resolution | Read AI: ~70% (no domain context) |
| **AI summary latency** | < 30 s for simple, < 60 s for detailed | Read AI: 2–5 min |
| **Onboarding time (new firm)** | < 30 min from contract to first real project | Monday: days, with a CSM |
| **Cognitive surface area** | One workspace, one nav, one search | vs Monday's plugin marketplace |
| **Uptime** | Industry-standard SLA targets for SaaS collaboration platforms | — |
| **Data residency** | EU-resident option (Frankfurt/Zurich), customer-managed KMS keys | Monday: US-default, EU as upsell |

### Where we win on accuracy

- **AI is grounded, not generic.** Meeting summaries inject the actual project graph, team roster, last 40 thread messages, prior `ProjectMeetingMemory`, and the last 3 summaries before generation. The model resolves "Giulio" to a real `User.id`, not a string. Conflicts with prior decisions are flagged inline.
- **Rolling memory per project.** `ProjectMeetingMemory` accumulates condensed decisions across meetings (capped at 8000 chars, 50 decisions). Future summaries reason against that lineage.
- **Domain primitives in the schema.** `phase`, `category`, `commune`, `regionCode`, `typology`, `workStatus` — not generic "status / tag / priority". The DB knows what an architecture project is.
- **Real data, real demo.** 48 real projects + 30 real team members + scraped hero images mean every demo lands as plausible from the first click. No lorem-ipsum.

### Where we win on efficiency

- **Reactive client-side filtering** — country switcher in Statistics has zero network round-trips.
- **CDN-first asset delivery** — project images, plans, recordings served from edge.
- **Server-side proxies for browser-bound secrets** — `/api/maps/config` removes the `NEXT_PUBLIC_*` build-inlining requirement; same pattern applies to any future browser-side credential.
- **Daily.co for video** — we do not own WebRTC infrastructure. Production stability is a SaaS provider's problem, not ours.
- **Optimistic UI + autosave by default** — no "lost work" demos. Ever.

### Where we win on UX

- **Quiet aesthetic.** The landing page deliberately echoes dbsarc.com — `bg-#fafaf8`, light serif italics, no marketing scream. Architects respect restraint; Monday's UI shouts.
- **One workspace, not a plugin marketplace.** Every feature ships first-class, in-product. No third-party Calendly bolt-ons for booking; no separate Loom for clips.
- **Multi-language.** FR / IT / EN at minimum, because this is European architecture practice, not Silicon Valley.

---

## What we are explicitly NOT building

- A horizontal CRM for any-industry use. Every design decision optimises for architecture firms.
- An AI chatbot you have to prompt. Every AI feature is invoked at the natural workflow seam (after a meeting, when reviewing a thread, when planning a phase).
- A Monday-style "automation marketplace". Workflows ship as opinionated defaults; configurability is earned by user demand, not added speculatively.
- A self-serve signup funnel before the product is enterprise-ready. DBS-class customers come through trusted introductions and proof-of-value pilots.

---

## Definition of "production-grade" on this codebase

A change is production-grade when **all** of the following hold:

1. `npx tsc --noEmit` passes.
2. `npm run build` passes.
3. Every changed line traces to a stated requirement.
4. UI changes have been exercised in a real browser (or the absence of that test has been declared explicitly).
5. Limits and capabilities are measured *before* ship, not discovered in production.
6. Failure modes are explicit — no silent fallbacks that mask broken state.
7. Commit author is `sim2126` / `simantpra@gmail.com`.

Anything less is a draft, not a release.
