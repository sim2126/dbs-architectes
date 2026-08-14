# Motion and Interaction

---

## Durations

From `FRIDAY_MOTION` in [`tokens.ts`](../../src/ui/tokens.ts):

| Token | Duration | Use |
|---|---|---|
| `fast` | 100ms | Micro-feedback — press, toggle, checkbox |
| `hover` | 160ms | Hover and focus transitions |
| `accordion` | 180ms | Expand/collapse |
| `modal` | 200ms | Dialog and sheet enter/exit |
| `tab` | 220ms | Tab and view transitions |

| Easing | Curve | Use |
|---|---|---|
| `ease` | `cubic-bezier(0.32, 0.08, 0.24, 1)` | Default — both directions |
| `easeOut` | `cubic-bezier(0.16, 1, 0.3, 1)` | Entrances, things arriving |

**Nothing exceeds 220ms.** Above roughly 250ms, motion stops reading as
responsiveness and starts reading as waiting. Friday is a tool people use all day —
animation they notice twice is animation they resent by the hundredth time.

---

## Three registers, never mixed

| Register | Duration | Purpose |
|---|---|---|
| **Transition** | 100–220ms | Responds to the user |
| **Feedback** | ~1s, looping | Signals liveness — skeletons, typing indicators |
| **Ambient** | 20s+ | Background, never draws attention |

Friday uses transition and feedback. **Ambient motion is deliberately absent** —
it belongs to marketing surfaces, and there is no place for a drifting gradient in
a project management view.

If ambient motion is ever added, run loops at non-matching periods so they never
sync into a visible pulse.

---

## Loading

**Skeletons over spinners for content.** A skeleton preserves layout and
communicates *what* is loading; a spinner only says *something* is. Layout that
doesn't shift when data arrives is the single biggest perceived-quality difference
in a data-heavy product.

Spinners are correct only for a discrete action with no shape to preview —
a button mid-submit, for instance.

| Situation | Pattern |
|---|---|
| Page or list loading | Skeleton matching final layout |
| Button submitting | Inline spinner, button disabled, label retained |
| Background refresh | Nothing. Do not interrupt a reading user |
| Optimistic mutation | Apply immediately, reconcile on response |

**Optimistic UI plus autosave is the default.** Users should never lose work and
never wait to see their own edit.

---

## Interaction states

Every interactive element needs all five: default, hover, focus-visible, active,
disabled.

**Hover is an alpha shift, not a new colour.** `--friday-accent-soft` over the
existing surface, not a separately-chosen shade. Fewer decisions, automatically
harmonious, impossible to drift.

**Focus rings are never removed.** `--friday-accent-ring`, via `focus-visible` so
mouse users don't see rings but keyboard users always do. Removing an outline
without a replacement makes the product unusable by keyboard.

**Hit targets are padded, not sized.** `px-4 py-2`, not `h-10`. Padding scales with
text and stays tappable at any type size. Minimum 44×44px for touch.

**`whitespace-nowrap` on button labels** so a two-word action doesn't wrap into an
awkward stack at narrow widths.

---

## Feedback and confirmation

| Outcome | Pattern |
|---|---|
| Success | Toast, auto-dismiss ~4s |
| Recoverable error | Inline, next to the cause, persistent |
| System error | Amber callout, plain language, an action |
| Destructive action | Dialog naming the specific thing being deleted |

**Errors state what happened and what to do.** No error codes, no stack traces,
no blame. *"Could not save — the project was updated by someone else. Reload to
see their changes."*

Destructive confirmations name the object: *"Delete Le Saillen?"* — never
*"Are you sure?"*

---

## Reduced motion

```css
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
  }
}
```

Honour it globally. Vestibular disorders are common and this is a one-block fix.
Skeletons stay — they are layout, not motion; only the shimmer stops.
