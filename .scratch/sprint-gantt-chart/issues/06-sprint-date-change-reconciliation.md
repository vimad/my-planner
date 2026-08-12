# 06 — Sprint date-range-change reconciliation

Type: grilling
Status: resolved
Blocked by: 05

## Question

If `TeamSprintPlan.startDate`/`endDate` or `holidays` change after Gantt start-date overrides already exist for that sprint, how should those overrides reconcile on next read?

Cases to cover: an override that now falls before the new `startDate`, after the new `endDate`, or on a day that's now a holiday. Options include clamping, dropping the override (falling back to auto-placement), or leaving it as-is with a visual warning. Mirror the `reconcileWithWorkingDates` precedent (`packages/backend/src/routes/capacity.ts`) used for `leaveEntries` where it genuinely fits — but don't assume it transfers 1:1 without checking.

Depends on Ticket 05's persistence model to know exactly what's being reconciled.

## Answer

The three cases collapse into two treatments:

**Override lands on a now-invalid day** — either before the new `startDate`, or on a day newly marked a holiday — **clamp forward to the next valid working day**, silently, no visual warning. This deliberately does **not** mirror `reconcileWithWorkingDates`'s drop-the-entry precedent (`services/leaveEntries.ts`, used by `routes/capacity.ts` for `leaveEntries`): a leave entry is tied to one specific real-world day off with no substitute, so dropping is the only sensible move; a Gantt start-date override just means "begin around here," so shifting it forward preserves the user's intent, whereas dropping to full auto-placement could relocate the bar somewhere entirely different in walk-forward order and feel like the drag silently vanished. No visual warning, consistent with the app's existing autosave/no-confirmation conventions (Leave grid, Planning reorder).

**Override lands after a narrowed `endDate`** — left exactly as stored, no reconciliation needed. The map's Decided section already establishes a bar past `endDate` as a supported "spillover" view (axis extends rather than clips) — narrowing `endDate` just means more overrides now sit in that already-expected zone, not an error state.

**Implementation note**: no "clamp to next working day" helper exists yet anywhere in the codebase (checked `services/sprintWorkingDays.ts` and both packages) — this reconciliation needs a small new pure function alongside `computeWorkingDates`, applied read-time to `ganttStartDate`/`devGanttStartDate`/`qaGanttStartDate` the same way `reconcileWithWorkingDates` is applied to `leaveEntries` today (never a write cascade, per the map's Decided "reconciled on read" constraint).
