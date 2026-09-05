# WorkBook review remediation

Review baseline: `648b08f`. Scope: reported defects in WorkBook, project access,
notifications and the acceptance harness, plus equivalent access paths and races
exposed while validating those fixes. No schema migration or product redesign.

## Findings addressed

| Area | Correction |
| --- | --- |
| Project visibility | API and server-rendered pages use live subjects and the same read predicate, including denials and operating regions. Project JSON excludes user credentials. Thread previews require thread access. |
| Region permissions | View-only grants cannot authorise project/status/assignment mutations. A project read denial also blocks writes. |
| Workload | Live permission grants and role changes apply to existing sessions; project relations are visibility-scoped. Unavailable workload is shown explicitly. |
| Pagination | Immutable ID boundaries survive updated or deleted cursor rows without dropping later projects. |
| Project writes | Integer years, validated dates/ranges, row-locked date edits, serialised code allocation, preserved creation status and returned capabilities. |
| Board state | Contract-built editable-field payloads, per-row write queues, invalidated-read retry, field-level rollback and default-closed capabilities. |
| Board interactions | Correct drag source, selection pruning, same-group no-ops, shared windowing heights/offsets and chronological last-updated sorting. Failed creation retains the draft. |
| Saved views | Search persists; duplicate/stale column keys are handled; save/delete failures are visible; the per-user cap is serialised. |
| Dates and exports | Calendar today follows local midnight; CSV formula protection handles leading control characters. |
| Notifications | Recipients and existing inbox entries are rechecked against current access. Realtime events contain IDs only. WorkBook replies notify and invalidate counts. |
| Bell | Stable pagination, complete category counts, recovery after missed events and explicit read failures without losing unread state. |
| Chat races | Reaction removal is idempotent; simultaneous guest admissions use the database conflict clause. Mentions require complete, unambiguous name matches. |
| Acceptance safety | Loopback origins, exact disposable database identifiers, no redirects, and server target attestation before login. AI concurrency probes refuse configured providers. |
| Harness correctness | Role metadata survives serialisation; expected denials and writes have exact checks. CI provides a real local broker and cannot skip the realtime journey. WCAG 2.1 A is included. |

The only intentional colour correction is the thread reply-expansion button:
it now uses existing Friday foreground tokens after axe found insufficient
contrast. Layout, spacing and the phase/status palettes are unchanged.

## Verification

- TypeScript and production build pass. Lint has zero errors and two existing
  warnings in `projects-explorer.tsx`.
- Coverage suite: 337 passing tests, 77.65% lines and 81.92% branches across 63
  measured critical-path files. Additional load-target and transport tests pass.
- Browser suite: 45 passing Playwright journeys, including real local Soketi
  delivery, permission revocation, failed saves, native dragging and rendered
  row geometry. Browser tests use disposable fictional fixtures.
- Concurrency: seven passing checks across six scenarios. The two AI scenarios
  verify no-provider failure and absence of quota/lease corruption, not active
  provider throughput or quota ceilings.
- Offline grounding evaluation: all 50 fixed prompts pass.
- Production audit passes with six existing reviewed exceptions; none were
  silently removed or reclassified.

K6 throughput/stress/soak profiles were not rerun (k6 is unavailable in this
session). Their guards and role/status expectations have offline regressions.
No new performance claim is made. Screen-reader testing and remote CI/deployment
remain outside this local verification. Pipeline/archiving and consolidation
of the separate Projects and WorkBook surfaces remain product decisions.

Reproduction commands and the isolated target are documented in
[`load/README.md`](../../load/README.md). No shared staging, Neon or
production data was changed, and no paid model was invoked.
