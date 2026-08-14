# Friday Frontend — Design & Engineering Handbook

The design contract for the Friday UI. `app/CLAUDE.md` covers *how to write code here*;
this set covers *what it should look like and why*.

**Every file was verified against the source at time of writing.** Where the code
contradicts a claim here, the code wins — fix the doc, don't fix the code to match.

## The files

| # | File | What's in it |
|---|---|---|
| 01 | [Design tokens](01-design-tokens.md) | The token contract. **Read before writing any styled component.** |
| 02 | [Colour and theme](02-colour-and-theme.md) | Palette, phase/status semantics, dark mode |
| 03 | [Typography and spacing](03-typography-and-spacing.md) | Type scale, tracking, rhythm |
| 04 | [Components and layout](04-components-and-layout.md) | Two-tree split, composition, responsive |
| 05 | [Motion and interaction](05-motion-and-interaction.md) | Three motion registers, loading, feedback |
| 06 | [Accessibility](06-accessibility.md) | Focus, contrast, keyboard, assistive tech |

## The design position in one paragraph

Friday is used by architects. Architects respect restraint. The visual language is
borrowed from `dbsarc.com` — cream rather than white, one accent colour, serif
display italics against a clean sans, generous whitespace, and no decoration that
isn't carrying information. Monday.com shouts; Friday does not. **If a surface
looks impressive in a screenshot but takes longer to read, it is wrong.**

## The five rules that matter most

1. **No raw hex in components.** Tokens are only real if they're the only source.
2. **Every surface token pairs with a foreground token.** Contrast by construction.
3. **Colour carries meaning, never decoration.** Muted neutrals for structure;
   saturated colour reserved for phase, status, and genuine alerts.
4. **Three tiers of information, maximum** — glance, support, drill-in.
5. **Empty states are reflective, not celebratory.** *"Nothing scheduled"* beats
   any exclamation mark.

## Current known gap

`grep -roE "#[0-9a-fA-F]{6}" src --include="*.tsx"` returns **175 occurrences across
13 files** at the time of writing. The token system is good and is being bypassed.
See [01](01-design-tokens.md) for the migration and the lint rule that prevents
regression.
