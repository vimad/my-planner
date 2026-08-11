import { parseLocalDate } from './dateAgenda'

// Formats a Date's LOCAL fields into "YYYY-MM-DD" - never
// Date#toISOString(), which converts through UTC and silently shifts the
// calendar day in a UTC+ environment (the bug this feature's timezone
// decision is built around; see PlanningView.tsx's own toLocalDateString
// and dateAgenda.ts's localTodayISO()).
function toLocalDateString(date: Date): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

// A sprint period's actual working-day calendar: inclusive of both dates,
// excludes Saturday/Sunday and any date in `holidays`. Mirrors the backend's
// services/sprintWorkingDays.ts::computeWorkingDates rule-for-rule (the two
// must never disagree - see that module's own comment) - reimplemented here
// rather than shared across the package boundary, same posture as every
// other date helper duplicated between packages/backend and
// packages/frontend in this codebase.
//
// Shared by SprintPeriodForm's working-day count (PlanningView.tsx) and
// SprintLeaveGrid's column list - previously each derived its own inline
// weekend/holiday filter; this is the one implementation both use now (spec
// ".scratch/sprint-leave-picker/spec.md"). Returns [] for a blank/inverted
// range.
export function computeWorkingDates(startDate: string, endDate: string, holidays: string[]): string[] {
  if (!startDate || !endDate || endDate < startDate) return []

  const holidaySet = new Set(holidays)
  const dates: string[] = []
  const cursor = parseLocalDate(startDate)
  const last = parseLocalDate(endDate)

  while (cursor.getTime() <= last.getTime()) {
    const dayOfWeek = cursor.getDay() // 0 = Sunday, 6 = Saturday
    const isWeekend = dayOfWeek === 0 || dayOfWeek === 6
    const iso = toLocalDateString(cursor)
    if (!isWeekend && !holidaySet.has(iso)) dates.push(iso)
    cursor.setDate(cursor.getDate() + 1)
  }

  return dates
}
