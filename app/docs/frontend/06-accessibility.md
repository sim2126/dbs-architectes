# Accessibility

Not a compliance exercise. Friday is used all day by people across three languages,
on varied hardware, some with a trackpad they dislike and some who navigate by
keyboard because it is faster.

**European context matters.** The European Accessibility Act applies to commercial
digital services in the EU, and an architecture practice tendering for public work
may be asked about it. Getting this right is cheaper now than retrofitting.

---

## Target

**WCAG 2.2 Level AA.**

---

## Contrast

| Content | Ratio |
|---|---|
| Body text | 4.5:1 |
| Large text (18px+, or 14px bold) | 3:1 |
| UI components, focus indicators | 3:1 |
| Decorative | exempt |

Verified pairings are listed in [02](02-colour-and-theme.md).

**`--friday-fg-subtle` does not meet AA on all surfaces.** Placeholders, disabled
states and decorative rules only. Never information the user must read.

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

## Known gaps

Honest current state:

- **No automated accessibility testing in CI.** Nothing prevents regression
- **No screen-reader testing has been performed.** Semantics are correct by
  construction via Radix, not by verification
- **Browser QA generally is unautomated** — the checklist above depends on someone
  performing it

These are real gaps, listed so they are chosen rather than forgotten.
