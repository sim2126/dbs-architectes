# Design Tokens

The single source of truth for every colour, radius and motion value in Friday.

---

## The contract

**Friday tokens are the source of truth. shadcn tokens map to them, never the reverse.**

```
--friday-*  ──maps to──>  --background, --foreground, --primary, …  ──used by──>  components
```

This one-directional flow is why the entire product re-themes from a single block
in `globals.css`, and why dark mode required no per-component variants.

Defined in [`src/app/globals.css`](../../src/app/globals.css).
Mirrored for TypeScript in [`src/ui/tokens.ts`](../../src/ui/tokens.ts).

---

## Token families

### Surfaces

| Token | Light | Role |
|---|---|---|
| `--friday-bg` | `#fafaf8` | Page ground. Cream, never pure white |
| `--friday-surface` | `#ffffff` | Cards, panels, raised content |
| `--friday-surface-2` | `#f5f5f1` | Secondary fills, hover, muted rows |
| `--friday-surface-3` | `#ebe9e3` | Wells, inset areas, track backgrounds |

**The cream ground is a brand decision, not a default.** Pure white reads as
generic SaaS. `#fafaf8` is the first thing that makes Friday look like it belongs
to an architecture practice.

### Borders

| Token | Light | Role |
|---|---|---|
| `--friday-border` | `#dcd9d1` | Standard division |
| `--friday-border-soft` | `#e8e6e0` | Subtle grouping, internal rules |

Warm greys, not neutral. A `#e5e5e5` border against a cream ground reads cold and
slightly dirty.

### Foreground

| Token | Light | Role |
|---|---|---|
| `--friday-fg` | `#1a1a18` | Primary text. Warm near-black, never `#000` |
| `--friday-fg-muted` | `#6b6862` | Secondary text, labels, metadata |
| `--friday-fg-subtle` | `#a8a59d` | Tertiary, placeholders, disabled |

Three levels is the whole hierarchy. **If you need a fourth, the layout is wrong,
not the palette.**

### Accent

| Token | Value | Role |
|---|---|---|
| `--friday-accent` | `#1e3a8a` | Architect's blue. Primary action, focus, links |
| `--friday-accent-fg` | `#ffffff` | Text on accent |
| `--friday-accent-soft` | `rgba(30,58,138,0.08)` | Selected rows, subtle tint |
| `--friday-accent-ring` | `rgba(30,58,138,0.30)` | Focus ring |

**One accent colour. There is no secondary brand colour.** Soft and ring variants
are alpha derivations of the same hue — not separately chosen shades. Fewer
decisions, automatically harmonious, impossible to drift.

### Radius

```css
--radius: 0.375rem;
```

One variable governs the entire corner language. Changing it to `0` makes Friday
sharp-cornered in a single edit. **Never hardcode a `border-radius`.**

---

## The rule: no raw hex in components

**Current state: 175 raw hex occurrences across 13 `.tsx` files.**

This is the single worst thing about the current styling layer, and it is exactly
the mistake the zelo-web knowledge base names as its biggest regret:

> *A rebrand currently means a global find-and-replace across hex codes… The system
> is only worth having if it's the single source.*

The consequence is concrete: the palette lives in two places that can silently
diverge. A token edit fixes some surfaces and not others, and nobody notices until
a screenshot looks wrong.

### Migration

1. For each raw hex, find the token it should be. Most map directly.
2. If none exists, **that's a finding** — either it should be a token, or the value
   is wrong.
3. Replace with the Tailwind utility (`bg-friday-surface`) in JSX, or
   `FRIDAY_TOKENS.*` in TypeScript that computes styles.
4. Phase and status colours go through `getPhaseColor()` / `getStatusColor()`,
   never a literal.

### The lint rule

Prose rules are hopes. Encode it:

```js
// eslint.config.mjs
"no-restricted-syntax": [
  "error",
  {
    selector: "Literal[value=/^#[0-9a-fA-F]{3,8}$/]",
    message:
      "No raw hex in components. Use a Friday token (src/ui/tokens.ts) or a " +
      "Tailwind utility. If no token fits, add one to globals.css first.",
  },
],
```

Exempt `globals.css` and `tokens.ts` — those are where colour is allowed to exist.

**Do not do the migration without landing the lint rule in the same change.**
A cleanup without enforcement regrows within a month.

---

## Adding a token

Before adding one, answer: **is this a new semantic role, or a new value for an
existing role?** Almost always the second, and then you don't need a token — you
need to use the one that exists.

If it genuinely is new:

1. Add to `:root` in `globals.css` with a comment stating its role
2. Add the matching value to `.dark`
3. Mirror it into `FRIDAY_TOKENS` in `tokens.ts`
4. Check contrast against every surface it can land on

Skipping step 2 is how dark mode rots one token at a time.

---

## What is deliberately *not* tokenised

**Phase and work-status colours are locked palettes, not theme values.** They carry
database semantics — `ETUDE/AP` is red because the product says so, and it stays
red in dark mode. They are defined as tokens for consistency of *access*, but they
are not theme-variable. See [02](02-colour-and-theme.md).
