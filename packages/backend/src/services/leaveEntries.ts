// Pure per-date sprint leave math (spec ".scratch/sprint-leave-picker/
// spec.md") - kept free of Mongoose/route concerns so its edge cases are
// directly unit-testable, sibling in style to capacityFormula.ts/
// sprintWorkingDays.ts. Promoted verbatim from the throwaway
// `prototype/sprint-leave-picker` branch's services/sprintLeavePrototype.ts,
// which validated this shape (see the spec's Further Notes).

export type LeavePortion = 'full' | 'half'

export interface LeaveEntry {
  date: string // 'YYYY-MM-DD' - must be one of the sprint's current working dates
  portion: LeavePortion
}

const PORTION_DAYS: Record<LeavePortion, number> = { full: 1, half: 0.5 }

// Sets (or overwrites) the leave portion for a date. Setting a date that
// already has an entry replaces it rather than duplicating - a date can
// only ever be in one of {no leave, half, full}.
export function setLeave(entries: LeaveEntry[], date: string, portion: LeavePortion): LeaveEntry[] {
  const withoutDate = entries.filter((e) => e.date !== date)
  return [...withoutDate, { date, portion }].sort((a, b) => a.date.localeCompare(b.date))
}

export function clearLeave(entries: LeaveEntry[], date: string): LeaveEntry[] {
  return entries.filter((e) => e.date !== date)
}

// Drops any leave entry whose date is no longer in the sprint's working
// dates. Mirrors the already-validated "narrowing the range silently drops
// an out-of-range holiday" behavior for TeamSprintPlan.holidays - applied
// here to leave entries instead, since a date that becomes a holiday (or
// falls outside a narrowed range) can no longer be "on leave from work you
// wouldn't have been doing anyway." Read-time only - see routes/capacity.ts,
// never a write cascade (spec's "Reconciliation is read-time" decision).
export function reconcileWithWorkingDates(entries: LeaveEntry[], workingDates: string[]): LeaveEntry[] {
  const workingSet = new Set(workingDates)
  return entries.filter((e) => workingSet.has(e.date))
}

export function totalLeaveDays(entries: LeaveEntry[]): number {
  return entries.reduce((sum, e) => sum + PORTION_DAYS[e.portion], 0)
}
