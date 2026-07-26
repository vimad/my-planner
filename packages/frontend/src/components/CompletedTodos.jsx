import { getId } from '../utils/getId'
import { TodoItem } from './TodoItem'

// Flat list of completed todos, most recently completed first. Unlike
// AgendaGroups this doesn't bucket by due date - "Overdue"/"Today" stop
// meaning anything once a todo is done - it's just a browsable history,
// shown behind the "Show completed" toggle so it doesn't clutter the
// everyday agenda view.
export function CompletedTodos({ todos, categoriesById, onToggle, onDelete, onOpen }) {
  const completed = todos
    .filter((t) => t.completed)
    .sort((a, b) => new Date(b.updatedAt ?? 0) - new Date(a.updatedAt ?? 0))

  if (completed.length === 0) {
    return <p className="text-sm text-slate-400">No completed todos yet.</p>
  }

  return (
    <div className="flex flex-col gap-2">
      {completed.map((todo) => (
        <TodoItem
          key={getId(todo)}
          todo={todo}
          category={categoriesById?.[todo.categoryId]}
          onToggle={onToggle}
          onDelete={onDelete}
          onOpen={onOpen}
        />
      ))}
    </div>
  )
}
