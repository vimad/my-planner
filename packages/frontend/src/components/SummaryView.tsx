import { useState, type KeyboardEvent } from 'react'
import { useWeeklySummary } from '../hooks/useWeeklySummary'
import { localTodayISO } from '../utils/dateAgenda'
import { getId } from '../utils/getId'
import { formatSegmentDate, formatWeekRange } from '../utils/weekDates'
import type {
  Category,
  Todo,
  WeeklySummaryActionedEntry,
  WeeklySummaryCategoryGroup,
  WeeklySummaryCompletedEntry,
  WeeklySummaryNoActionEntry,
} from '../types'

interface SummaryViewProps {
  activeProfileId: string | null
  // Already loaded by App.tsx - this component only joins the response's
  // bare `categoryId` against it for name/color, never fetches its own copy
  // (see the categories-fetch comment on BoardsView for the app's general
  // convention here).
  categories: Category[]
  // Already loaded by App.tsx too - joined against the response's bare
  // `id` fields so every row can open the real TodoDetail edit modal.
  todos: Todo[]
  onOpenTodo: (todo: Todo) => void
  // Set when rendered inside WeeklyProgressPanel's slide-over, to put a
  // close button in the header next to the week picker.
  onClose?: () => void
}

// Rows aren't natively focusable/clickable elements (they're <li>s, kept
// that way for existing layout/tests), so Enter/Space needs wiring by hand
// to match native button activation.
function onRowKeyDown(handler: () => void) {
  return (e: KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      handler()
    }
  }
}

const rowInteractiveClasses =
  'cursor-pointer transition-colors hover:bg-black/10 dark:hover:bg-black/30'

function ActionedTodoRow({
  entry,
  todayISO,
  onOpen,
}: {
  entry: WeeklySummaryActionedEntry
  todayISO: string
  onOpen: () => void
}) {
  return (
    <li
      role="button"
      tabIndex={0}
      onClick={onOpen}
      onKeyDown={onRowKeyDown(onOpen)}
      className={`rounded-lg bg-black/5 p-2.5 dark:bg-black/20 ${rowInteractiveClasses}`}
    >
      <p className="text-sm font-medium text-slate-800 dark:text-slate-100">{entry.title}</p>
      <ul className="mt-1.5 space-y-1">
        {entry.segments.map((segment, i) => (
          <li key={i} className="flex gap-2 text-xs text-slate-600 dark:text-slate-300">
            <span className="shrink-0 rounded-full bg-violet-100 px-1.5 py-0.5 font-medium text-violet-700 dark:bg-violet-500/20 dark:text-violet-200">
              {formatSegmentDate(segment.date, todayISO)}
            </span>
            <span>{segment.text}</span>
          </li>
        ))}
      </ul>
    </li>
  )
}

function CompletedTodoRow({
  entry,
  todayISO,
  onOpen,
}: {
  entry: WeeklySummaryCompletedEntry
  todayISO: string
  onOpen: () => void
}) {
  return (
    <li
      role="button"
      tabIndex={0}
      onClick={onOpen}
      onKeyDown={onRowKeyDown(onOpen)}
      className={`rounded-lg bg-black/5 px-2.5 py-1.5 dark:bg-black/20 ${rowInteractiveClasses}`}
    >
      <div className="flex items-center gap-1.5">
        <span className="text-emerald-500 dark:text-emerald-400">✓</span>
        <p className="text-sm font-medium text-slate-500 line-through decoration-slate-400 dark:text-slate-300 dark:decoration-slate-500">
          {entry.title}
        </p>
        <span className="ml-auto shrink-0 rounded-full bg-violet-100 px-1.5 py-0.5 text-xs font-medium text-violet-700 dark:bg-violet-500/20 dark:text-violet-200">
          {formatSegmentDate(entry.completedAt, todayISO)}
        </span>
      </div>
      {entry.lastSegmentBeforeCompletion && (
        <p className="mt-0.5 pl-5 text-xs italic text-slate-500 dark:text-slate-400">
          Last update: "{entry.lastSegmentBeforeCompletion.text}"
        </p>
      )}
    </li>
  )
}

function NoActionPill({ entry, onOpen }: { entry: WeeklySummaryNoActionEntry; onOpen: () => void }) {
  return (
    <li
      role="button"
      tabIndex={0}
      onClick={onOpen}
      onKeyDown={onRowKeyDown(onOpen)}
      className={`rounded-full border border-slate-200 bg-black/5 px-2.5 py-1 text-xs text-slate-500 dark:border-white/10 dark:bg-black/20 dark:text-slate-400 ${rowInteractiveClasses}`}
    >
      {entry.title}
    </li>
  )
}

interface CategoryCardProps {
  group: WeeklySummaryCategoryGroup
  category: Category | undefined
  expanded: boolean
  onToggle: () => void
  todayISO: string
  onOpenTodo: (id: string) => void
}

function CategoryCard({ group, category, expanded, onToggle, todayISO, onOpenTodo }: CategoryCardProps) {
  const { actioned, noAction, completed } = group
  return (
    <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white dark:border-white/10 dark:bg-white/5">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={expanded}
        className="flex w-full items-center justify-between px-4 py-3 text-left"
      >
        <div className="flex items-center gap-2">
          <span
            className="h-2.5 w-2.5 rounded-full"
            style={{ backgroundColor: category?.color ?? '#64748b' }}
          />
          <span className="font-semibold text-slate-900 dark:text-white">{category?.name ?? 'Untitled category'}</span>
        </div>
        <div className="flex items-center gap-3 text-xs">
          <span className="text-slate-600 dark:text-slate-300">
            {actioned.length} actioned · {noAction.length} no-action · {completed.length} completed
          </span>
          <span className="text-slate-400 dark:text-slate-500">{expanded ? '▾' : '▸'}</span>
        </div>
      </button>

      {expanded && (
        <div className="space-y-4 border-t border-slate-200 px-4 py-4 dark:border-white/10">
          {actioned.length > 0 && (
            <div>
              <h3 className="mb-2 text-xs font-bold uppercase tracking-wide text-emerald-600 dark:text-emerald-300">
                Action taken this week
              </h3>
              <ul className="space-y-2">
                {actioned.map((entry) => (
                  <ActionedTodoRow
                    key={entry.id}
                    entry={entry}
                    todayISO={todayISO}
                    onOpen={() => onOpenTodo(entry.id)}
                  />
                ))}
              </ul>
            </div>
          )}

          {completed.length > 0 && (
            <div>
              <h3 className="mb-2 text-xs font-bold uppercase tracking-wide text-violet-600 dark:text-violet-300">
                Completed this week
              </h3>
              <ul className="space-y-1">
                {completed.map((entry) => (
                  <CompletedTodoRow
                    key={entry.id}
                    entry={entry}
                    todayISO={todayISO}
                    onOpen={() => onOpenTodo(entry.id)}
                  />
                ))}
              </ul>
            </div>
          )}

          {noAction.length > 0 && (
            <div>
              <h3 className="mb-2 text-xs font-bold uppercase tracking-wide text-slate-400 dark:text-slate-400">
                No action taken this week
              </h3>
              <ul className="flex flex-wrap gap-1.5">
                {noAction.map((entry) => (
                  <NoActionPill key={entry.id} entry={entry} onOpen={() => onOpenTodo(entry.id)} />
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// The full weekly-progress breakdown, rendered inside WeeklyProgressPanel's
// expanded slide-over (see App.tsx's Agenda section) - ports the validated
// "Category Dashboard" prototype (branch prototype/weekly-summary-view,
// VariantCategoryDashboard.tsx) onto the real
// GET /api/todos/weekly-summary endpoint via hooks/useWeeklySummary.
export function SummaryView({ activeProfileId, categories, todos, onOpenTodo, onClose }: SummaryViewProps) {
  const { data, loading, error, isCurrentWeek, goToPrevWeek, goToNextWeek, goToThisWeek } =
    useWeeklySummary(activeProfileId)
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const todayISO = localTodayISO()

  function toggle(categoryId: string) {
    setExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(categoryId)) {
        next.delete(categoryId)
      } else {
        next.add(categoryId)
      }
      return next
    })
  }

  const categoriesById: Record<string, Category> = Object.fromEntries(
    categories.map((c) => [String(getId(c)), c]),
  )
  const todosById: Record<string, Todo> = Object.fromEntries(todos.map((t) => [String(getId(t)), t]))

  // A row's id can point at a todo the caller's `todos` list doesn't have
  // (e.g. it was deleted after the week's data was fetched) - silently do
  // nothing rather than open a broken modal.
  function handleOpenTodo(id: string) {
    const todo = todosById[id]
    if (todo) onOpenTodo(todo)
  }

  return (
    <section aria-label="Summary" className="flex flex-col gap-4">
      {error && (
        <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-300">
          Error: {error}
        </p>
      )}

      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 rounded-full border border-slate-200 bg-white p-1 dark:border-white/10 dark:bg-white/5">
          <button
            type="button"
            onClick={goToPrevWeek}
            aria-label="Previous week"
            className="rounded-full px-2 py-1 text-slate-500 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-white/10"
          >
            ←
          </button>
          <span className="px-2 text-sm font-medium text-slate-700 dark:text-slate-200">
            {data ? formatWeekRange(data.weekStart, data.weekEnd) : ' '}
          </span>
          {!isCurrentWeek && (
            <button
              type="button"
              onClick={goToThisWeek}
              className="rounded-full bg-slate-100 px-2 py-1 text-xs font-semibold text-fuchsia-600 hover:bg-slate-200 dark:bg-white/10 dark:text-fuchsia-300 dark:hover:bg-white/20"
            >
              This week
            </button>
          )}
          <button
            type="button"
            onClick={goToNextWeek}
            aria-label="Next week"
            className="rounded-full px-2 py-1 text-slate-500 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-white/10"
          >
            →
          </button>
        </div>
        {onClose && (
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="text-slate-400 hover:text-slate-600 dark:text-slate-500 dark:hover:text-slate-300"
          >
            ✕
          </button>
        )}
      </div>

      {loading && <p className="text-sm text-slate-500 dark:text-slate-400">Loading summary...</p>}

      {!loading && data && data.categories.length === 0 && (
        <p className="rounded-xl border border-dashed border-slate-300 p-6 text-center text-sm text-slate-400 dark:border-white/10 dark:text-slate-500">
          Nothing to report for this week.
        </p>
      )}

      {!loading && data && data.categories.length > 0 && (
        <div className="space-y-3">
          {data.categories.map((group) => (
            <CategoryCard
              key={group.categoryId}
              group={group}
              category={categoriesById[group.categoryId]}
              expanded={expanded.has(group.categoryId)}
              onToggle={() => toggle(group.categoryId)}
              todayISO={todayISO}
              onOpenTodo={handleOpenTodo}
            />
          ))}
        </div>
      )}
    </section>
  )
}
