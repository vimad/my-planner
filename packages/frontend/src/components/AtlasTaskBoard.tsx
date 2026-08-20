import { useMemo, useState } from 'react'
import { ArrowUpRight } from 'lucide-react'
import { usePeopleDirectory } from '../hooks/usePeopleDirectory'
import { resolveAssignee, type AssigneeInfo } from '../utils/atlasAssignee'
import { collectLeafTasks, STATUS_BADGE, type AtlasStatusBucket } from '../utils/atlasStats'
import type { AtlasEpic } from '../types'
import { AssigneeAvatar } from './AssigneeAvatar'

const STATUSES: AtlasStatusBucket[] = ['To Do', 'In Progress', 'Done']

const COLUMN_ACCENT: Record<AtlasStatusBucket, string> = {
  'To Do': 'border-t-slate-300 dark:border-t-slate-500/40',
  'In Progress': 'border-t-fuchsia-400 dark:border-t-fuchsia-400/60',
  Done: 'border-t-emerald-500 dark:border-t-emerald-400/70',
}

const CARD_ACCENT_PALETTE = [
  'border-l-violet-500',
  'border-l-fuchsia-500',
  'border-l-blue-500',
  'border-l-emerald-500',
  'border-l-cyan-500',
  'border-l-indigo-500',
]

// Same hash as AssigneeAvatar's own color, kept independent so a card's left
// accent and its avatar bubble reinforce each other without one component
// reaching into the other's palette.
function cardAccent(assignee: AssigneeInfo): string {
  if (assignee.kind !== 'named') return 'border-l-slate-200 dark:border-l-white/10'
  let hash = 0
  for (let i = 0; i < assignee.key.length; i++) hash = (hash * 31 + assignee.key.charCodeAt(i)) | 0
  return CARD_ACCENT_PALETTE[Math.abs(hash) % CARD_ACCENT_PALETTE.length]
}

// A Kanban-by-status view of leaf tasks (epics, and any task with visible
// sub-tasks, excluded - utils/atlasStats.ts's collectLeafTasks) across every
// active epic, folded in from the winning variant of branch prototype/
// atlas-assignee-filters. "Filter by status" is literal here - each status
// is a column, and toggling one hides/shows it entirely (mirrors
// StatusView's "only occupied columns render", just user-controlled instead
// of auto-derived). "Filter by assignee" is a horizontal avatar strip;
// clicking one greys out the rest rather than removing them, so the full
// roster stays visible as a re-entry point.
export function AtlasTaskBoard({ epics }: { epics: AtlasEpic[] }) {
  const people = usePeopleDirectory()
  const [visibleColumns, setVisibleColumns] = useState<Set<AtlasStatusBucket>>(new Set(STATUSES))
  const [assigneeFilter, setAssigneeFilter] = useState<Set<string>>(new Set())

  const peopleByAccountId = useMemo(() => {
    const map = new Map<string, (typeof people)[number]>()
    for (const p of people) map.set(p.jiraAccountId, p)
    return map
  }, [people])

  const items = useMemo(() => {
    return collectLeafTasks(epics).map((task) => ({
      task,
      assignee: resolveAssignee(task.assigneeAccountId, peopleByAccountId),
    }))
  }, [epics, peopleByAccountId])

  // Distinct assignees present in this board's tasks, for the filter strip -
  // named first alphabetically, then Unmapped/Unassigned trailing (matches
  // PlanningView's "explicit gap states sort last" convention).
  const assigneeOptions = useMemo(() => {
    const byKey = new Map<string, AssigneeInfo>()
    for (const { assignee } of items) if (!byKey.has(assignee.key)) byKey.set(assignee.key, assignee)
    const order: Record<AssigneeInfo['kind'], number> = { named: 0, unmapped: 1, unassigned: 2 }
    return [...byKey.values()].sort((a, b) => order[a.kind] - order[b.kind] || a.label.localeCompare(b.label))
  }, [items])

  function toggleColumn(status: AtlasStatusBucket) {
    setVisibleColumns((prev) => {
      const next = new Set(prev)
      if (next.has(status)) next.delete(status)
      else next.add(status)
      return next
    })
  }

  function toggleAssignee(key: string) {
    setAssigneeFilter((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  const filtered = useMemo(
    () => items.filter(({ assignee }) => assigneeFilter.size === 0 || assigneeFilter.has(assignee.key)),
    [items, assigneeFilter],
  )

  const columns = STATUSES.filter((s) => visibleColumns.has(s)).map((status) => ({
    status,
    rows: filtered.filter(({ task }) => task.status === status),
  }))

  if (items.length === 0) return null

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-white/10 dark:bg-white/5 dark:shadow-none dark:backdrop-blur-md">
      <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">Task board</h2>
      <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
        Leaf tasks only - epics and tasks with sub-tasks are excluded.
      </p>

      <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-1 rounded-full border border-slate-200 bg-white p-1 dark:border-white/10 dark:bg-white/5">
          {STATUSES.map((status) => (
            <button
              key={status}
              type="button"
              onClick={() => toggleColumn(status)}
              title={visibleColumns.has(status) ? `Hide ${status} column` : `Show ${status} column`}
              className={`rounded-full px-2.5 py-1 text-xs font-semibold transition ${
                visibleColumns.has(status)
                  ? STATUS_BADGE[status]
                  : 'text-slate-400 line-through hover:bg-slate-100 dark:text-slate-500 dark:hover:bg-white/10'
              }`}
            >
              {status}
            </button>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-1">
          {assigneeOptions.map((a) => (
            <button
              key={a.key}
              type="button"
              onClick={() => toggleAssignee(a.key)}
              title={a.label}
              className={`rounded-full p-0.5 transition ${
                assigneeFilter.size === 0 || assigneeFilter.has(a.key) ? '' : 'opacity-30 grayscale'
              } hover:opacity-100 hover:grayscale-0`}
            >
              <AssigneeAvatar assignee={a} size={20} />
            </button>
          ))}
          {assigneeFilter.size > 0 && (
            <button
              type="button"
              onClick={() => setAssigneeFilter(new Set())}
              className="ml-1 text-xs font-medium text-fuchsia-600 underline decoration-dotted hover:text-fuchsia-700 dark:text-fuchsia-300"
            >
              Reset
            </button>
          )}
        </div>
      </div>

      <div className="mt-4 flex items-start gap-3 overflow-x-auto pb-1">
        {columns.length === 0 && <p className="text-sm text-slate-400 dark:text-slate-500">No columns selected.</p>}
        {columns.map((col) => (
          <div key={col.status} className="w-64 shrink-0">
            <div
              className={`rounded-t-lg border-t-2 bg-slate-50 px-3 py-1.5 text-xs font-bold uppercase tracking-wide text-slate-500 dark:bg-white/5 dark:text-slate-400 ${COLUMN_ACCENT[col.status]}`}
            >
              {col.status} <span className="text-slate-400 dark:text-slate-500">({col.rows.length})</span>
            </div>
            <div className="flex min-h-16 flex-col gap-2 rounded-b-lg border border-t-0 border-slate-200 bg-slate-50/50 p-2 dark:border-white/10 dark:bg-white/[0.02]">
              {col.rows.map(({ task, assignee }) => (
                <div
                  key={task.taskId}
                  className={`rounded-lg border border-l-4 border-slate-200 bg-white p-2 shadow-sm dark:border-white/10 dark:bg-white/5 dark:shadow-none ${cardAccent(assignee)}`}
                >
                  <div className="flex items-center justify-between gap-1">
                    <span className="font-mono text-[10px] font-semibold text-fuchsia-600 dark:text-fuchsia-300">{task.jiraKey}</span>
                    <a
                      href={task.jiraUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      title="Open in Jira"
                      className="shrink-0 rounded-full p-0.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-white/10 dark:hover:text-slate-200"
                    >
                      <ArrowUpRight size={11} />
                    </a>
                  </div>
                  <p className="mt-1 text-xs text-slate-800 dark:text-slate-100">{task.title}</p>
                  <div className="mt-1.5 flex items-center gap-1.5">
                    <AssigneeAvatar assignee={assignee} size={16} />
                    <span className="truncate text-[10px] text-slate-500 dark:text-slate-400">{assignee.label}</span>
                    <span className="ml-auto shrink-0 text-[10px] text-slate-400 dark:text-slate-500">{task.epicKey}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
