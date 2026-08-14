# Components and Layout

---

## The two-tree split

```
src/ui/components/     PRIMITIVES — generic, stable, used everywhere
src/ui/friday/         BRANDED PRIMITIVES — Friday-specific, still generic
src/features/<x>/client/   FEATURE — domain-specific, churns constantly
```

**Knowing which tree a component lives in tells you whether it is safe to change.**
A feature component has one caller. A primitive has forty. That single distinction
prevents more accidents than any review checklist.

### Promotion

When the same pattern appears in three features, promote it to `ui/components/`.
Deliberately — as a change with its own commit, not by copy-paste drift.

Promotion checklist:
- No imports from `features/`
- No domain vocabulary in the props API (`variant`, not `phaseVariant`)
- Variants typed via `class-variance-authority`
- A test

### Do not hand-roll anything with focus or keyboard semantics

Dialogs, popovers, dropdowns, selects, tabs, tooltips, comboboxes — **use Radix.**
A focus-trapped, screen-reader-correct modal is genuinely hard and Radix is the
cheapest correctness available in a frontend. Every hand-rolled version has been
subtly wrong.

---

## Styling

**`cn()` from `@/ui/utils` for every conditional class.** It runs `clsx` +
`tailwind-merge`, so conflicting utilities resolve by intent rather than by
stylesheet order:

```ts
cn("px-2 py-1", isLarge && "px-4")   // → "py-1 px-4"
```

Without `tailwind-merge`, both `px-2` and `px-4` land in the class list and the
winner is whatever the stylesheet happens to order last.

**`class-variance-authority` for component variants.** Variant and size become a
typed API rather than prop-drilled class strings.

---

## Elevation

Shadows are **layered**, with a consistent light source.

```css
/* raised: cards, popovers */
box-shadow:
  0 1px 2px  rgba(26, 26, 24, 0.04),
  0 4px 12px rgba(26, 26, 24, 0.05);

/* floating: modals, command palette */
box-shadow:
  0 2px 4px  rgba(26, 26, 24, 0.04),
  0 12px 32px rgba(26, 26, 24, 0.08);
```

Two rules:

**Tint the shadow toward the palette, never pure black.** These use `#1a1a18`
(the foreground token) at low alpha. A `rgba(0,0,0,…)` shadow over a cream ground
reads grey and muddy.

**A single `box-shadow` reads as a hard drop shadow.** Stacking a wide-soft-faint
layer under a tight-darker one approximates how light actually falls — the
difference between "has a shadow" and "sits above the page."

Pick one light direction and never contradict it. Friday's is straight down.

**Prefer a border to a shadow for structure.** Shadows are for things that float
above the page. A card in a grid is not floating — `--friday-border` is usually
the more honest choice and reads calmer.

---

## Layout

### The dashboard shell

The dashboard layout places children in a `flex-1 <main>`.

**Children use `h-full min-h-0`. Never `h-screen`.**

This has broken the chat composer twice — `h-screen` inside a flex child overflows
the container and pushes the composer below the fold. `min-h-0` is the part people
omit: without it, a flex child refuses to shrink below its content size and
scrolling breaks.

### Full-height surfaces

Use `svh`/`dvh`, not `vh`. `vh` ignores mobile browser chrome and causes the
well-known iOS Safari overflow.

### Information hierarchy

**Three tiers, maximum.**

| Tier | What | Where |
|---|---|---|
| Glance | 3 numbers that change a decision | Top, largest type |
| Support | Lists, recent activity, what changed | Middle |
| Drill-in | Detail, history, configuration | Behind a click |

Twelve equal numbers is not a dashboard, it is a report. If a metric doesn't change
what the user does next, it belongs one tier down.

### Progressive disclosure

Default to the simplified view; surface advanced configuration on demand. This is
the dominant pattern in current practice — Linear, Notion and Figma all do it —
and it is what lets a product be simple for a new user and complete for a daily one.

Concretely: filters collapsed by default, advanced options behind a disclosure,
bulk actions appearing on selection rather than sitting permanently in the toolbar.

---

## Responsive

Standard Tailwind breakpoints. Friday is a desktop-first working tool; phones are
a real but secondary surface.

| Breakpoint | Treatment |
|---|---|
| `< sm` | Single column, sidebar becomes a sheet, tables become cards |
| `sm`–`lg` | Two columns, sidebar collapses to icons |
| `lg`+ | Full layout, sidebar expanded |

**Tables do not scroll horizontally on mobile — they become cards.** A horizontally
scrolling table on a phone is a surface nobody uses.

**Any wide content gets its own `overflow-x: auto` container.** The page body must
never scroll horizontally.
