import type { JSONContent } from '@tiptap/core'
import { useMemo, useRef, useState, type FormEvent } from 'react'
import { AlertTriangle, ArrowUpRight, ChevronDown, ChevronRight, Pencil, StickyNote, X } from 'lucide-react'
import { useAtlasEpics, type UpdateAtlasTaskPatch } from '../hooks/useAtlasEpics'
import type { AtlasEpic, AtlasTaskNode } from '../types'
import { jiraIssueUrl } from '../constants/jira'
import { getId } from '../utils/getId'
import {
  AT_RISK_BADGE,
  STATUS_BADGE,
  buildBlockedByCandidates,
  buildBlockedByLookup,
  epicStats,
  formatDateRange,
  type BlockedByCandidate,
  type BlockedByRef,
} from '../utils/atlasStats'
import { ExpandableNotesEditor } from './ExpandableNotesEditor'
import type { RichTextEditorHandle } from './RichTextEditor'

// Dashboard layout (ticket 08, spec §6) - "dense table + inline accordion",
// the winning variant from the throwaway prototype branch (prototype/
// atlas-dashboard-ui-variants, VariantB.tsx; see .scratch/sprint-atlas-
// program/issues/04-dashboard-ui.md's Answer) - plus ticket 09's in-place
// task editing (dates/notes/at-risk override/blocked-by) layered onto the
// same recursive AtlasTaskRow. Sync now/archive/restore is still ticket 10.

// A single "Blocked by" chip - same shape whether same-epic or cross-epic,
// just with or without the ` · <epicKey>` suffix (spec §6's task row line
// 3). Prop is named `blocker`, not `ref` - a plain data value, not an
// actual React ref, despite the name overlap with BlockedByRef. `onRemove`
// is only ever passed while a row is in edit mode (ticket 09) - the
// read-only view shows the same chip with no "×" affordance at all.
function BlockedByChip({
  blocker,
  ownerEpicId,
  onRemove,
}: {
  blocker: BlockedByRef
  ownerEpicId: string
  onRemove?: () => void
}) {
  return (
    <span className="flex items-center gap-1 rounded-full bg-slate-100 px-1.5 py-0.5 text-[10px] font-medium text-slate-500 dark:bg-white/10 dark:text-slate-400">
      {blocker.jiraKey}
      {blocker.epicId !== ownerEpicId && <span className="text-slate-400 dark:text-slate-500"> · {blocker.epicKey}</span>}
      {onRemove && (
        <button
          type="button"
          aria-label={`Remove blocked-by link to ${blocker.jiraKey}`}
          onClick={onRemove}
          className="rounded-full text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"
        >
          <X size={10} />
        </button>
      )}
    </span>
  )
}

// The in-place edit panel for a single task/sub-task row (ticket 09, spec
// §5): manual start/end dates, rich-text notes (reusing the same editor
// family as Note/Todo notes), an at-risk manual-override toggle, and a
// blocked-by picker searching across every tracked, non-archived task in
// any epic (spec §5.2 - not scoped to the row's own epic). All local state
// here is staged (mirrors TodoDetail's own edit-then-Save pattern) and only
// sent to the server as one PATCH when Save is clicked.
//
// `atRisk` is the one field with tricky semantics: the checkbox always
// starts reflecting the row's current *effective* value, but the outgoing
// patch only ever includes `atRisk` if the checkbox was actually clicked
// (`atRiskTouched`) - otherwise saving a date/note edit on a task that
// happens to not be manually overridden yet would accidentally freeze the
// auto-risk rule at whatever the checkbox displayed in that moment. See
// utils/atlasRisk.ts's resolveAtRisk for the server-side half of this.
function TaskEditPanel({
  task,
  taskId,
  ownerEpicId,
  blockedByLookup,
  blockerCandidates,
  onSave,
  onCancel,
}: {
  task: AtlasTaskNode
  taskId: string
  ownerEpicId: string
  blockedByLookup: Map<string, BlockedByRef>
  blockerCandidates: BlockedByCandidate[]
  onSave: (patch: UpdateAtlasTaskPatch) => Promise<void>
  onCancel: () => void
}) {
  const [startDate, setStartDate] = useState(task.startDate ?? '')
  const [endDate, setEndDate] = useState(task.endDate ?? '')
  const [atRisk, setAtRisk] = useState(task.atRisk)
  const [atRiskTouched, setAtRiskTouched] = useState(false)
  const [blockedByIds, setBlockedByIds] = useState<string[]>(task.blockedBy)
  const [blockerQuery, setBlockerQuery] = useState('')
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const notesRef = useRef<RichTextEditorHandle>(null)

  const query = blockerQuery.trim().toLowerCase()
  const blockerResults = query
    ? blockerCandidates
        .filter((c) => c.taskId !== taskId && !blockedByIds.includes(c.taskId))
        .filter((c) => c.jiraKey.toLowerCase().includes(query) || c.title.toLowerCase().includes(query))
        .slice(0, 6)
    : []

  const stagedBlockers = blockedByIds.map((id) => blockedByLookup.get(id)).filter((ref): ref is BlockedByRef => Boolean(ref))

  async function handleSave() {
    setSaving(true)
    setSaveError(null)
    try {
      const notes = notesRef.current?.getJSON() ?? task.notes ?? null
      await onSave({
        startDate: startDate || null,
        endDate: endDate || null,
        notes: notes as JSONContent | null,
        blockedBy: blockedByIds,
        ...(atRiskTouched ? { atRisk } : {}),
      })
    } catch (err) {
      setSaveError((err as Error).message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="mt-2 flex flex-col gap-3 rounded-lg border border-fuchsia-400/30 bg-fuchsia-50/40 p-3 dark:border-fuchsia-400/20 dark:bg-fuchsia-500/5">
      <div className="grid grid-cols-2 gap-3">
        <label className="flex flex-col gap-1 text-xs font-medium text-slate-500 dark:text-slate-300">
          Start date
          <input
            type="date"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            className="rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-sm text-slate-900 focus:border-fuchsia-400/60 focus:outline-none dark:border-white/10 dark:bg-white/5 dark:text-slate-100"
          />
        </label>
        <label className="flex flex-col gap-1 text-xs font-medium text-slate-500 dark:text-slate-300">
          End date
          <input
            type="date"
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
            className="rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-sm text-slate-900 focus:border-fuchsia-400/60 focus:outline-none dark:border-white/10 dark:bg-white/5 dark:text-slate-100"
          />
        </label>
      </div>

      <label className="flex items-center gap-2 text-xs font-medium text-slate-600 dark:text-slate-300">
        <input
          type="checkbox"
          checked={atRisk}
          onChange={(e) => {
            setAtRisk(e.target.checked)
            setAtRiskTouched(true)
          }}
          className="h-3.5 w-3.5 accent-rose-500"
        />
        Mark at risk (overrides the automatic end-date rule)
      </label>

      <div className="flex flex-col gap-1">
        <span className="text-xs font-medium text-slate-500 dark:text-slate-300">Notes</span>
        <ExpandableNotesEditor
          ref={notesRef}
          content={task.notes}
          savedContent={task.notes}
          editable
          toolbar
          className="min-h-[80px] rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 dark:border-white/10 dark:bg-white/5 dark:text-slate-100"
          contentClassName="max-h-[30vh] overflow-y-auto [&_.tiptap]:min-h-[60px]"
        />
      </div>

      <div className="flex flex-col gap-1">
        <span className="text-xs font-medium text-slate-500 dark:text-slate-300">Blocked by</span>
        <input
          type="search"
          value={blockerQuery}
          onChange={(e) => setBlockerQuery(e.target.value)}
          placeholder="Search tasks in any epic..."
          aria-label={`Search tasks to block ${task.jiraKey} on`}
          className="w-full rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm text-slate-900 placeholder:text-slate-400 focus:border-fuchsia-400/60 focus:outline-none dark:border-white/10 dark:bg-white/5 dark:text-slate-100 dark:placeholder:text-slate-500"
        />
        {blockerResults.length > 0 && (
          <div className="flex flex-col gap-1 rounded-lg border border-slate-200 bg-white p-1 shadow-sm dark:border-white/10 dark:bg-[#1c1330]">
            {blockerResults.map((c) => (
              <button
                key={c.taskId}
                type="button"
                onClick={() => {
                  setBlockedByIds((prev) => [...prev, c.taskId])
                  setBlockerQuery('')
                }}
                className="flex items-center justify-between rounded-md px-2 py-1.5 text-left text-xs text-slate-700 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-white/10"
              >
                <span className="truncate">
                  <span className="font-mono font-semibold text-fuchsia-600 dark:text-fuchsia-300">{c.jiraKey}</span>{' '}
                  {c.title}
                  {c.epicId !== ownerEpicId && <span className="text-slate-400 dark:text-slate-500"> · {c.epicKey}</span>}
                </span>
                <span className="shrink-0 text-[11px] font-semibold text-fuchsia-600 dark:text-fuchsia-300">+ Add</span>
              </button>
            ))}
          </div>
        )}
        {stagedBlockers.length > 0 && (
          <div className="flex flex-wrap items-center gap-1 pt-1">
            {stagedBlockers.map((blocker) => (
              <BlockedByChip
                key={blocker.taskId}
                blocker={blocker}
                ownerEpicId={ownerEpicId}
                onRemove={() => setBlockedByIds((prev) => prev.filter((id) => id !== blocker.taskId))}
              />
            ))}
          </div>
        )}
      </div>

      {saveError && <p className="text-xs text-red-600 dark:text-red-400">Error: {saveError}</p>}

      <div className="flex justify-end gap-2">
        <button
          type="button"
          onClick={onCancel}
          className="rounded-lg border border-slate-200 px-2.5 py-1 text-xs text-slate-600 hover:bg-slate-100 dark:border-white/10 dark:text-slate-300 dark:hover:bg-white/5"
        >
          Cancel
        </button>
        <button
          type="button"
          disabled={saving}
          onClick={handleSave}
          className="rounded-lg bg-gradient-to-r from-violet-500 to-fuchsia-500 px-2.5 py-1 text-xs font-semibold text-white hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {saving ? 'Saving…' : 'Save'}
        </button>
      </div>
    </div>
  )
}

// Recursive - same component at every depth level (spec §6's task/sub-task
// row). Depth hard-floors at one nested level server-side, but this
// component itself has no ceiling; it just keeps indenting whatever
// `subtasks` it's handed. Sub-task rows are indented 18px per depth with a
// left border guide, styled closer to NotesView.tsx's tree rows than any
// card/popover/drawer archetype (docs/ui-conventions.md's noted deviation).
//
// Editing (ticket 09) is a per-row toggle (`editing` state) rather than
// anything lifted to AtlasView - each row owns whether its own TaskEditPanel
// is open, exactly as many at once as the user has clicked into.
function AtlasTaskRow({
  task,
  depth,
  blockedByLookup,
  blockerCandidates,
  ownerEpicId,
  onUpdateTask,
  readOnly,
}: {
  task: AtlasTaskNode
  depth: number
  blockedByLookup: Map<string, BlockedByRef>
  blockerCandidates: BlockedByCandidate[]
  ownerEpicId: string
  onUpdateTask: (taskId: string, patch: UpdateAtlasTaskPatch) => Promise<void>
  readOnly?: boolean
}) {
  const [editing, setEditing] = useState(false)
  const taskId = getId(task)
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
            {task.notesText && (
              <span className="flex items-center gap-0.5" title={task.notesText}>
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
          {!readOnly && editing && taskId && (
            <TaskEditPanel
              task={task}
              taskId={taskId}
              ownerEpicId={ownerEpicId}
              blockedByLookup={blockedByLookup}
              blockerCandidates={blockerCandidates}
              onCancel={() => setEditing(false)}
              onSave={async (patch) => {
                await onUpdateTask(taskId, patch)
                setEditing(false)
              }}
            />
          )}
        </div>
        {!readOnly && taskId && !editing && (
          <button
            type="button"
            aria-label={`Edit ${task.jiraKey}`}
            title="Edit"
            onClick={() => setEditing(true)}
            className="shrink-0 rounded-full p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-white/10 dark:hover:text-slate-200"
          >
            <Pencil size={12} />
          </button>
        )}
      </div>
      {task.subtasks.map((sub) => (
        <AtlasTaskRow
          key={getId(sub) ?? sub.jiraKey}
          task={sub}
          depth={depth + 1}
          blockedByLookup={blockedByLookup}
          blockerCandidates={blockerCandidates}
          ownerEpicId={ownerEpicId}
          onUpdateTask={onUpdateTask}
          readOnly={readOnly}
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
  blockerCandidates,
  onUpdateTask,
  dimmed,
}: {
  epic: AtlasEpic
  expanded: boolean
  onToggle: () => void
  blockedByLookup: Map<string, BlockedByRef>
  blockerCandidates: BlockedByCandidate[]
  onUpdateTask: (taskId: string, patch: UpdateAtlasTaskPatch) => Promise<void>
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
              <AtlasTaskRow
                key={getId(task) ?? task.jiraKey}
                task={task}
                depth={0}
                blockedByLookup={blockedByLookup}
                blockerCandidates={blockerCandidates}
                ownerEpicId={epicId}
                onUpdateTask={onUpdateTask}
                // Archived epics stay read-only drill-down (ticket 10's
                // "Archived list + restore" - `dimmed` is only ever passed
                // for the archived-epics list below): no Edit affordance,
                // to avoid editing tasks that are about to be un-hidden by
                // a restore action this ticket doesn't own.
                readOnly={dimmed}
              />
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
// accordion drill-down per epic, an archived-epics toggle. Ticket 09 adds
// in-place task editing (dates/notes/at-risk override/blocked-by) via
// useAtlasEpics' updateTask, and the cross-epic blocked-by picker's search
// universe (blockerCandidates, built once here and threaded down through
// every AtlasEpicRow/AtlasTaskRow).
export function AtlasView() {
  const { epics, loading, loadError, tracking, trackError, trackEpic, updateTask } = useAtlasEpics()
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
  const blockerCandidates = useMemo(() => buildBlockedByCandidates(epics), [epics])

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
                blockerCandidates={blockerCandidates}
                onUpdateTask={updateTask}
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
                    blockerCandidates={blockerCandidates}
                    onUpdateTask={updateTask}
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
