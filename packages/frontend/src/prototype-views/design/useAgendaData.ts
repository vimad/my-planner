// PROTOTYPE — shared data shaping for the "Visual Design & Styling Approach" ticket. Wipe me.
import { categories, todos, categoryById, categoryCounts, TODAY_ISO } from '../mockData'

function groupLabel(dueDate: string | null): string {
  if (!dueDate) return 'No date'
  if (dueDate === TODAY_ISO) return 'Today'
  const diff = Math.round((new Date(dueDate).getTime() - new Date(TODAY_ISO).getTime()) / 86400000)
  if (diff === 1) return 'Tomorrow'
  if (diff > 1 && diff <= 7) return 'This week'
  if (diff < 0) return 'Overdue'
  return 'Later'
}

export function useAgendaGroups() {
  const open = todos.filter((t) => !t.completed)
  const order = ['Overdue', 'Today', 'Tomorrow', 'This week', 'Later', 'No date']
  return order
    .map((label) => ({
      label,
      items: open.filter((t) => groupLabel(t.dueDate) === label).map((t) => ({ ...t, category: categoryById[t.categoryId] })),
    }))
    .filter((g) => g.items.length > 0)
}

export function useCategorySummary() {
  return categories.map((c) => ({ ...c, ...categoryCounts(c.id) }))
}

export function useMiniCalendar() {
  const dueDates = new Set(todos.filter((t) => t.dueDate).map((t) => t.dueDate))
  const today = new Date()
  const year = today.getFullYear()
  const month = today.getMonth()
  const startOffset = new Date(year, month, 1).getDay()
  const daysInMonth = new Date(year, month + 1, 0).getDate()
  const cells: (number | null)[] = [
    ...Array(startOffset).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ]
  const isoFor = (day: number) => `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`

  return {
    label: today.toLocaleString('default', { month: 'long', year: 'numeric' }),
    cells: cells.map((day) => (day ? { day, iso: isoFor(day), hasDue: dueDates.has(isoFor(day)), isToday: isoFor(day) === TODAY_ISO } : null)),
  }
}
