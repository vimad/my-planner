// Agenda-grouping helpers. dueDate is always a local calendar-day string
// ("YYYY-MM-DD"), never a UTC timestamp — parsing/comparing must stay in
// local terms (getFullYear/getMonth/getDate), never Date#toISOString(),
// which silently shifts the day depending on timezone.

// The bucket a todo's due date falls into for agenda grouping/highlighting.
export type GroupLabel = 'Overdue' | 'Today' | 'Tomorrow' | 'This week' | 'Later' | 'No date'

export const GROUP_ORDER: GroupLabel[] = [
  'Overdue',
  'Today',
  'Tomorrow',
  'This week',
  'Later',
  'No date',
]

// Minimal shape `effectiveDueDate` needs from a todo. Intentionally not the
// full Todo type (not yet centralized as of Issue 05 — components still
// pass plain object literals) — Issues 06/07 should widen/replace this with
// the shared Todo type once one exists, as long as it's structurally
// compatible with these two fields.
export interface DueDateFields {
  dueDate?: string | null
  officeLinked?: boolean
}

// Local "today" as a YYYY-MM-DD string, computed live from the given Date
// (defaults to `new Date()` at call time — never cached/stored).
export function localTodayISO(date: Date = new Date()): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

// Parses a "YYYY-MM-DD" string into a local midnight Date, entirely via
// local constructor arguments (no UTC parsing involved).
function parseLocalDate(dateStr: string): Date {
  const [year, month, day] = dateStr.split('-').map(Number)
  return new Date(year, month - 1, day)
}

// A todo's due date for grouping/highlighting: its real dueDate if set,
// otherwise the shared "next office day" when the todo is office-linked —
// but only while that day hasn't already passed. A stale nextOfficeDay
// (already in the past) contributes nothing, so office-linked todos fall
// back to "No date" rather than "Overdue": a missed office day isn't a
// broken deadline, it just means no office day is scheduled right now,
// until the next one is set. Validated by hand in the office-day prototype
// (see prototype-office-day/, throwaway branch prototype/office-day).
export function effectiveDueDate(
  todo: DueDateFields,
  nextOfficeDay: string | null | undefined,
  todayISO: string = localTodayISO(),
): string | null {
  if (todo.dueDate) return todo.dueDate
  if (todo.officeLinked && nextOfficeDay && nextOfficeDay >= todayISO) return nextOfficeDay
  return null
}

export function groupLabel(
  dueDate: string | null | undefined,
  todayISO: string = localTodayISO(),
): GroupLabel {
  if (!dueDate) return 'No date'
  if (dueDate === todayISO) return 'Today'

  const diffDays = Math.round(
    (parseLocalDate(dueDate).getTime() - parseLocalDate(todayISO).getTime()) / 86_400_000,
  )

  if (diffDays < 0) return 'Overdue'
  if (diffDays === 1) return 'Tomorrow'
  if (diffDays > 1 && diffDays <= 7) return 'This week'
  return 'Later'
}

// An inclusive [start, end] pair of "YYYY-MM-DD" strings, driven by the
// MiniCalendar date/range filter.
export interface DateRange {
  start: string
  end: string
}

// Whether a due date falls within a selected range, inclusive of both ends.
// A null range means "no filter" - everything matches. A null due date can
// never match a real range, since there's nothing to compare. Plain string
// comparison is enough here since dueDate/range strings are always
// zero-padded "YYYY-MM-DD" and therefore already lexically ordered.
export function matchesDateRange(
  dueDate: string | null | undefined,
  range: DateRange | null,
): boolean {
  if (!range) return true
  if (!dueDate) return false
  return dueDate >= range.start && dueDate <= range.end
}
