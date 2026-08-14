# Typography and Spacing

---

## The faces

| Token | Face | Role |
|---|---|---|
| `--font-friday-display` | Cormorant Garamond | Display headings, **always italic** |
| `--font-friday-serif` | Newsreader | Long-form reading |
| `--font-friday-sans` | Inter | All UI — labels, body, controls, data |
| `--font-friday-mono` | JetBrains Mono | Code, IDs, technical values |

Accessed via `FRIDAY_TYPE` in `tokens.ts`, each with a system fallback.

**Cormorant Garamond italic is the single strongest brand signal in the product.**
It appears on page titles, section headings and KPI numbers, and nowhere else. It
is what makes Friday look like it was made for an architecture practice rather
than assembled from a component library.

**The discipline: display italic is for headings and numbers only.** Never for
body, never for labels, never for buttons. Its impact comes entirely from scarcity.

---

## Type scale

| Role | Class | Face |
|---|---|---|
| Page title | `text-4xl sm:text-5xl` | display italic |
| Section heading | `text-xl` / `text-2xl` | display italic |
| Card title | `text-base` / `text-lg` | sans, medium |
| Body | `text-sm` | sans |
| Metadata, labels | `text-xs` | sans, `--friday-fg-muted` |
| KPI number | `text-4xl`+ `tabular-nums` | display italic |

**`tabular-nums` on every number that can change.** Without it, digits have
different widths and a live-updating figure shifts its neighbours. Any KPI,
counter, or table column of numbers needs it.

---

## Tracking and leading

**Tracking tightens as size grows.** Letter-spacing tuned for body copy looks loose
and amateurish at display sizes. This is the difference between considered
typography and default typography.

| Size | Tracking | Leading |
|---|---|---|
| Display (36px+) | `-0.02em` to `-0.03em` | `1.05`–`1.1` |
| Heading (20–24px) | `-0.01em` | `1.15`–`1.25` |
| Body (14–16px) | `0` | `1.5`–`1.6` |
| Small (12px) | `0` to `+0.01em` | `1.4` |

**Leading moves the opposite way.** Display text gets tight leading; body text gets
generous leading. Tight leading on a paragraph is unreadable; loose leading on a
headline looks unresolved.

Cormorant Garamond has a small x-height and long extenders, so display headings
carry `leading-[1.05]` — tighter than a sans would tolerate.

---

## Spacing

**Use the Tailwind scale. Do not add bespoke pixel values.**

The zelo-web knowledge base is explicit about why this goes wrong: design-comp
measurements like `89px` and `91px` get promoted into the scale, and every bespoke
number becomes a decision someone re-makes later.

| Step | Use |
|---|---|
| `1`–`2` (4–8px) | Inside a control, icon-to-label |
| `3`–`4` (12–16px) | Between related elements, card padding |
| `6` (24px) | Between cards, section internals |
| `8`–`10` (32–40px) | Between sections |
| `12`+ (48px+) | Page-level separation |

**Whitespace is the primary tool for hierarchy — before size, weight, or colour.**
If a section isn't reading as distinct, add space before you add a border.

---

## Density

Friday is a working tool. People are in it all day and scan more than they read.

- Table and list rows: `py-2` to `py-3`. Comfortable, not airy
- Card padding: `p-4` to `p-6`
- Page gutters: `px-6` to `px-8`

**But never sacrifice the page-level whitespace to fit more in.** The generous
outer margin is what makes the product feel calm. Compress row density if you must;
don't compress the frame.

---

## Copy rules

Non-negotiable, from `MEMORY.md`:

- **British English.** Organise, colour, prioritise, whilst
- **No emojis in product UI copy.** Reactions are the sole exception
- **No exclamation marks.** Anywhere
- **Empty states are reflective, not celebratory.** *"Nothing scheduled"*, not
  *"You're all caught up"*
- **Sentence case** for headings and buttons, not Title Case

### Empty states

The current best practice is that an empty state is onboarding: what will appear
here, and one clear action. Friday's version is quieter than Linear's but the
structure is the same:

```
Nothing scheduled
Meetings and deadlines assigned to you will appear here.
[ Add an item ]
```

One line saying what it is, one line saying what will fill it, one action. No
illustration, no encouragement, no exclamation mark.
