@AGENTS.md
@MEMORY.md

# DBS Architectes Friday — Working Agreement

This document governs how Claude collaborates on this codebase. The product context lives in `MEMORY.md`; the engineering rules live here.

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
