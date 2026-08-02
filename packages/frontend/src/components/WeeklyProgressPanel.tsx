import { useState } from 'react'
import { useWeeklySummary } from '../hooks/useWeeklySummary'
import { getId } from '../utils/getId'
import { SummaryView } from './SummaryView'
import type { Category } from '../types'

interface WeeklyProgressPanelProps {
  activeProfileId: string | null
  // Already loaded by App.tsx - see SummaryView's own doc comment on this
  // same prop for the app's general convention here.
  categories: Category[]
}

// Persistent companion to the Agenda showing condensed per-category weekly
// counts, with "Expand" opening the full SummaryView breakdown in a
// slide-over. Placed here rather than as a top-level tab (see the validated
// prototype/summary-placement branch) since weekly progress is a
// todos-related view, not a peer section of the app.
export function WeeklyProgressPanel({ activeProfileId, categories }: WeeklyProgressPanelProps) {
  const { data, loading } = useWeeklySummary(activeProfileId)
  const [expanded, setExpanded] = useState(false)

  const categoriesById: Record<string, Category> = Object.fromEntries(
    categories.map((c) => [String(getId(c)), c]),
  )

  return (
    <>
      <div className="sticky top-6 max-h-[calc(100vh-3rem)] w-full shrink-0 self-start overflow-y-auto rounded-2xl border border-slate-200 bg-white p-4 dark:border-white/10 dark:bg-white/5 lg:w-64">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-sm font-bold text-slate-900 dark:text-white">Weekly progress</h3>
          <button
            type="button"
            onClick={() => setExpanded(true)}
            className="text-xs font-semibold text-fuchsia-600 hover:underline dark:text-fuchsia-300"
          >
            Expand
          </button>
        </div>

        {loading && <p className="text-xs text-slate-500 dark:text-slate-400">Loading…</p>}

        {!loading && data && data.categories.length === 0 && (
          <p className="text-xs text-slate-400 dark:text-slate-500">Nothing to report this week.</p>
        )}

        {!loading && data && data.categories.length > 0 && (
          <ul className="space-y-2">
            {data.categories.map((group) => {
              const category = categoriesById[group.categoryId]
              return (
                <li key={group.categoryId} className="flex items-center justify-between gap-2 text-xs">
                  <span className="flex min-w-0 items-center gap-1.5">
                    <span
                      className="h-2 w-2 shrink-0 rounded-full"
                      style={{ backgroundColor: category?.color ?? '#64748b' }}
                    />
                    <span className="truncate text-slate-700 dark:text-slate-200">
                      {category?.name ?? 'Untitled category'}
                    </span>
                  </span>
                  <span className="shrink-0 text-slate-400 dark:text-slate-500">
                    {group.completed.length} completed
                  </span>
                </li>
              )
            })}
          </ul>
        )}
      </div>

      {expanded && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Weekly progress"
          className="fixed inset-0 z-[70] flex justify-end bg-black/60 p-4"
          onClick={() => setExpanded(false)}
        >
          <div
            className="relative h-full w-full max-w-lg overflow-y-auto rounded-2xl bg-[#f2f1f5] p-5 shadow-xl dark:bg-[#181822]"
            onClick={(e) => e.stopPropagation()}
          >
            <SummaryView
              activeProfileId={activeProfileId}
              categories={categories}
              onClose={() => setExpanded(false)}
            />
          </div>
        </div>
      )}
    </>
  )
}
