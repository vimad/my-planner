# 06 — Sprint date-range-change reconciliation

Type: grilling
Status: open
Blocked by: 05

## Question

If `TeamSprintPlan.startDate`/`endDate` or `holidays` change after Gantt start-date overrides already exist for that sprint, how should those overrides reconcile on next read?

Cases to cover: an override that now falls before the new `startDate`, after the new `endDate`, or on a day that's now a holiday. Options include clamping, dropping the override (falling back to auto-placement), or leaving it as-is with a visual warning. Mirror the `reconcileWithWorkingDates` precedent (`packages/backend/src/routes/capacity.ts`) used for `leaveEntries` where it genuinely fits — but don't assume it transfers 1:1 without checking.

Depends on Ticket 05's persistence model to know exactly what's being reconciled.
