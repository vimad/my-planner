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
// Returns 0 for an invalid/inverted range (endDate < startDate) - the route
// layer is responsible for rejecting an invalid range before it ever reaches
// this function, so 0 here is a defensive default, not a user-facing signal.
export function computeWorkingDays(startDate: string, endDate: string, holidays: string[]): number {
  if (endDate < startDate) return 0

  const holidaySet = new Set(holidays)
  let count = 0
  const cursor = parseLocalDate(startDate)
  const end = parseLocalDate(endDate)

  while (cursor.getTime() <= end.getTime()) {
    const dayOfWeek = cursor.getDay() // 0 = Sunday, 6 = Saturday
    const isWeekend = dayOfWeek === 0 || dayOfWeek === 6
    if (!isWeekend && !holidaySet.has(toLocalDateString(cursor))) {
      count += 1
    }
    cursor.setDate(cursor.getDate() + 1)
  }

  return count
}
