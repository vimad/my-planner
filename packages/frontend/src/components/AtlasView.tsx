import { useMemo, useState, type FormEvent } from 'react'
import { AlertTriangle, ArrowUpRight, ChevronDown, ChevronRight, StickyNote } from 'lucide-react'
import { useAtlasEpics } from '../hooks/useAtlasEpics'
import type { AtlasEpic, AtlasTaskNode } from '../types'
import { jiraIssueUrl } from '../constants/jira'
import { getId } from '../utils/getId'
import {
  AT_RISK_BADGE,
  STATUS_BADGE,
  buildBlockedByLookup,
  epicStats,
  formatDateRange,
  type BlockedByRef,
} from '../utils/atlasStats'

// Read-only Dashboard layout (ticket 08, spec §6) - "dense table + inline
// accordion", the winning variant from the throwaway prototype branch
// (prototype/atlas-dashboard-ui-variants, VariantB.tsx; see
// .scratch/sprint-atlas-program/issues/04-dashboard-ui.md's Answer). No
// editing controls here - dates/notes/risk-override/blocked-by editing is
// ticket 09, Sync now/archive/restore is ticket 10.

// A single "Blocked by" chip - same shape whether same-epic or cross-epic,
// just with or without the ` · <epicKey>` suffix (spec §6's task row line
// 3). Prop is named `blocker`, not `ref` - a plain data value, not an
// actual React ref, despite the name overlap with BlockedByRef.
function BlockedByChip({ blocker, ownerEpicId }: { blocker: BlockedByRef; ownerEpicId: string }) {
  return (
    <span className="rounded-full bg-slate-100 px-1.5 py-0.5 text-[10px] font-medium text-slate-500 dark:bg-white/10 dark:text-slate-400">
      {blocker.jiraKey}
      {blocker.epicId !== ownerEpicId && <span className="text-slate-400 dark:text-slate-500"> · {blocker.epicKey}</span>}
    </span>
  )
}

// Recursive - same component at every depth level (spec §6's task/sub-task
// row). Depth hard-floors at one nested level server-side, but this
// component itself has no ceiling; it just keeps indenting whatever
// `subtasks` it's handed. Sub-task rows are indented 18px per depth with a
// left border guide, styled closer to NotesView.tsx's tree rows than any
// card/popover/drawer archetype (docs/ui-conventions.md's noted deviation).
function AtlasTaskRow({
  task,
  depth,
  blockedByLookup,
  ownerEpicId,
}: {
  task: AtlasTaskNode
  depth: number
  blockedByLookup: Map<string, BlockedByRef>
  ownerEpicId: string
}) {
  const blockers = task.blockedBy.map((id) => blockedByLookup.get(id)).filter((ref): ref is BlockedByRef => Boolean(ref))
  return (
    <div>
      <div
        className="flex items-start gap-2 border-l border-slate-200 py-1.5 pl-3 dark:border-white/10"
        style={{ marginLeft: depth * 18 }}
      >
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="font-mono text-[11px] font-semibold text-fuchsia-600 dark:text-fuchsia-300">{task.jiraKey}</span>
            <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${STATUS_BADGE[task.status]}`}>
              {task.status}
            </span>
            {task.atRisk && (
              <span className={`flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[10px] font-semibold ${AT_RISK_BADGE}`}>
                <AlertTriangle size={10} /> at risk
              </span>
            )}
            <span className="text-xs text-slate-800 dark:text-slate-100">{task.title}</span>
          </div>
          <div className="mt-0.5 flex items-center gap-2 text-[10px] text-slate-400 dark:text-slate-500">
            <span>{formatDateRange(task.startDate, task.endDate)}</span>
            {task.notes && (
              <span className="flex items-center gap-0.5" title={task.notes}>
                <StickyNote size={10} /> notes
              </span>
            )}
          </div>
          {blockers.length > 0 && (
            <div className="mt-1 flex flex-wrap items-center gap-1">
              <span className="text-[10px] text-slate-400 dark:text-slate-500">Blocked by</span>
              {blockers.map((blocker) => (
                <BlockedByChip key={blocker.taskId} blocker={blocker} ownerEpicId={ownerEpicId} />
              ))}
            </div>
          )}
        </div>
      </div>
      {task.subtasks.map((sub) => (
        <AtlasTaskRow
          key={getId(sub) ?? sub.jiraKey}
          task={sub}
          depth={depth + 1}
          blockedByLookup={blockedByLookup}
          ownerEpicId={ownerEpicId}
        />
      ))}
    </div>
  )
}

function StatCell({ count, className }: { count: number; className: string }) {
  return (
    <span className={`inline-flex h-5 min-w-5 items-center justify-center rounded-full px-1 text-[10px] font-semibold ${className}`}>
      {count}
    </span>
  )
}

// One row of the epic overview table (spec §6) - key/title, progress bar,
// status/at-risk pills, date range, Jira link. Clicking it toggles the
// inline task-tree accordion beneath it.
function AtlasEpicRow({
  epic,
  expanded,
  onToggle,
  blockedByLookup,
  dimmed,
}: {
  epic: AtlasEpic
  expanded: boolean
  onToggle: () => void
  blockedByLookup: Map<string, BlockedByRef>
  dimmed?: boolean
}) {
  const stats = epicStats(epic)
  const epicId = getId(epic) ?? epic.jiraKey
  return (
    <div className={`rounded-xl border border-slate-200 bg-white dark:border-white/10 dark:bg-white/5 ${dimmed ? 'opacity-60' : ''}`}>
      <button type="button" onClick={onToggle} className="flex w-full items-center gap-3 px-3 py-2.5 text-left">
        {expanded ? (
          <ChevronDown size={14} className="shrink-0 text-slate-400" />
        ) : (
          <ChevronRight size={14} className="shrink-0 text-slate-400" />
        )}
        <div className="w-40 shrink-0">
          <span className="block font-mono text-[11px] font-semibold text-fuchsia-600 dark:text-fuchsia-300">{epic.jiraKey}</span>
          <span className="block truncate text-sm font-medium text-slate-800 dark:text-slate-100">{epic.title}</span>
        </div>
        <div className="flex w-28 shrink-0 items-center gap-2">
          <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-slate-100 dark:bg-white/10">
            <div className="h-full rounded-full bg-emerald-500" style={{ width: `${stats.progressPct}%` }} />
          </div>
          <span className="w-8 shrink-0 text-right text-[10px] text-slate-400 dark:text-slate-500">{stats.progressPct}%</span>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <StatCell count={stats.todo} className={STATUS_BADGE['To Do']} />
          <StatCell count={stats.inProgress} className={STATUS_BADGE['In Progress']} />
          <StatCell count={stats.done} className={STATUS_BADGE.Done} />
          {stats.atRisk > 0 && <StatCell count={stats.atRisk} className={AT_RISK_BADGE} />}
        </div>
        <span className="flex-1 truncate text-right text-xs text-slate-500 dark:text-slate-400">
          {formatDateRange(stats.startDate, stats.endDate)}
        </span>
        <a
          href={jiraIssueUrl(epic.jiraKey)}
          target="_blank"
          rel="noopener noreferrer"
          onClick={(event) => event.stopPropagation()}
          title="Open in Jira"
          className="shrink-0 rounded-full p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-white/10 dark:hover:text-slate-200"
        >
          <ArrowUpRight size={14} />
        </a>
      </button>
      {expanded && (
        <div className="border-t border-slate-200 px-3 py-2 dark:border-white/10">
          {epic.notes && <p className="mb-2 text-xs text-slate-500 dark:text-slate-400">{epic.notes}</p>}
          {epic.tasks.length === 0 ? (
            <p className="py-2 text-xs text-slate-400 dark:text-slate-500">No tasks synced yet.</p>
          ) : (
            epic.tasks.map((task) => (
              <AtlasTaskRow key={getId(task) ?? task.jiraKey} task={task} depth={0} blockedByLookup={blockedByLookup} ownerEpicId={epicId} />
            ))
          )}
        </div>
      )}
    </div>
  )
}

// Ticket 07's real sync wiring on top of ticket 06's scaffold: submitting
// the epic-key input triggers an immediate, synchronous
// resolve-and-recursively-sync against Jira (useAtlasEpics' trackEpic ->
// POST /api/atlas/epics), with a loading state on the button and an inline
// error on an unresolvable/non-Epic key (spec §4.1, §4.3). Ticket 08 adds
// the real Dashboard layout on top: a compact overview table with an inline
// accordion drill-down per epic, an archived-epics toggle, and no editing
// controls anywhere yet.
export function AtlasView() {
  const { epics, loading, loadError, tracking, trackError, trackEpic } = useAtlasEpics()
  const [epicKey, setEpicKey] = useState('')
  // One epic open by default - the first row in the active (non-archived)
  // list, unless the user has explicitly toggled that particular epic - not
  // exclusive-enforced, so more than one can stay open at once (spec §6's
  // "accordion ... one epic open by default (not exclusive-enforced)").
  // Deliberately index-derived rather than an effect that seeds "the first
  // epic once loaded": that would race the async epics fetch (nothing to
  // default-open until data arrives, and by the time it does the effect's
  // state update lands a render late). Tracking only explicit overrides
  // (id -> expanded) and falling back to "is this index 0?" is synchronous
  // and needs no effect at all.
  const [toggled, setToggled] = useState<Record<string, boolean>>({})
  const [showArchived, setShowArchived] = useState(false)

  const active = useMemo(() => epics.filter((epic) => !epic.archived), [epics])
  const archived = useMemo(() => epics.filter((epic) => epic.archived), [epics])
  const blockedByLookup = useMemo(() => buildBlockedByLookup(epics), [epics])

  function isExpanded(id: string, defaultExpanded: boolean): boolean {
    return toggled[id] ?? defaultExpanded
  }

  function toggle(id: string, defaultExpanded: boolean) {
    setToggled((current) => ({ ...current, [id]: !isExpanded(id, defaultExpanded) }))
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    const key = epicKey.trim()
    if (!key) return
    const ok = await trackEpic(key)
    if (ok) setEpicKey('')
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-white/10 dark:bg-white/5 dark:shadow-none dark:backdrop-blur-md">
        {!loading && epics.length === 0 && (
          <>
            <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">No epics tracked yet</h2>
            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
              Enter a Jira epic key to start tracking it. Atlas will pull in its full task and sub-task tree.
            </p>
          </>
        )}

        <form className="mt-4 flex items-center gap-2" onSubmit={handleSubmit}>
          <input
            type="text"
            value={epicKey}
            onChange={(event) => setEpicKey(event.target.value)}
            placeholder="e.g. WOSMVP-123"
            aria-label="Jira epic key"
            disabled={tracking}
            className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-fuchsia-400/60 focus:outline-none disabled:opacity-50 dark:border-white/10 dark:bg-white/5 dark:text-slate-100 dark:placeholder:text-slate-500"
          />
          <button
            type="submit"
            disabled={tracking || !epicKey.trim()}
            className="rounded-lg bg-gradient-to-r from-violet-500 to-fuchsia-500 px-3 py-1.5 text-sm font-semibold text-white hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {tracking ? 'Syncing…' : 'Track'}
          </button>
        </form>

        {trackError && <p className="mt-2 text-sm text-red-600 dark:text-red-400">Error: {trackError}</p>}
      </div>

      {loading && <p className="text-sm text-slate-400 dark:text-slate-500">Loading tracked epics…</p>}
      {loadError && <p className="text-sm text-red-600 dark:text-red-400">Error: {loadError}</p>}

      {!loading && active.length > 0 && (
        <div className="flex flex-col gap-2">
          {active.map((epic, index) => {
            const id = getId(epic) ?? epic.jiraKey
            const defaultExpanded = index === 0
            return (
              <AtlasEpicRow
                key={id}
                epic={epic}
                expanded={isExpanded(id, defaultExpanded)}
                onToggle={() => toggle(id, defaultExpanded)}
                blockedByLookup={blockedByLookup}
              />
            )
          })}
        </div>
      )}

      {!loading && archived.length > 0 && (
        <div>
          <button
            type="button"
            onClick={() => setShowArchived((value) => !value)}
            className="text-xs font-medium text-slate-500 underline decoration-dotted hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200"
          >
            {showArchived ? 'Hide' : 'Show'} {archived.length} archived epic{archived.length === 1 ? '' : 's'}
          </button>
          {showArchived && (
            <div className="mt-2 flex flex-col gap-2">
              {archived.map((epic) => {
                const id = getId(epic) ?? epic.jiraKey
                return (
                  <AtlasEpicRow
                    key={id}
                    epic={epic}
                    expanded={isExpanded(id, false)}
                    onToggle={() => toggle(id, false)}
                    blockedByLookup={blockedByLookup}
                    dimmed
                  />
                )
              })}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
