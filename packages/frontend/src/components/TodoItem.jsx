import { getId } from '../utils/getId'

const PRIORITY_BADGE_STYLES = {
  High: 'bg-red-100 text-red-700 dark:bg-red-500/20 dark:text-red-300',
  Medium: 'bg-amber-100 text-amber-700 dark:bg-amber-500/20 dark:text-amber-300',
  Low: 'bg-slate-200 text-slate-600 dark:bg-slate-500/20 dark:text-slate-300',
}

// Clicking the row (but not the checkbox or delete button) opens the todo
// detail view via `onOpen`, when provided.
export function TodoItem({ todo, isDueToday, category, onToggle, onDelete, onOpen }) {
  const id = getId(todo)
  const priority = todo.priority ?? 'Medium'

  return (
    <div
      onClick={() => onOpen?.(todo)}
      role={onOpen ? 'button' : undefined}
      tabIndex={onOpen ? 0 : undefined}
      className={`flex items-center gap-3 rounded-xl border px-3 py-2 transition ${
        isDueToday
          ? 'border-fuchsia-400/40 bg-fuchsia-50 shadow-[0_0_0_3px_rgba(217,70,239,0.08)] dark:border-fuchsia-400/60 dark:bg-fuchsia-500/10 dark:shadow-[0_0_14px_rgba(255,107,214,0.35)]'
          : 'border-slate-200 bg-slate-50 dark:border-white/10 dark:bg-white/5'
      } ${onOpen ? 'cursor-pointer hover:bg-slate-100 dark:hover:bg-white/10' : ''}`}
    >
      <input
        type="checkbox"
        checked={todo.completed}
        onClick={(e) => e.stopPropagation()}
        onChange={() => onToggle(id)}
        aria-label={`Complete ${todo.title}`}
        className="h-4 w-4 shrink-0 accent-fuchsia-500"
      />
      {category && (
        <span
          className="h-2 w-2 shrink-0 rounded-full"
          style={{ background: category.color, boxShadow: `0 0 8px ${category.color}` }}
        />
      )}
      <span className="flex-1 text-sm text-slate-900 dark:text-slate-100">{todo.title}</span>
      {todo.officeLinked && (
        <span
          title="Linked to the next office day"
          className="shrink-0 rounded-full bg-cyan-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-cyan-700 dark:bg-cyan-500/20 dark:text-cyan-300"
        >
          Office
        </span>
      )}
      <span
        className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${PRIORITY_BADGE_STYLES[priority]}`}
      >
        {priority}
      </span>
      <button
        type="button"
        aria-label={`Delete ${todo.title}`}
        onClick={(e) => {
          e.stopPropagation()
          onDelete(id)
        }}
        className="rounded-full px-2 py-0.5 text-xs text-slate-400 hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-white/10 dark:hover:text-slate-200"
      >
        ×
      </button>
    </div>
  )
}
