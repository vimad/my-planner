// Agenda-grouping helpers. dueDate is always a local calendar-day string
// ("YYYY-MM-DD"), never a UTC timestamp — parsing/comparing must stay in
// local terms (getFullYear/getMonth/getDate), never Date#toISOString(),
// which silently shifts the day depending on timezone.

export const GROUP_ORDER = ['Overdue', 'Today', 'Tomorrow', 'This week', 'Later', 'No date']

// Local "today" as a YYYY-MM-DD string, computed live from the given Date
// (defaults to `new Date()` at call time — never cached/stored).
export function localTodayISO(date = new Date()) {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

// Parses a "YYYY-MM-DD" string into a local midnight Date, entirely via
// local constructor arguments (no UTC parsing involved).
function parseLocalDate(dateStr) {
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
export function effectiveDueDate(todo, nextOfficeDay, todayISO = localTodayISO()) {
  if (todo.dueDate) return todo.dueDate
  if (todo.officeLinked && nextOfficeDay && nextOfficeDay >= todayISO) return nextOfficeDay
  return null
}

export function groupLabel(dueDate, todayISO = localTodayISO()) {
  if (!dueDate) return 'No date'
  if (dueDate === todayISO) return 'Today'

  const diffDays = Math.round((parseLocalDate(dueDate) - parseLocalDate(todayISO)) / 86_400_000)

  if (diffDays < 0) return 'Overdue'
  if (diffDays === 1) return 'Tomorrow'
  if (diffDays > 1 && diffDays <= 7) return 'This week'
  return 'Later'
}
