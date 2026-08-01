import { effectiveDueDate, GROUP_ORDER, groupLabel, localTodayISO } from '../utils/dateAgenda'
import { getId } from '../utils/getId'
import type { BoardQuickAddState, Category, Todo, TodoPriority } from '../types'
import { TodoItem } from './TodoItem'

const PRIORITY_RANK: Record<TodoPriority, number> = { High: 0, Medium: 1, Low: 2 }

function comparePriority(a: Todo, b: Todo): number {
  const rankA = PRIORITY_RANK[a.priority ?? 'Medium'] ?? PRIORITY_RANK.Medium
  const rankB = PRIORITY_RANK[b.priority ?? 'Medium'] ?? PRIORITY_RANK.Medium
  return rankA - rankB
}

interface AgendaGroupsProps {
  todos: Todo[]
  categoriesById?: Record<string, Category>
  onToggle: (id: string) => void
  onDelete: (id: string) => void
  onOpen?: (todo: Todo) => void
  sortByPriority?: boolean
  nextOfficeDay?: string | null
  // Threaded straight through to TodoItem - see TodoItem's own doc comment.
  boardQuickAdd?: BoardQuickAddState
}

// Groups open (non-completed) todos into Overdue / Today / Tomorrow / This
// week / Later / No date, skipping empty sections. "Today" is recomputed
// live from the current date on every render, never from a stored flag.
// When `sortByPriority` is on, each group's items are additionally ordered
// High -> Medium -> Low; the date grouping itself never changes. Array#sort
// is spec-stable, so passing a no-op comparator when the toggle is off keeps
// the original (creation) order intact.
export function AgendaGroups({
  todos,
  categoriesById,
  onToggle,
  onDelete,
  onOpen,
  sortByPriority = false,
  nextOfficeDay = null,
  boardQuickAdd,
}: AgendaGroupsProps) {
  const todayISO = localTodayISO()
  const open = todos.filter((t) => !t.completed)

  const groups = GROUP_ORDER.map((label) => ({
    label,
    items: open
      .filter((t) => groupLabel(effectiveDueDate(t, nextOfficeDay, todayISO), todayISO) === label)
      .sort((a, b) => (sortByPriority ? comparePriority(a, b) : 0)),
  })).filter((g) => g.items.length > 0)

  if (groups.length === 0) {
    return (
      <p className="text-sm text-slate-500 dark:text-slate-400">
        Nothing on your agenda — you're all caught up.
      </p>
    )
  }

  return (
    <div className="flex flex-col gap-5">
      {groups.map((g) => (
        <div key={g.label}>
          <p className="mb-2 text-xs font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">
            {g.label}
          </p>
          <div className="flex flex-col gap-2">
            {g.items.map((todo) => (
              <TodoItem
                key={getId(todo)}
                todo={todo}
                isDueToday={effectiveDueDate(todo, nextOfficeDay, todayISO) === todayISO}
                category={categoriesById?.[todo.categoryId ?? '']}
                onToggle={onToggle}
                onDelete={onDelete}
                onOpen={onOpen}
                boardQuickAdd={boardQuickAdd}
              />
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}
