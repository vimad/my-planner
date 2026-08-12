import { parseLocalDate, toLocalDateString } from '../utils/localDate.ts'

// Pure working-day math for a Team Sprint Plan's picked date range (spec
// "Sprint Period & Holiday Picker") - kept free of Mongoose/route concerns so
// its date-arithmetic edge cases are directly unit-testable, sibling in style
// to capacityFormula.ts.
//
// Dates are plain 'YYYY-MM-DD' calendar-day strings throughout, never `Date`
// objects round-tripped through toISOString() - that conversion goes through
// UTC and silently shifts the day in a UTC+ environment (the bug found and
// fixed during this feature's /prototype session). A `Date` is only ever
// constructed transiently inside the iteration loop below, via
// utils/localDate.ts's parse/serialize helpers (local year/month/day parts
// only), and immediately discarded back to a string.

// Inclusive of both startDate and endDate. Excludes Saturday/Sunday.
// Excludes any date present in `holidays`, whether or not it's also a
// weekend or outside the range (a no-op in either case, not an error).
// Returns [] for an invalid/inverted range (endDate < startDate) - the route
// layer is responsible for rejecting an invalid range before it ever reaches
// this function, so [] here is a defensive default, not a user-facing
// signal. Also backs capacity.ts's read-time leaveEntries reconciliation
// (spec ".scratch/sprint-leave-picker/spec.md") and the frontend grid's own
// column list (packages/frontend/src/utils/sprintWorkingDates.ts, a
// same-rules port since the two can't share source across the package
// boundary) - all three must never disagree, see sprintWorkingDays.test.ts's
// cross-check.
export function computeWorkingDates(startDate: string, endDate: string, holidays: string[]): string[] {
  if (endDate < startDate) return []

  const holidaySet = new Set(holidays)
  const dates: string[] = []
  const cursor = parseLocalDate(startDate)
  const end = parseLocalDate(endDate)

  while (cursor.getTime() <= end.getTime()) {
    const dayOfWeek = cursor.getDay() // 0 = Sunday, 6 = Saturday
    const isWeekend = dayOfWeek === 0 || dayOfWeek === 6
    const iso = toLocalDateString(cursor)
    if (!isWeekend && !holidaySet.has(iso)) {
      dates.push(iso)
    }
    cursor.setDate(cursor.getDate() + 1)
  }

  return dates
}

// Thin wrapper over computeWorkingDates - kept as its own function (rather
// than inlined at every call site) since most callers (routes/
// teamSprintPlans.ts, the capacity formula) only ever need the count, not
// the actual dates.
export function computeWorkingDays(startDate: string, endDate: string, holidays: string[]): number {
  return computeWorkingDates(startDate, endDate, holidays).length
}

// Clamps `date` forward to the next day that is a working day by
// computeWorkingDates's own rules (not a weekend, not in `holidays`) and not
// before `startDate` - the read-time reconciliation primitive backing
// Ticket 10's Gantt start-date-override reconciliation (spec ".scratch/
// sprint-gantt-chart/issues/06-sprint-date-change-reconciliation.md"): an
// override that now falls before a sprint start that moved later, or on a
// day newly marked a holiday, clamps forward silently rather than being
// dropped - a Gantt override just means "begin around here", so shifting it
// forward preserves the user's intent (unlike leaveEntries.ts's
// reconcileWithWorkingDates, which drops instead, since a leave day has no
// substitute).
//
// Deliberately NOT bounded by `endDate`, even though it's part of the same
// three-argument calendar shape as computeWorkingDates/computeWorkingDays
// (so callers can pass the exact same TeamSprintPlan fields to both). If
// every remaining day through `endDate` is a holiday, this keeps walking
// past it - already a supported "spillover" view per the map's Decided
// section (the Gantt axis extends past endDate rather than clipping), so
// landing there is the expected outcome, not a case needing its own
// null/error signal.
//
// A `date` that's already a valid working day on/after `startDate` is
// returned unchanged (the loop finds it on the first iteration) - callers
// only need to invoke this when they've already determined the date is
// invalid, but it's safe to call unconditionally too.
export function clampToNextWorkingDay(date: string, startDate: string, endDate: string, holidays: string[]): string {
  const holidaySet = new Set(holidays)
  const cursor = parseLocalDate(date < startDate ? startDate : date)

  while (true) {
    const dayOfWeek = cursor.getDay() // 0 = Sunday, 6 = Saturday
    const isWeekend = dayOfWeek === 0 || dayOfWeek === 6
    const iso = toLocalDateString(cursor)
    if (!isWeekend && !holidaySet.has(iso)) return iso
    cursor.setDate(cursor.getDate() + 1)
  }
}
