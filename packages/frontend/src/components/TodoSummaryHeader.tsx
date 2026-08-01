import type { Category, TodoPriority } from '../types'

export const PRIORITY_BADGE_STYLES: Record<TodoPriority, string> = {
  High: 'bg-red-100 text-red-700 dark:bg-red-500/20 dark:text-red-300',
  Medium: 'bg-amber-100 text-amber-700 dark:bg-amber-500/20 dark:text-amber-300',
  Low: 'bg-slate-200 text-slate-600 dark:bg-slate-500/20 dark:text-slate-300',
}

export interface TodoSummaryHeaderProps {
  title: string
  priority: TodoPriority
  dueDate: string
  category?: Category
}

// Compact, read-only summary of a todo's title/priority/due date/category -
// originally the display bits of TodoDetail's local CollapsedHeader (shown
// there on the Todos tab so the widened linking workspace doesn't compete
// with a full edit form the user isn't using in that moment). Extracted as
// its own presentational component so a Board todo-card (see
// .scratch/boards/spec.md - "todo-card header is the same compact,
// read-only summary already used for the collapsed Linked-Todos parent
// header") can reuse the exact same title/badge/chip markup without
// duplicating it or depending on TodoDetail's own `onClose` affordance,
// which a board card has no use for.
export function TodoSummaryHeader({ title, priority, dueDate, category }: TodoSummaryHeaderProps) {
  return (
    <div className="min-w-0">
      <h2 className="truncate text-lg font-semibold text-slate-900 dark:text-slate-100">{title}</h2>
      <div className="mt-1.5 flex flex-wrap items-center gap-2">
        <span
          className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${PRIORITY_BADGE_STYLES[priority]}`}
        >
          {priority}
        </span>
        {dueDate && (
          <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-medium text-slate-500 dark:bg-white/5 dark:text-slate-400">
            Due {dueDate}
          </span>
        )}
        {category && (
          <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-medium text-slate-500 dark:bg-white/5 dark:text-slate-400">
            <span className="h-1.5 w-1.5 rounded-full" style={{ background: category.color }} />
            {category.name}
          </span>
        )}
      </div>
    </div>
  )
}
