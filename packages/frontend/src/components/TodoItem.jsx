export function TodoItem({ todo, isDueToday, category, onToggle, onDelete }) {
  const id = todo._id ?? todo.id

  return (
    <div
      className={`flex items-center gap-3 rounded-xl border px-3 py-2 transition ${
        isDueToday
          ? 'border-fuchsia-400/60 bg-fuchsia-500/10 shadow-[0_0_14px_rgba(255,107,214,0.35)]'
          : 'border-white/10 bg-white/5'
      }`}
    >
      <input
        type="checkbox"
        checked={todo.completed}
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
      <button
        type="button"
        aria-label={`Delete ${todo.title}`}
        onClick={() => onDelete(id)}
        className="rounded-full px-2 py-0.5 text-xs text-slate-400 hover:bg-white/10 hover:text-slate-200"
      >
        ×
      </button>
    </div>
  )
}
