import { useEffect, useRef, useState } from 'react'

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

function EditIcon() {
  return (
    <svg viewBox="0 0 16 16" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M11.5 2.5a1.5 1.5 0 0 1 2.12 2.12L5 13.25l-3 1 1-3 8.5-8.75Z" />
    </svg>
  )
}

function DeleteIcon() {
  return (
    <svg viewBox="0 0 16 16" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 4.5h10M6.5 4.5V3a1 1 0 0 1 1-1h1a1 1 0 0 1 1 1v1.5M4.5 4.5 5 13a1 1 0 0 0 1 1h4a1 1 0 0 0 1-1l.5-8.5" />
    </svg>
  )
}

function KebabIcon() {
  return (
    <svg viewBox="0 0 16 16" width="14" height="14" fill="currentColor">
      <circle cx="8" cy="2.75" r="1.15" />
      <circle cx="8" cy="8" r="1.15" />
      <circle cx="8" cy="13.25" r="1.15" />
    </svg>
  )
}

// Doubles as a multi-select filter toggle: clicking the chip body (but not
// the overflow menu, which stops propagation) toggles it in/out of the
// active category filter set. Selected state is fully controlled via
// `selected` - this component owns no filter state of its own.
export function CategoryChip({ category, selected = false, onToggleFilter, onEdit, onDelete }: CategoryChipProps) {
  const isSystem = category.system || category.name === 'Uncategorized'
  const [menuOpen, setMenuOpen] = useState(false)
  const wrapperRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!menuOpen) return
    const onDocClick = (e: MouseEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) setMenuOpen(false)
    }
    document.addEventListener('mousedown', onDocClick)
    return () => document.removeEventListener('mousedown', onDocClick)
  }, [menuOpen])

  return (
    <div
      ref={wrapperRef}
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
      className={`relative flex cursor-pointer items-center gap-3 rounded-full border px-4 py-2 transition dark:backdrop-blur-md ${
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
        <button
          type="button"
          aria-label={`More actions for ${category.name}`}
          aria-expanded={menuOpen}
          onClick={(e) => {
            e.stopPropagation()
            setMenuOpen((v) => !v)
          }}
          className="ml-1 rounded-full p-1.5 text-slate-400 hover:bg-slate-200 hover:text-slate-700 dark:text-slate-400 dark:hover:bg-white/10 dark:hover:text-slate-100"
        >
          <KebabIcon />
        </button>
      )}
      {menuOpen && (
        <div
          role="menu"
          onClick={(e) => e.stopPropagation()}
          className="absolute right-0 top-[calc(100%+6px)] z-20 min-w-28 overflow-hidden rounded-lg border border-slate-200 bg-white py-1 shadow-lg dark:border-white/10 dark:bg-[#1a1229]"
        >
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              setMenuOpen(false)
              onEdit(category)
            }}
            className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm text-slate-700 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-white/10"
          >
            <EditIcon />
            Edit
          </button>
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              setMenuOpen(false)
              onDelete(category)
            }}
            className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm text-rose-600 hover:bg-rose-50 dark:text-rose-300 dark:hover:bg-rose-500/15"
          >
            <DeleteIcon />
            Delete
          </button>
        </div>
      )}
    </div>
  )
}
