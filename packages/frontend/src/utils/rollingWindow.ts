import { parseLocalDate } from './dateAgenda'

// Formats a Date's LOCAL fields into "YYYY-MM-DD" - never Date#toISOString(),
// which converts through UTC and silently shifts the calendar day in a UTC+
// environment. Own tiny copy rather than an import from sprintWorkingDates.ts
// (Sprint Planning's own module, off-limits per this feature's module
// boundary) - same "duplicated between packages/across features" posture as
// every other date helper in this codebase (see sprintWorkingDays.ts's own
// comment on this).
function toLocalDateString(date: Date): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

// Length of the Atlas Planning tab's rolling window (.scratch/
// atlas-planning-tab, ticket 02) - "today through today + 13 days", i.e. two
// calendar weeks inclusive of today. Exported so callers never hardcode the
// literal 14.
export const ROLLING_WINDOW_LENGTH = 14

// Computes the Atlas Planning tab's rolling two-week window as 'YYYY-MM-DD'
// calendar-day strings: [today, today + 13 days], recomputed at read time on
// every call. The frontend twin of packages/backend/src/utils/
// rollingWindow.ts (the two packages share no code, per this codebase's
// established convention - see sprintWorkingDays.ts vs sprintWorkingDates.ts
// for the same split). Shared, byte-for-byte-identical logic backs the leave
// grid, the holiday chip row, and (ticket 03) the Gantt chart's date axis, so
// none of them can drift out of sync with one another - there is no stored
// "period" anywhere in this feature.
//
// `now` defaults to `new Date()` but is always taken as an explicit
// parameter rather than calling `new Date()` internally, so tests (and every
// caller here) can inject a fixed instant instead of depending on the real
// wall clock.
export function computeRollingWindowDates(now: Date = new Date()): string[] {
  const cursor = parseLocalDate(toLocalDateString(now))
  const dates: string[] = []
  for (let i = 0; i < ROLLING_WINDOW_LENGTH; i++) {
    dates.push(toLocalDateString(cursor))
    cursor.setDate(cursor.getDate() + 1)
  }
  return dates
}
