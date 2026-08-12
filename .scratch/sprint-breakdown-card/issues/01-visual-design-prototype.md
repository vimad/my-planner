Type: prototype
Status: open

## Question

What should the Sprint Breakdown card actually look like, and how does the "Tickets by person" table's layout change to make room for it?

Resolve via a `/prototype` session against the real Planning view (or a close mock of it), exploring at least:

- **Layout split**: exact proportions for the table (shrinks) vs. the new card (right side) — full-width flex/grid row, fixed card width vs. proportional, and how it behaves at narrower viewport widths.
- **Card contents, top to bottom**: header ("Sprint breakdown"), headline total dev estimation (`formatDaysHours` format, e.g. "1d 4h"), the Recharts pie (Features/Technical items/Bugs, light green/light blue/light red per the map's Notes), and the separate legend (swatch + bucket name + percentage + `(Xd Yh)` per bucket).
- **Empty state**: what renders when zero dev-role hours are planned yet (pie has nothing to show).
- **Checkbox placement**: where "part of a feature" sits within `TicketInfoPopup.tsx`, and its exact copy.
- Percentage rounding behavior (nearest whole %, and how a 3-slice split that doesn't sum to exactly 100% after rounding is handled, if at all).

Preserve the prototype on a throwaway branch (`prototype/sprint-breakdown-card`, per this repo's established convention) and link it from the resolution.
