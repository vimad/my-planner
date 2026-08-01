// Local calendar-day date math for the Summary tab's week navigation and
// display formatting - mirrors the backend's identical helpers
// (packages/backend/src/utils/localDate.ts) and the validated prototype's
// mockData.ts, all of which parse/serialize via getFullYear/getMonth/
// getDate (local time), never new Date(dateString) or toISOString() (UTC,
// can shift the day). Reuses dateAgenda.ts's parseLocalDate rather than
// redefining it.
import { parseLocalDate } from './dateAgenda'

export function addDays(iso: string, days: number): string {
  const date = parseLocalDate(iso)
  date.setDate(date.getDate() + days)
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
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

export function formatWeekRange(weekStart: string, weekEnd: string): string {
  const fmt = (iso: string) => parseLocalDate(iso).toLocaleDateString('default', { month: 'short', day: 'numeric' })
  return `${fmt(weekStart)} – ${fmt(weekEnd)}`
}

export function formatSegmentDate(iso: string, todayISO: string): string {
  if (iso === todayISO) return 'Today'
  if (iso === addDays(todayISO, -1)) return 'Yesterday'
  if (iso === addDays(todayISO, 1)) return 'Tomorrow'
  return parseLocalDate(iso).toLocaleDateString('default', { month: 'short', day: 'numeric' })
}
