# Accessibility

Not a compliance exercise. Friday is used all day by people across three languages,
on varied hardware, some with a trackpad they dislike and some who navigate by
keyboard because it is faster.

**European context matters.** The European Accessibility Act applies to commercial
digital services in the EU, and an architecture practice tendering for public work
may be asked about it. Getting this right is cheaper now than retrofitting.

---

## Target

**WCAG 2.2 Level AA** (the contract, Annexure F.1, requires 2.1 AA; 2.2 is a superset).

---

## Contrast

| Content | Ratio |
|---|---|
| Body text | 4.5:1 |
| Large text (18px+, or 14px bold) | 3:1 |
| UI components, focus indicators | 3:1 |
| Decorative | exempt |

Verified pairings are listed in [02](02-colour-and-theme.md).

**`--friday-fg-subtle` meets AA on `bg` and `surface` (4.59:1 and 4.80:1) but not
on `surface-3` (3.95:1).** It was `#a8a59d` at 2.35:1 until 24 August 2026 and
failed on every page. Use it for micro-labels on the ground or a card; never on a
tinted panel, and never for a sentence the user must read — that is `fg-muted`.

**Opacity is not a way to quieten text.** `text-muted-foreground/60` blends the
colour into the ground and lands far below 4.5:1 on any Friday surface. Fifty such
utilities were swept out on 24 August and a lint rule now refuses them. Choose the
solid token whose contrast is measured: `fg-muted` (5.31:1) or `fg-subtle`.

**Pills declare their own text colour.** White on Monday's palette fails AA on every
pale or warm colour (amber 1.9:1, green 2.3:1). Each phase and status token has a
`-fg` companion, chosen by measurement: dark text on pale and warm pills, white on
the saturated ones — whose backgrounds were darkened one step so white passes.
Paint with `getPhaseOnColor()` / `getStatusOnColor()`, never `text-white`.

**Decorative text is a graphic.** The login watermark was 63 text nodes that axe
correctly evaluated as content at 1.16:1. WCAG exempts decoration, but a tool
cannot know intent; it is now an SVG mask over a token background, with no text
nodes and one element.

**Never use colour alone to carry meaning.** Phase and status pills carry a text
label as well as a fill. Roughly 1 in 12 men has a colour vision deficiency, and
red/green — `ETUDE/AP` against `MAE` — is the most common confusion.

---

## Keyboard

Everything reachable by mouse is reachable by keyboard, in a logical order.

- **`focus-visible` on every interactive element.** Never `outline: none` without
  a replacement
- **Tab order follows visual order.** If you need `tabIndex` above 0, the DOM order
  is wrong
- **Escape closes** dialogs, popovers, sheets
- **Arrow keys** move within composite widgets — menus, tabs, listboxes
- **Enter/Space** activate
- **Skip link** to main content as the first focusable element

Radix supplies all of this for the primitives it covers. That is the argument for
using it.

### Focus management

- Opening a dialog moves focus into it and traps it there
- Closing returns focus to the trigger
- Route change moves focus to the page heading
- Async content arriving must not steal focus

---

## Screen readers

- **Semantic HTML first.** `<button>`, `<nav>`, `<main>`, `<h1>`–`<h6>`. ARIA is a
  patch for when semantics can't express it, not a substitute
- **One `<h1>` per page**, no skipped levels
- **Icon-only buttons need `aria-label`**
- **Decorative images** get `alt=""` and `aria-hidden="true"`
- **Live regions** for async updates — `aria-live="polite"` for toasts and counts,
  `assertive` only for genuine errors
- **Form inputs have real `<label>`s.** A placeholder is not a label; it vanishes
  on focus, exactly when it is needed

---

## Motion

Honour `prefers-reduced-motion` globally — see [05](05-motion-and-interaction.md).

---

## Language

Friday ships FR / IT / EN.

- **`<html lang>` tracks the active language.** Screen readers select
  pronunciation from it. Getting this wrong makes French read in an English accent
- **Mark inline foreign text** with `lang` on the element
- **Design for text expansion.** French and Italian run 15–30% longer than English.
  Fixed-width buttons sized to English will clip
- **Never build a sentence from concatenated fragments.** Word order differs

---

## Checks before shipping a UI change

1. Tab through the whole flow. Can you complete it without a mouse?
2. Is focus always visible, and never lost after an interaction?
3. Zoom to 200%. Does anything clip or overlap?
4. Do all pills and badges carry text as well as colour?
5. Do images have appropriate `alt`?
6. Switch to French. Does anything overflow?
7. Run an automated pass (axe DevTools). It catches maybe 30% — the tab-through
   catches the rest

**Automated tools are necessary and not sufficient.** They cannot tell you the tab
order is illogical or that a label is misleading.

---

## Automated checks

Since 24 August 2026, two gates run on every push:

- **`npm run lint:a11y`** — `eslint-plugin-jsx-a11y` recommended rules over every
  `.tsx`, in a lean config that runs in seconds. First measurement: 52 findings,
  mostly click handlers on non-interactive elements and missing key handlers.
  That backlog is tracked, not hidden.
- **`npm run test:e2e`** — Playwright journeys for the primary surfaces, each ending
  in an axe scan against `wcag2a`, `wcag2aa` and `wcag21aa`. Serious and critical
  violations fail the run; moderate and minor are reported. Scans wait for
  entrance animations to finish, because a label mid-fade is not the settled page.

The first E2E scan found 82 contrast nodes and 8 unnamed icon-only buttons across
six pages. All are fixed by the rules above, and by giving the header bell, the
composer's send button and the conversation menus accessible names.

## Known gaps

Honest current state:

- **No screen-reader testing has been performed.** Semantics are correct by
  construction via Radix, not by verification
- **Keyboard access on 52 lint findings is unverified** — the automated pass says
  what is missing; only a tab-through says whether it matters
- **Browser QA generally is unautomated** — the checklist above depends on someone
  performing it

These are real gaps, listed so they are chosen rather than forgotten.
