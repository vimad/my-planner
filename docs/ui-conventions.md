# UI/UX conventions

The frontend (`packages/frontend`) has no design-token layer — no `tailwind.config` theme extension, no CSS custom properties for color. Every surface is a hand-written Tailwind class string, repeated per component. This doc catalogues the conventions that are actually followed in practice, so new components can copy an exact class string instead of guessing a value (which is how [a dropdown once shipped with the wrong background color](#a-small-anchored-dropdownpopover)).

When adding a new surface, find the closest archetype in [Component archetypes](#component-archetypes) below and copy its class string. If you deviate, deviate on purpose and update this doc.

## Color palette / surfaces (dark mode)

| Hex | Role | Example |
|---|---|---|
| `#160f24` | Full modal dialog background | `ConfirmDialog.tsx`, `TodoDetail.tsx`, `BoardSwitcherModal.tsx` |
| `#1a1229` | Small anchored dropdown/popover background | `CategoryChip.tsx`, `TagInput.tsx`, `NotesView.tsx` (`RowMenu`) |
| `#1c1330` | Inline "nested results box" — a bordered box in normal document flow (not `absolute`), holding search results inside a larger modal/view | `TodoDetail.tsx` linked-todo search, `BoardsView.tsx` search-and-add |
| `#1a1626` | One-off "medium" panel — bigger than a dropdown, not a full modal | `ProfileSwitcher.tsx` manage-profiles panel |
| `#181822` | Slide-over panel background | `WeeklyProgressPanel.tsx` |
| `#0f0f18` | Slide-in drawer background (darkest surface, matches the page gradient's dark end) | `Scratchpad.tsx` |
| `bg-white/5` + `dark:backdrop-blur-md` (no hex) | Card / in-flow panel — translucent, not opaque | `CategoryForm.tsx`, `MiniCalendar.tsx`, `NotesView.tsx` tree/editor panes |

Pattern: **full modals → `#160f24`. Small anchored popovers → `#1a1229`. Edge drawers → the darkest tones (`#0f0f18`/`#181822`). In-flow cards → translucent `bg-white/5`, not a hex at all.** Don't reach for `slate-800`/`slate-900`/`gray-*`/`zinc-*` for any dark-mode surface — the app's dark palette is a purple-tinted family of near-black hexes, and a neutral gray reads as visibly wrong next to it (this is the exact bug that prompted this doc: `NotesView.tsx`'s `RowMenu` menu shipped with `dark:bg-slate-800` while every sibling dropdown used `#1a1229`).

There's also a known minor drift worth knowing about rather than copying: destructive "Delete" menu items use `red-*` in some components (`NotesView.tsx`) and `rose-*` in others (`CategoryChip.tsx`, `DatePickerPopup`) for the same role. Pick whichever is already used by the component you're closest to.

### Light mode

Light mode is uniform — no arbitrary hex values except the page background.

| Surface | Classes |
|---|---|
| Modal / dropdown / panel / drawer bg | `bg-white` |
| Card bg | `bg-white` |
| Inline "well" (inputs, chips) | `bg-slate-50` (inputs) / `bg-slate-100` (chips, badges) |
| Border | `border-slate-200` |
| Primary text | `text-slate-900` |
| Body text | `text-slate-700` / `text-slate-600` |
| Muted/label text | `text-slate-500` / `text-slate-400` |
| Hover surface | `hover:bg-slate-50` (subtle) or `hover:bg-slate-100` (menu items, buttons) |

Base page background: `bg-[#f2f1f5]` light / `dark:bg-[radial-gradient(circle_at_20%_0%,#241a3a_0%,#0f0f18_55%)]` dark (`App.tsx`) — the only gradient in the app.

## Borders, radii, shadows

- Border: `border-slate-200` light / `dark:border-white/10` dark — used on essentially every bordered surface, no deviation found.
- Radii: `rounded-full` (pills, tabs, chips) · `rounded-md` (tree rows, nested list rows) · `rounded-lg` (form inputs, small dropdowns, small buttons) · `rounded-xl` (todo/board item rows) · `rounded-2xl` (**every top-level surface**: modals, drawers, panels, cards).
- Shadow scales with surface prominence: `shadow-sm` (in-flow card) < `shadow-lg` (small popover) < `shadow-xl` (modal/slide-over) < `shadow-2xl` (the one full-height edge drawer, `Scratchpad.tsx`).

## Interactive states

- Primary/CTA button: `bg-gradient-to-r from-violet-500 to-fuchsia-500 text-white hover:opacity-90` — identical everywhere a Save/Add/Confirm/Create action appears. The same gradient is reused for "this is selected" (active tab, active chip, active priority/recurrence option).
- Secondary/outline button: `border-slate-200 hover:bg-slate-100 dark:border-white/10 dark:hover:bg-white/5`.
- Menu/list item hover: `text-slate-700 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-white/10`.
- Icon-only button hover: `text-slate-400 hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-white/10 dark:hover:text-slate-200`.
- Hover-reveal affordances (e.g. a row's kebab menu, pin icon): `opacity-0 group-hover:opacity-100` — never `hidden`/`group-hover:flex`, so nothing after it shifts position on hover. Add `focus-within:opacity-100` when the revealed control is itself focusable (keyboard access).
- Input focus ring: `focus:border-fuchsia-400/60 focus:outline-none` — universal across text inputs/textareas/selects.
- Drag-in-progress: reduced opacity on the source (`opacity-40` or `opacity-50` depending on file — both mean the same thing).

## Typography

| Role | Classes |
|---|---|
| Page title | `text-3xl font-extrabold` + gradient text (`bg-clip-text text-transparent`) |
| Section/panel heading | `text-lg font-semibold` |
| Compact heading | `text-sm font-bold` |
| Group/section label | `text-xs font-bold uppercase tracking-wide text-slate-500` |
| Field label | `text-xs font-medium text-slate-500 dark:text-slate-300` |
| Body/row text | `text-sm` |
| Small badge/pill text | `text-[10px]`/`text-[11px] font-semibold uppercase tracking-wide` |
| Muted/secondary text | `text-slate-500 dark:text-slate-400` |

## Spacing

| Context | Padding |
|---|---|
| Small dropdown/popover | wrapper `py-1`, item `px-3 py-1.5` |
| Full modal | `p-6` (roomy) or `p-4` (compact) |
| Drawer/slide-over | `p-5` |
| Card | `p-4` (or `p-3` for denser lists) |
| List/stack gap | `gap-2` (rows), `gap-2`/`gap-3` (stacked cards) |

## Semantic colors

- **Destructive**: `text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-500/10` or the `rose-*` equivalent (see the drift note above) — pick whichever the sibling code in that component already uses.
- **Accent/brand**: violet→fuchsia gradient for CTAs and selected state; plain `text-fuchsia-600 dark:text-fuchsia-300` for inline links/accents.
- **Priority badges** (defined independently — and identically — in both `TodoItem.tsx` and `TodoSummaryHeader.tsx`; if you touch one, check the other):
  - High: `bg-red-100 text-red-700 dark:bg-red-500/20 dark:text-red-300`
  - Medium: `bg-amber-100 text-amber-700 dark:bg-amber-500/20 dark:text-amber-300`
  - Low: `bg-slate-200 text-slate-600 dark:bg-slate-500/20 dark:text-slate-300`
- **Category colors**: user-chosen, from the curated swatch list in `constants/categoryColors.ts`, applied via inline `style={{ background: category.color }}` — the one legitimate place for a raw per-instance hex, since it's user data rather than a design token.
- **Tags**: neutral `bg-slate-100 dark:bg-white/10`, no color-coding.
- **Office-linked badge**: `bg-cyan-100 text-cyan-700 dark:bg-cyan-500/20 dark:text-cyan-300` — cyan is reserved for this one meaning.
- **Completed/linked indicators**: `text-emerald-500`/`emerald-600`.
- **"Needs attention, click to resolve" flag** (introduced by ticket 24, Planning view's "needs dev/qa" badge): `border-sky-300 bg-sky-100 text-sky-700 dark:border-sky-500/30 dark:bg-sky-500/20 dark:text-sky-300`. Sky is reserved for this one meaning — a clickable prompt to fill in missing data, distinct from the amber Unmapped badge (a real-but-off-roster Jira assignee, not actionable via a click) and from destructive red/rose. Reference: `PlanningView.tsx`'s `TicketBadge` (`needsAssignment` variant).
- **Placeholder ticket badge** (Planning view's non-Jira, manually-created stand-in tickets): `border-violet-300 bg-violet-100 text-violet-700 dark:border-violet-500/30 dark:bg-violet-500/20 dark:text-violet-300`. Violet is reserved for this one meaning — "local to Planning, never synced from Jira" — distinct from the bug/story/task/slate family used for a real Ticket's type. Reference: `PlanningView.tsx`'s `PlaceholderBadge`.

## Component archetypes

Copy the closest one exactly; don't reinvent.

### A. Small anchored dropdown/popover

Trigger button + `absolute`-positioned menu, closes on outside click.

```
wrapper: relative
menu:    absolute right-0 top-[...] z-10 min-w-28 overflow-hidden rounded-lg border border-slate-200 bg-white py-1 shadow-lg dark:border-white/10 dark:bg-[#1a1229]
item:    block w-full px-3 py-1.5 text-left text-sm text-slate-700 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-white/10
```

Reference: `CategoryChip.tsx`, `TagInput.tsx`, `NotesView.tsx` (`RowMenu`), `dateBadge/FloatingPanel.tsx`.

### B. Full modal dialog

`fixed inset-0` backdrop + centered card.

```
backdrop: fixed inset-0 z-[70] flex items-center justify-center bg-black/60 p-4
card:     w-full max-w-sm rounded-2xl border border-slate-200 bg-white p-6 text-slate-900 shadow-xl dark:border-white/10 dark:bg-[#160f24] dark:text-slate-100
```

Reference: `ConfirmDialog.tsx`, `CreateBoardPrompt.tsx`, `MoveToFolderPicker.tsx`, `TodoDetail.tsx`, `BoardSwitcherModal.tsx`.

**Variant: large modal** — same backdrop/card classes, widened for content that needs real width/height (a chart, a wide table), not the base archetype's small confirm/prompt dialogs:

```
backdrop: fixed inset-0 z-[70] flex items-center justify-center bg-black/60 p-4
card:     flex max-h-[90vh] w-full max-w-6xl flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white p-6 text-slate-900 shadow-xl dark:border-white/10 dark:bg-[#160f24] dark:text-slate-100
content:  overflow-auto   (on the inner content wrapper, since the card itself is now height-capped)
```

`max-w-sm` → `max-w-6xl` is the only width change; the base archetype has no height cap at all (its dialogs are always short), so `max-h-[90vh] overflow-hidden` on the card plus `overflow-auto` on the inner content are new, not overridden.

**Variant: near-fullscreen modal** — same backdrop, but the card fills essentially the whole viewport (minus the backdrop's own `p-4` margin) instead of being width/height-capped — for content that wants all the screen it can get (e.g. a dense chart):

```
backdrop: fixed inset-0 z-[70] flex items-center justify-center bg-black/60 p-4
card:     flex h-full w-full flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white p-6 text-slate-900 shadow-xl dark:border-white/10 dark:bg-[#160f24] dark:text-slate-100
content:  overflow-auto   (on the inner content wrapper)
```

`max-h-[90vh] w-full max-w-6xl` → `h-full w-full` is the only change from the large-modal variant: the card grows to fill the padded backdrop box completely instead of capping at a fixed width/vh. Reference: `SprintGanttChart.tsx`'s Gantt chart modal (wayfinder `.scratch/sprint-gantt-chart/` tickets 01/07).

### C. Slide-in/slide-over drawer

Edge-anchored, full-height, heaviest shadow in the app.

```
backdrop: fixed inset-0 z-40 bg-black/50 (or /60, flex justify-end for a right-edge variant)
panel:    fixed inset-y-0 left-0 z-50 flex w-full max-w-md flex-col border-r border-slate-200 bg-white p-5 shadow-2xl dark:border-white/10 dark:bg-[#0f0f18]
```

Reference: `Scratchpad.tsx` (left edge). Right-edge variant with `#181822`/`shadow-xl`: `WeeklyProgressPanel.tsx`.

### D. Card (in-flow panel)

```
rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-white/10 dark:bg-white/5 dark:shadow-none dark:backdrop-blur-md
```

Note dark mode here is translucent (`bg-white/5` + blur), not an opaque hex like B/C/A — that's what distinguishes an in-flow card from a floating surface. Reference: `CategoryForm.tsx`, `MiniCalendar.tsx`, `NotesView.tsx` tree/editor panes, `ScratchNoteCard.tsx`, `WeeklyProgressPanel.tsx` (collapsed state).

**Variant: issue-type-tinted card** (`StatusView.tsx`'s `TicketCard`/`cardAccentClasses`) — swaps the plain border/bg for the same bug/story/task color family as the badge coloring below, at a card-appropriate lower dark-mode opacity:

```
bug:     border-red-300 bg-red-100 dark:border-red-500/30 dark:bg-red-500/10
story:   border-green-300 bg-green-100 dark:border-green-500/30 dark:bg-green-500/10
task:    border-blue-300 bg-blue-100 dark:border-blue-500/30 dark:bg-blue-500/10
neutral: border-slate-200 bg-white dark:border-white/10 dark:bg-white/5 (unchanged Archetype D)
```

Classification (`ticketTypeAccent`, `utils/ticketType.ts`) is shared with the badge coloring below so the two surfaces never drift on what counts as a bug/story/task; each surface still hand-writes its own class string, per this doc's rule.

### E. Primary CTA button

```
rounded-lg (or rounded-full in pill contexts) bg-gradient-to-r from-violet-500 to-fuchsia-500 px-3 py-1.5 text-sm font-semibold text-white hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50
```

Used for nearly every save/create/confirm action app-wide.

### F. Inline "nested results box"

A bordered box in normal document flow (not `absolute`) holding search-result rows, appearing inside a modal or full view — distinct from archetype A (a real popover) even though both look like "a dropdown."

```
rounded-lg border border-slate-200 bg-white p-1 shadow-sm dark:border-white/10 dark:bg-[#1c1330]
```

Reference: `TodoDetail.tsx` linked-todo search, `BoardsView.tsx` search-and-add.

### G. Hover tooltip (CSS-only, not the native `title` attribute)

The native `title` attribute is fine for most one-off hints (still used in most of the app), but gate it out when the browser's own ~1s hover delay would read as sluggish for something meant to be skimmed quickly. Instead: wrap the trigger in a `group relative` span, and give the tooltip `opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 transition-opacity duration-100` so it fades in almost instantly on hover *and* stays reachable for a keyboard user tabbing to a focusable trigger (a `title` attribute shows on focus too, so this CSS-only replacement needs `group-focus-within` to not regress that).

```
wrapper:  group relative inline-flex
tooltip:  pointer-events-none absolute left-1/2 top-full z-10 mt-1 -translate-x-1/2 whitespace-nowrap rounded-lg border border-slate-200 bg-white px-2 py-1 text-[11px] font-normal normal-case text-slate-700 opacity-0 shadow-lg transition-opacity duration-100 group-hover:opacity-100 group-focus-within:opacity-100 dark:border-white/10 dark:bg-[#1a1229] dark:text-slate-200
```

Reference: `PlanningView.tsx`'s `TicketBadge`.
