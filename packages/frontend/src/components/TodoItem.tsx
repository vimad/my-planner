import { getId } from '../utils/getId'
import { linkify } from '../utils/linkify'
import type { BoardQuickAddState, Category, Todo, TodoPriority } from '../types'
import { QuickAddIcon } from './QuickAddIcon'

const PRIORITY_BADGE_STYLES: Record<TodoPriority, string> = {
  High: 'bg-red-100 text-red-700 dark:bg-red-500/20 dark:text-red-300',
  Medium: 'bg-amber-100 text-amber-700 dark:bg-amber-500/20 dark:text-amber-300',
  Low: 'bg-slate-200 text-slate-600 dark:bg-slate-500/20 dark:text-slate-300',
}

interface TodoItemProps {
  todo: Todo
  isDueToday?: boolean
  category?: Category
  onToggle: (id: string) => void
  onDelete: (id: string) => void
  onOpen?: (todo: Todo) => void
  // The one shared insertion point for the Boards quick-add icon (see ticket
  // 14, .scratch/boards/issues/14-quick-add-icon-and-badge.md) - covers the
  // main agenda, CompletedTodos, and todo search results, all of which
  // render through this component. Optional so a test (or any other future
  // caller) can render a row without wiring up Boards state at all and just
  // get no icon.
  boardQuickAdd?: BoardQuickAddState
}

// Clicking the row (but not the checkbox, delete button, or quick-add icon)
// opens the todo detail view via `onOpen`, when provided.
export function TodoItem({ todo, isDueToday, category, onToggle, onDelete, onOpen, boardQuickAdd }: TodoItemProps) {
  const id = String(getId(todo))
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
      <span className="flex-1 text-sm text-slate-900 dark:text-slate-100">
        {linkify(todo.title).map((segment, i) =>
          segment.href ? (
            <a
              key={i}
              href={segment.href}
              target="_blank"
              rel="noopener noreferrer"
              onClick={(e) => e.stopPropagation()}
              className="text-fuchsia-600 hover:text-fuchsia-700 hover:underline dark:text-fuchsia-300 dark:hover:text-fuchsia-200"
            >
              {segment.text}
            </a>
          ) : (
            <span key={i}>{segment.text}</span>
          ),
        )}
      </span>
      {todo.tags && todo.tags.length > 0 && (
        // Capped so a long tag list wraps onto its own line(s) instead of
        // starving the title's flex-1 span - without a cap, this wrapping
        // span's intrinsic (unwrapped) width wins out over the title's
        // flex-basis-0 sizing and squeezes the title down to one word per
        // line.
        <span role="list" aria-label="Tags" className="flex max-w-[45%] flex-wrap items-center justify-end gap-1">
          {todo.tags.map((tag) => (
            <span
              key={tag}
              role="listitem"
              className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-medium text-slate-700 dark:bg-white/10 dark:text-slate-200"
            >
              <svg viewBox="0 0 20 20" fill="currentColor" aria-hidden="true" className="h-2.5 w-2.5">
                <path d="M5.5 3A2.5 2.5 0 0 0 3 5.5v4.879a2.5 2.5 0 0 0 .732 1.767l7.5 7.5a2.5 2.5 0 0 0 3.536 0l4.878-4.878a2.5 2.5 0 0 0 0-3.536l-7.5-7.5A2.5 2.5 0 0 0 10.38 3H5.5ZM7 8.25a1.25 1.25 0 1 1 0-2.5 1.25 1.25 0 0 1 0 2.5Z" />
              </svg>
              {tag}
            </span>
          ))}
        </span>
      )}
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
      {boardQuickAdd && (
        <QuickAddIcon itemType="Todo" itemId={id} label={todo.title} quickAdd={boardQuickAdd} />
      )}
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
