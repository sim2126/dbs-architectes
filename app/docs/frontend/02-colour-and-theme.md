# Colour and Theme

---

## The governing principle

**Colour carries meaning. It never decorates.**

The core layout is muted — cream, warm greys, warm near-black. Saturated colour
appears in exactly three situations:

1. **Phase** — where a project sits in its lifecycle
2. **Work status** — whether something is moving
3. **Genuine alert** — something needs a decision

If colour appears anywhere else, it is noise, and it makes the three meaningful
uses harder to see. This is the whole discipline: **a restrained palette is what
makes the accent legible.**

---

## Phase palette (locked)

Keyed by the database `phase` value. Access via `getPhaseColor()` — never a literal.

| Phase | Token | Colour |
|---|---|---|
| `ETUDE/AP` | `--phase-etude-ap` | `#ef4444` |
| `MAE` | `--phase-mae` | `#22c55e` |
| `CHANTIER` | `--phase-chantier` | `#3b82f6` |
| `EXE/DG/DV/3D` | `--phase-exe` | `#8b5cf6` |
| `TERMINATO` | `--phase-terminato` | `#6b7280` |
| `STUCK` | `--phase-stuck` | `#f59e0b` |
| `CONCORSO` | `--phase-concorso` | `#14b8a6` |

**These do not change in dark mode.** They are data semantics, not theme choices.
A project's phase colour must be the same on the map, in a list, on a pill, and on
a chart — recognisable at a glance across every surface.

`TERMINATO` is deliberately grey. Completed work should recede.

**`getPhaseColor()` is whitespace-tolerant** for legacy `ETUDE / AP` spacing and
falls back to `--friday-fg-subtle` for unknown values. Never assume the input is
canonical.

---

## Work status palette (locked)

| Status | Token | Colour |
|---|---|---|
| `todo` | `--status-todo` | `#c4c4cf` |
| `doing` | `--status-doing` | `#fdab3d` |
| `stuck` | `--status-stuck` | `#e2445c` |
| `completed` | `--status-completed` | `#00c875` |

Deliberately borrowed from Monday.com. **This is a familiarity decision, not a
design one** — DBS staff arriving from Monday read these colours without being
taught. Solid full-bleed fills with white text, exactly as they expect.

Do not "improve" these to fit the Friday palette. The recognition is the point.

---

## Semantic feedback

| Token | Light | Role |
|---|---|---|
| `--friday-error-bg` | `#fdf6ec` | Error callout ground |
| `--friday-error-border` | `#e8d9b8` | Error callout edge |
| `--friday-error-fg` | `#7c5310` | Error text |
| `--friday-success-fg` | `#15803d` | Success text |

**Errors are warm amber, not red.** Red is already spoken for by `ETUDE/AP` and
`stuck`. An amber callout also reads as "something needs attention" rather than
"something is broken", which is usually more accurate and less alarming to a user
mid-task.

---

## Dark mode

Fully defined in `.dark` in `globals.css`. Register: **"paper at night"** — warm
deep black, warm white text. Not the usual cold slate.

| Token | Light | Dark |
|---|---|---|
| `--friday-bg` | `#fafaf8` | `#14120e` |
| `--friday-surface` | `#ffffff` | `#1d1b16` |
| `--friday-fg` | `#1a1a18` | `#f0eee8` |
| `--friday-fg-muted` | `#6b6862` | `#b3afa5` |
| `--friday-border` | `#dcd9d1` | `#3a352c` |

Three rules that make it work:

**The accent stays brand-locked.** `#1e3a8a` in both themes; only the alphas rise
(`0.08 → 0.18` soft, `0.30 → 0.45` ring) so tints stay visible on dark surfaces.

**Warmth is preserved.** `#14120e` is a warm black. A cold `#0a0a0a` would throw
away the identity the cream ground establishes in light mode.

**Every new token needs a dark value in the same change.** Adding to `:root` and
forgetting `.dark` produces a surface that inherits the light value and breaks in
one place nobody looks at.

### Redefine only tokens, never components

If you find yourself writing `dark:bg-something`, stop. The token should have
handled it. A `dark:` variant in a component means either the token is missing or
you used a raw value.

---

## Contrast

Every foreground/surface pairing must clear **WCAG AA** (4.5:1 body, 3:1 large
text and UI components).

Checked pairings, both themes:

- `--friday-fg` on `--friday-bg`, `--friday-surface`, `--friday-surface-2`
- `--friday-fg-muted` on the same three
- `--friday-accent-fg` on `--friday-accent`

**`--friday-fg-subtle` is not AA on all surfaces.** It is for placeholders,
disabled states, and decorative separators only. Never use it for information the
user has to read.

Status and phase pills always use white text on the solid fill — verified against
the darkest member of each palette.
