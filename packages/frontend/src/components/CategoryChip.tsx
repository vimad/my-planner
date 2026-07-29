// Minimal shape this component needs from a category: the counts/system
// flag come from the backend's GET /api/categories response (Category doc +
// computed remaining/completed), not a full canonical Category type (none
// exists on the frontend yet).
export interface CategoryChipCategory {
  name: string
  color: string
  system?: boolean
  remaining?: number
  completed?: number
}

interface CategoryChipProps {
  category: CategoryChipCategory
  selected?: boolean
  onToggleFilter?: (category: CategoryChipCategory) => void
  onEdit: (category: CategoryChipCategory) => void
  onDelete: (category: CategoryChipCategory) => void
}

// Doubles as a multi-select filter toggle: clicking the chip body (but not
// Edit/Delete, which stop propagation) toggles it in/out of the active
// category filter set. Selected state is fully controlled via `selected` -
// this component owns no filter state of its own.
export function CategoryChip({ category, selected = false, onToggleFilter, onEdit, onDelete }: CategoryChipProps) {
  const isSystem = category.system || category.name === 'Uncategorized'

  return (
    <div
      role="button"
      tabIndex={0}
      aria-pressed={selected}
      aria-label={`Filter by ${category.name}`}
      onClick={() => onToggleFilter?.(category)}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          onToggleFilter?.(category)
        }
      }}
      className={`flex cursor-pointer items-center gap-3 rounded-full border px-4 py-2 transition dark:backdrop-blur-md ${
        selected
          ? 'border-fuchsia-400/50 bg-fuchsia-50 shadow-[0_0_0_3px_rgba(217,70,239,0.1)] dark:border-fuchsia-400/60 dark:bg-fuchsia-500/15 dark:shadow-[0_0_14px_rgba(255,107,214,0.35)]'
          : 'border-slate-200 bg-white hover:bg-slate-50 dark:border-white/10 dark:bg-white/5 dark:hover:bg-white/10'
      }`}
    >
      <span
        className="h-2.5 w-2.5 shrink-0 rounded-full"
        style={{ background: category.color, boxShadow: `0 0 10px ${category.color}` }}
      />
      <div className="flex flex-col leading-tight">
        <span className="text-sm font-semibold text-slate-900 dark:text-slate-100">{category.name}</span>
        <span className="text-xs text-slate-500 dark:text-slate-400">
          {category.remaining ?? 0} remaining · {category.completed ?? 0} completed
        </span>
      </div>
      {!isSystem && (
        <div className="ml-1 flex gap-1">
          <button
            type="button"
            aria-label={`Edit ${category.name}`}
            onClick={(e) => {
              e.stopPropagation()
              onEdit(category)
            }}
            className="rounded-full px-2 py-0.5 text-xs text-slate-500 hover:bg-slate-200 dark:text-slate-300 dark:hover:bg-white/10"
          >
            Edit
          </button>
          <button
            type="button"
            aria-label={`Delete ${category.name}`}
            onClick={(e) => {
              e.stopPropagation()
              onDelete(category)
            }}
            className="rounded-full px-2 py-0.5 text-xs text-slate-500 hover:bg-slate-200 dark:text-slate-300 dark:hover:bg-white/10"
          >
            Delete
          </button>
        </div>
      )}
    </div>
  )
}
