import { GROUP_ORDER, groupLabel, localTodayISO } from '../utils/dateAgenda'
import { TodoItem } from './TodoItem'

// Groups open (non-completed) todos into Overdue / Today / Tomorrow / This
// week / Later / No date, skipping empty sections. "Today" is recomputed
// live from the current date on every render, never from a stored flag.
export function AgendaGroups({ todos, categoriesById, onToggle, onDelete }) {
  const todayISO = localTodayISO()
  const open = todos.filter((t) => !t.completed)

  const groups = GROUP_ORDER.map((label) => ({
    label,
    items: open.filter((t) => groupLabel(t.dueDate, todayISO) === label),
  })).filter((g) => g.items.length > 0)

  if (groups.length === 0) {
    return <p className="text-sm text-slate-400">Nothing on your agenda — you're all caught up.</p>
  }

  return (
    <div className="flex flex-col gap-5">
      {groups.map((g) => (
        <div key={g.label}>
          <p className="mb-2 text-xs font-bold uppercase tracking-wide text-slate-400">{g.label}</p>
          <div className="flex flex-col gap-2">
            {g.items.map((todo) => (
              <TodoItem
                key={todo._id ?? todo.id}
                todo={todo}
                isDueToday={todo.dueDate === todayISO}
                category={categoriesById?.[todo.categoryId]}
                onToggle={onToggle}
                onDelete={onDelete}
              />
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}
