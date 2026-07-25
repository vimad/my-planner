export function CategoryChip({ category, onEdit, onDelete }) {
  const isSystem = category.system || category.name === 'Uncategorized'

  return (
    <div className="flex items-center gap-3 rounded-full border border-white/10 bg-white/5 px-4 py-2 backdrop-blur-md">
      <span
        className="h-2.5 w-2.5 shrink-0 rounded-full"
        style={{ background: category.color, boxShadow: `0 0 10px ${category.color}` }}
      />
      <div className="flex flex-col leading-tight">
        <span className="text-sm font-semibold text-slate-100">{category.name}</span>
        <span className="text-xs text-slate-400">
          {category.remaining ?? 0} remaining · {category.completed ?? 0} completed
        </span>
      </div>
      {!isSystem && (
        <div className="ml-1 flex gap-1">
          <button
            type="button"
            aria-label={`Edit ${category.name}`}
            onClick={() => onEdit(category)}
            className="rounded-full px-2 py-0.5 text-xs text-slate-300 hover:bg-white/10"
          >
            Edit
          </button>
          <button
            type="button"
            aria-label={`Delete ${category.name}`}
            onClick={() => onDelete(category)}
            className="rounded-full px-2 py-0.5 text-xs text-slate-300 hover:bg-white/10"
          >
            Delete
          </button>
        </div>
      )}
    </div>
  )
}
