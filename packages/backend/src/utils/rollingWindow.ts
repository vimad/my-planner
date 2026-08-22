import { parseLocalDate, toLocalDateString } from './localDate.ts'

// Length of the Atlas Planning tab's rolling window (.scratch/
// atlas-planning-tab, ticket 02) - "today through today + 13 days", i.e. two
// calendar weeks inclusive of today. Exported so callers never hardcode the
// literal 14 (e.g. array-length assertions, ticket 03's Gantt axis).
export const ROLLING_WINDOW_LENGTH = 14

// Computes the Atlas Planning tab's rolling two-week window as
// 'YYYY-MM-DD' calendar-day strings: [today, today + 13 days], recomputed at
// read time on every call. Shared, byte-for-byte-identical logic backs the
// leave grid, the holiday chip row, and (ticket 03) the Gantt chart's date
// axis, so none of them can drift out of sync with one another - there is no
// stored "period" anywhere in this feature, unlike TeamSprintPlan's
// manually-picked date range.
//
// `now` defaults to `new Date()` but is always taken as an explicit
// parameter rather than calling `new Date()` internally, so tests can inject
// a fixed instant instead of depending on the real wall clock. Dates are
// plain local calendar-day strings throughout (parseLocalDate/
// toLocalDateString, both local-constructor-argument based) - never
// `Date#toISOString()`, which converts through UTC and can silently shift
// the day in a UTC+ environment (the same convention already used by
// services/sprintWorkingDays.ts and TeamSprintPlan's date fields).
export function computeRollingWindowDates(now: Date = new Date()): string[] {
  const cursor = parseLocalDate(toLocalDateString(now))
  const dates: string[] = []
  for (let i = 0; i < ROLLING_WINDOW_LENGTH; i++) {
    dates.push(toLocalDateString(cursor))
    cursor.setDate(cursor.getDate() + 1)
  }
  return dates
}
