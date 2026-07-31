// Local-calendar-day date math for the date-badge feature. Mirrors the
// discipline in utils/dateAgenda.ts: dates are always "YYYY-MM-DD" strings
// built/parsed via local Date getters, never Date#toISOString() (which
// shifts the day depending on timezone).
import { localTodayISO } from '../../utils/dateAgenda'

export { localTodayISO }

function parseLocalDate(iso: string): Date {
  const [year, month, day] = iso.split('-').map(Number)
  return new Date(year, month - 1, day)
}

function toLocalISO(date: Date): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

export function addDaysISO(iso: string, days: number): string {
  const date = parseLocalDate(iso)
  date.setDate(date.getDate() + days)
  return toLocalISO(date)
}

export function isoFromDate(date: Date): string {
  return toLocalISO(date)
}

export function dateFromISO(iso: string): Date {
  return parseLocalDate(iso)
}

// Badge display label: relative for the days right around today, otherwise
// a short "Jul 30" (or "Jul 30, 2027" when not the current year).
export function formatBadgeLabel(iso: string, today: string = localTodayISO()): string {
  if (iso === today) return 'Today'
  if (iso === addDaysISO(today, 1)) return 'Tomorrow'
  if (iso === addDaysISO(today, -1)) return 'Yesterday'

  const date = parseLocalDate(iso)
  const currentYear = parseLocalDate(today).getFullYear()
  return date.toLocaleDateString('default', {
    month: 'short',
    day: 'numeric',
    year: date.getFullYear() === currentYear ? undefined : 'numeric',
  })
}
