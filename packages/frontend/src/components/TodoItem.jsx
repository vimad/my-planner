const PRIORITY_BADGE_STYLES = {
  High: 'bg-red-500/20 text-red-300',
  Medium: 'bg-amber-500/20 text-amber-300',
  Low: 'bg-slate-500/20 text-slate-300',
}

// Clicking the row (but not the checkbox or delete button) opens the todo
// detail view via `onOpen`, when provided.
export function TodoItem({ todo, isDueToday, category, onToggle, onDelete, onOpen }) {
  const id = todo._id ?? todo.id
  const priority = todo.priority ?? 'Medium'

  return (
    <div
      onClick={() => onOpen?.(todo)}
      role={onOpen ? 'button' : undefined}
      tabIndex={onOpen ? 0 : undefined}
      className={`flex items-center gap-3 rounded-xl border px-3 py-2 transition ${
        isDueToday
          ? 'border-fuchsia-400/60 bg-fuchsia-500/10 shadow-[0_0_14px_rgba(255,107,214,0.35)]'
          : 'border-white/10 bg-white/5'
      } ${onOpen ? 'cursor-pointer hover:bg-white/10' : ''}`}
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
      <span className="flex-1 text-sm text-slate-100">{todo.title}</span>
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
        className="rounded-full px-2 py-0.5 text-xs text-slate-400 hover:bg-white/10 hover:text-slate-200"
      >
        ×
      </button>
    </div>
  )
}
