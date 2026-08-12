Type: prototype
Status: resolved

## Question

What should the Sprint Breakdown card actually look like, and how does the "Tickets by person" table's layout change to make room for it?

Resolve via a `/prototype` session against the real Planning view (or a close mock of it), exploring at least:

- **Layout split**: exact proportions for the table (shrinks) vs. the new card (right side) — full-width flex/grid row, fixed card width vs. proportional, and how it behaves at narrower viewport widths.
- **Card contents, top to bottom**: header ("Sprint breakdown"), headline total dev estimation (`formatDaysHours` format, e.g. "1d 4h"), the Recharts pie (Features/Technical items/Bugs, light green/light blue/light red per the map's Notes), and the separate legend (swatch + bucket name + percentage + `(Xd Yh)` per bucket).
- **Empty state**: what renders when zero dev-role hours are planned yet (pie has nothing to show).
- **Checkbox placement**: where "part of a feature" sits within `TicketInfoPopup.tsx`, and its exact copy.
- Percentage rounding behavior (nearest whole %, and how a 3-slice split that doesn't sum to exactly 100% after rounding is handled, if at all).

Preserve the prototype on a throwaway branch (`prototype/sprint-breakdown-card`, per this repo's established convention) and link it from the resolution.

## Answer

Resolved via a `/prototype` UI session (sub-shape A, mounted on the real Planning view behind `?variant=`) with three structurally different variants — full code on branch `prototype/sprint-breakdown-card` (commit `a49ef79`). User picked **Variant A — "Stacked sidebar"**.

- **Layout split**: card is a fixed-width sidebar (`lg:w-80`) to the right of the table, which takes the remaining space (`lg:flex-1 min-w-0`) inside a `flex flex-col gap-4 lg:flex-row lg:items-start` row. Below the `lg` breakpoint the card drops to full width below the table (simple stack, not a disclosure or grid reflow — those were Variant B/C's alternatives, not picked).
- **Card contents, top to bottom**: header "Sprint breakdown" → headline total dev estimate on its own line (`formatDaysHours`, e.g. "1d 4h") → Recharts donut (`innerRadius=40 outerRadius=64`, no center label) → a vertical legend list below it, one row per bucket: swatch, bucket name, right-aligned `NN% (Xd Yh)`.
- **Colors**: Features `#86efac` (green-300), Technical items `#93c5fd` (blue-300), Bugs `#fca5a5` (red-300) — pale strength of the existing story/task/bug hues, confirmed against all three variants, not variant-specific.
- **Empty state** (zero dev-role hours planned): pie area replaced by a dashed-circle placeholder + "No dev tickets planned yet", headline still renders "0h", legend rows still render at 0%.
- **Checkbox placement/copy** ("part of a feature", `TicketInfoPopup.tsx`): sits as its own bordered block right after the ticket title, before the "Planning assignee" field. Label "Counts as a Feature", helper text "Included in the Features slice of the Sprint breakdown card, instead of Technical items."
- **Percentage rounding**: largest-remainder method (round each bucket's raw percentage down, then hand out the leftover points to the buckets with the largest fractional remainder) — guarantees the three slices' whole-percent figures always sum to exactly 100, never 99/101. This was validated identically across all three variants, not variant-specific.

Variants B ("Donut + disclosure": proportional width, headline inside the donut hole, horizontal 3-up legend chips, collapse-behind-a-toggle on narrow viewports) and C ("Legend-first": headline as a header pill, legend rows lead with a smaller pie underneath, grid-reflow on narrow viewports) were built and compared but not picked — full code for both stays on the prototype branch as reference, not folded into main.

Real implementation (backend `TicketFeatureOverride` collection + PATCH route + `loadFeatureOverrides` service, permanent `SprintBreakdownCard` component wired to real data, real checkbox in `TicketInfoPopup.tsx`, dropping all prototype/variant-switcher scaffolding) is being built directly off this answer — see the map's Decisions-so-far for the outcome.
