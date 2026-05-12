@AGENTS.md
@MEMORY.md

# DBS Architectes Friday — Working Agreement

This document governs how Claude collaborates on this codebase. The product context lives in `MEMORY.md`; the engineering rules live here. The **root `CLAUDE.md`** (one directory up) has the monorepo-wide working agreement — most rules live there, including the full code-organization spec (root §11). This file is the Next.js-app-specific addendum.

> **Tradeoff note.** These guidelines bias toward caution and clarity over raw speed. For trivial tasks (renames, typo fixes, one-line changes), use judgment and skip the heavier ceremony.

---

## 1. Think Before Coding

Don't assume. Don't hide confusion. Surface tradeoffs.

Before implementing:

- State assumptions explicitly. If uncertain, ask.
- If multiple interpretations exist, present them — don't pick silently.
- If a simpler approach exists, say so. Push back when warranted.
- If something is unclear, stop. Name what's confusing. Ask.

Architecture firms move at the speed of their slowest reviewer. Friday must move at the speed of the fastest decision. Surfacing ambiguity early is how that happens.

## 2. Simplicity First

Minimum code that solves the problem. Nothing speculative.

- No features beyond what was asked.
- No abstractions for single-use code.
- No "flexibility" or "configurability" that wasn't requested.
- No error handling for impossible scenarios.
- If you write 200 lines and it could be 50, rewrite it.

Ask: *"Would a senior engineer call this overcomplicated?"* If yes, simplify.

Friday's competitive edge is that it does fewer things, better. The codebase has to mirror that.

## 3. Surgical Changes

Touch only what you must. Clean up only your own mess.

When editing existing code:

- Don't "improve" adjacent code, comments, or formatting.
- Don't refactor things that aren't broken.
- Match existing style, even if you'd do it differently.
- If you notice unrelated dead code, mention it — don't delete it.

When your changes create orphans:

- Remove imports/variables/functions that *your* changes made unused.
- Don't remove pre-existing dead code unless asked.

The test: every changed line should trace directly to the user's request.

## 4. Goal-Driven Execution

Define success criteria. Loop until verified.

Transform tasks into verifiable goals:

- "Add validation" → "Write tests for invalid inputs, then make them pass"
- "Fix the bug" → "Write a test that reproduces it, then make it pass"
- "Refactor X" → "Ensure tests pass before and after"

For multi-step tasks, state a brief plan:

```
1. [Step] → verify: [check]
2. [Step] → verify: [check]
3. [Step] → verify: [check]
```

Strong success criteria let you loop independently. Weak criteria ("make it work") require constant clarification.

## 5. DBS-Specific Rules

These come from real incidents on this project — they're not generic advice.

- **Git author must always be `sim2126` / `simantpra@gmail.com`.** Vercel deployments break under any other author. Use `git -c user.name="sim2126" -c user.email="simantpra@gmail.com" commit ...`.
- **Never skip pre-commit hooks** (`--no-verify`, `--no-gpg-sign`). If a hook fails, fix the cause, don't bypass it.
- **The seeded team is the real DBS team** (`firstname.lastname@dbsarc.com` / `dbs2025`). Don't generate fake users in demos. Real founders: Giulio Sovran, Luigi Di Berardino. Real associates and full roster live in `prisma/seed-dbsarc.ts`.
- **The 48 seeded projects are real DBS projects** scraped from dbsarc.com — Le Saillen, Lamberson Buildings, Crans Carlton, etc. Don't invent project titles in demos. Hero images are baked into `public/project-images/` for offline-safe demos.
- **AWS is the production target. Vercel + Neon is the demo posture only.** Don't assume Vercel-specific primitives (e.g. `vercel/blob`) when designing core services.
- **AI features must degrade gracefully.** Every summary, suggestion, or translation is non-blocking. If OpenAI/Anthropic/Bedrock goes dark, the platform must still work end-to-end.
- **Don't fabricate user-facing copy in DBS branding.** Voice should match dbsarc.com — quiet, professional, multilingual (FR/IT/EN). Avoid emojis in product UI unless explicitly requested.

## 6. Verification Before Shipping

Before declaring a task done, run:

1. `npx tsc --noEmit` — type check passes.
2. `npm run build` — production build succeeds.
3. For UI changes: open the dev server, exercise the golden path, check for regressions in adjacent features. If you can't test the UI, **say so explicitly** rather than claiming success.
4. For DB schema changes: `npx prisma db push` against Neon, then re-seed if relevant.
5. Commit with the required git author. Never commit secrets (`.env`, credentials).

## 7. When You're Unsure

Three escape hatches, in order of preference:

1. **Ask a focused question.** One sentence beats five paragraphs of speculation.
2. **State your default and proceed.** "I'm going with X because Y; flag if you'd prefer Z."
3. **Stop and surface.** If the cost of being wrong is high (data loss, deploy break, sent message), do not proceed silently.

## 8. Code Organization

The `src/` tree is **feature-per-folder with explicit visibility**. There is one place for each concern. Layout:

```
app/src/
  app/                    # Next.js routes — THIN. Pages + API handlers only.
                          # No business logic; delegate to features/.
  features/               # One folder per business feature.
    <feature>/
      server/             # Server-only: Prisma, mutations, external APIs.
      client/             # React components, hooks, browser state.
      domain/             # Pure types + helpers; safe on either side.
      index.ts            # Public barrel — the only legal import target.
  platform/               # Cross-cutting infrastructure.
    auth/                 # NextAuth (AuthN).
    authz/                # authorize() + requirePermission() (AuthZ).
    db/                   # Prisma client.
    integrations/         # google-calendar, pusher, daily, openai.
  ui/                     # Pure presentation; no business logic.
    components/           # shadcn primitives + cross-cutting widgets.
    friday/               # Friday-branded primitives.
    layout/               # Header, sidebar.
    stores/               # Zustand UI stores.
    marketing/            # Landing page and similar.
    tokens.ts             # Friday design tokens helper.
    utils.ts              # cn() and UI utilities.
  i18n/                   # translations + language store + switcher.
  middleware.ts
```

### 8.1 Visibility rules (review-enforced, ESLint follow-up planned)

- `app/` ⇒ `features/`, `platform/`, `ui/`, `i18n/`.
- `features/<X>/` ↛ `features/<Y>/` directly. Compose across features **only via the public barrel** `@/features/<Y>`. If two features need the same thing, lift to `platform/` or `ui/`.
- `features/<X>/client/` ↛ `features/<X>/server/`. Server-only stays out of client bundles by construction.
- `platform/` ↛ `features/`. Infra cannot know about business.
- `ui/` ↛ anywhere except other `ui/`. Pure presentation.
- `i18n/` ↛ `features/`.

If you're tempted to break a rule, the thing you're reaching for belongs in a different package.

### 8.2 Feature shape

Each feature has up to three subdirs (only what it needs) and one barrel:

- **`server/`** — Prisma queries, mutations, external calls. Verb-first filenames: `load-project.ts`, `update-project.ts`, `list-projects.ts`.
- **`client/`** — React. Noun-first filenames: `project-detail.tsx`. The `-client` suffix is **dropped** here because the folder already implies the role.
- **`domain/`** — Pure code, safe on either side. `types.ts`, `phase-helpers.ts`.
- **`index.ts`** — barrel; re-exports the public surface. **Server code is NOT re-exported** — it's deep-imported by route handlers (`@/features/ai/server/agent/runner`), keeping it out of client bundles.

### 8.3 Naming

| What | Convention | Example |
|---|---|---|
| Files (TS/TSX) | kebab-case matching the primary export | `ProjectDetail` → `project-detail.tsx` |
| Files (Python, apps/api/) | snake_case per PEP 8 | `load_project()` → `load_project.py` |
| Server functions | verb-first | `load-project.ts`, `list-projects.ts` |
| Components | noun-first | `project-detail.tsx`, `agenda-calendar.tsx` |
| Pure helpers | `<noun>-helpers.ts` | `phase-helpers.ts` |
| Types-only files | `types.ts` inside `domain/` | `features/projects/domain/types.ts` |
| React component name | PascalCase matching kebab-case file | `project-detail.tsx` → `ProjectDetail` |
| Constants | `UPPER_SNAKE_CASE` | `PHASE_COLORS`, `ACTIONS` |
| Action vocabulary | `resource:operation[.modifier]` | `project:update.status`, `user:role.change` |
| Barrel | `index.ts` only | one per package |

**Drop redundant prefixes.** A file inside `features/projects/client/` doesn't need `project-` unless it distinguishes from sibling files. `client/detail.tsx` is fine if it's the only "detail" file; keep `project-detail.tsx` when surrounded by other project-prefixed siblings.

### 8.4 Backend (apps/api/) parallel

The same shape applies, with Python idioms — `snake_case` files, `__init__.py` barrels. The action vocabulary lives in `packages/shared/auth/actions.yaml` (planned) so both languages load from one source.

### 8.5 Adding a new feature

1. Create `src/features/<feature>/{server,client,domain}/` as needed.
2. Add `src/features/<feature>/index.ts` exporting the public surface.
3. Add the Next.js route in `src/app/<route>/page.tsx` — thin: auth, fetch, render.
4. DB access outside a route handler → `server/`. **Never** import `prisma` from `client/`.
5. Auth gates → add the action to `platform/authz/actions.ts` and a branch in `authorize.ts`. Don't sprinkle `if (isAdmin)` in routes.
6. Shared primitive → `ui/components/` only if multiple features will use it; otherwise keep it inside the feature.
