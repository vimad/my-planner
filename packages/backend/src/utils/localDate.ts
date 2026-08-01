// Shared local calendar-day date math - parse/serialize entirely via local
// constructor arguments and getFullYear/getMonth/getDate, never
// new Date(dateString) or toISOString() (UTC, can shift the day). Mirrors
// the day-shift-bug precedent already established by routes/todos.ts's
// advanceDueDate, extracted here since the weekly-summary bucketer and
// route both need the same parse/serialize/Monday-snap logic.
export function parseLocalDate(iso: string): Date {
  const [year, month, day] = iso.split('-').map(Number)
  return new Date(year, month - 1, day)
}

export function toLocalDateString(date: Date): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

export function addDays(iso: string, days: number): string {
  const date = parseLocalDate(iso)
  date.setDate(date.getDate() + days)
  return toLocalDateString(date)
}

// Monday of the week containing `iso`. getDay() is 0=Sun..6=Sat, so Sunday
// needs a -6 day shift back to the prior Monday rather than the +1-Monday
// math that works for Mon-Sat.
export function mondayOf(iso: string): string {
  const date = parseLocalDate(iso)
  const dow = date.getDay()
  const diffToMonday = dow === 0 ? -6 : 1 - dow
  return addDays(iso, diffToMonday)
}
