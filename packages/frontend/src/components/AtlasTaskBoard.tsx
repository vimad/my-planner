import { useMemo, useRef, useState, type ReactNode } from 'react'
import { ArrowUpRight, ChevronDown, ChevronRight, CornerDownRight, Search } from 'lucide-react'
import { useAtlasRosterPeople } from '../hooks/useAtlasRosterPeople'
import { resolveAssignee, type AssigneeInfo } from '../utils/atlasAssignee'
import {
  collectLeafTasks,
  groupByParentTask,
  STATUS_BADGE,
  type AtlasLeafTask,
  type AtlasStatusBucket,
  type BoardRowGroup,
  type ParentTaskRef,
} from '../utils/atlasStats'
import type { AtlasEpic } from '../types'
import { AssigneeAvatar } from './AssigneeAvatar'

const STATUSES: AtlasStatusBucket[] = ['To Do', 'In Progress', 'Done']

type GroupBy = 'status' | 'assignee' | 'epic'

interface LeafTaskWithAssignee {
  task: AtlasLeafTask
  assignee: AssigneeInfo
}

interface AssigneeOption extends AssigneeInfo {
  count: number
}

// A Jira-board-adjacent view of leaf tasks (epics, and any task with visible
// sub-tasks, excluded - utils/atlasStats.ts's collectLeafTasks) across every
// active epic. Folded in from the winning variant of branch prototype/
// atlas-task-board-nav (that branch also carries Variants A and C, kept as
// the primary source for the ones not picked). "Group by" is the single
// navigation control: Status keeps a dense table, Assignee hands off to
// PersonSwimlanes (a person becomes a whole labeled row instead of a filter
// avatar - much easier to pick by name than the old bare-avatar strip this
// replaced), and Epic hands off to EpicCardGroups (collapsed-by-default
// epics - same convention as AtlasView's "Tracked epics" accordion below -
// with leaf tasks as cards once expanded). Assignee *picking* itself is a
// searchable combobox with real names and per-person counts, not avatars.
//
// Lives on Atlas's own "Board" tab (AtlasView.tsx) rather than stacked above
// the epic list, so it no longer collapses itself - the tab switch is
// already the show/hide control.
export function AtlasTaskBoard({ epics }: { epics: AtlasEpic[] }) {
  const people = useAtlasRosterPeople()
  const [query, setQuery] = useState('')
  const [groupBy, setGroupBy] = useState<GroupBy>('status')
  const [statusFilter, setStatusFilter] = useState<Set<AtlasStatusBucket>>(new Set(STATUSES))
  const [selectedPeople, setSelectedPeople] = useState<Set<string>>(new Set())
  const [hideUnassigned, setHideUnassigned] = useState(false)
  const [hideOutsideProgram, setHideOutsideProgram] = useState(false)
  const [comboOpen, setComboOpen] = useState(false)
  const [comboQuery, setComboQuery] = useState('')

  const peopleByAccountId = useMemo(() => {
    const map = new Map<string, (typeof people)[number]>()
    for (const p of people) map.set(p.jiraAccountId, p)
    return map
  }, [people])

  const items = useMemo<LeafTaskWithAssignee[]>(() => {
    return collectLeafTasks(epics).map((task) => ({
      task,
      assignee: resolveAssignee(task.assigneeAccountId, peopleByAccountId),
    }))
  }, [epics, peopleByAccountId])

  // Distinct assignees present in this board's tasks, for the picker -
  // named first alphabetically, then Unmapped/Unassigned trailing (matches
  // PlanningView's "explicit gap states sort last" convention) - plus a
  // per-person count so the picker shows "why" someone matters before
  // they're even selected.
  const assigneeOptions = useMemo<AssigneeOption[]>(() => {
    const byKey = new Map<string, AssigneeOption>()
    for (const { assignee } of items) {
      const existing = byKey.get(assignee.key)
      if (existing) existing.count += 1
      else byKey.set(assignee.key, { ...assignee, count: 1 })
    }
    const order: Record<AssigneeInfo['kind'], number> = { named: 0, unmapped: 1, unassigned: 2 }
    return [...byKey.values()].sort((a, b) => order[a.kind] - order[b.kind] || a.label.localeCompare(b.label))
  }, [items])

  const comboOptions = useMemo(
    () => assigneeOptions.filter((a) => a.label.toLowerCase().includes(comboQuery.toLowerCase())),
    [assigneeOptions, comboQuery],
  )

  function toggleStatus(status: AtlasStatusBucket) {
    setStatusFilter((prev) => {
      const next = new Set(prev)
      if (next.has(status)) next.delete(status)
      else next.add(status)
      return next
    })
  }

  function togglePerson(key: string) {
    setSelectedPeople((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  const filtered = items.filter(({ task, assignee }) => {
    if (!statusFilter.has(task.status)) return false
    if (hideUnassigned && assignee.kind === 'unassigned') return false
    if (hideOutsideProgram && task.isOutsideProgram) return false
    if (selectedPeople.size > 0 && !selectedPeople.has(assignee.key)) return false
    if (query && !`${task.jiraKey} ${task.title}`.toLowerCase().includes(query.toLowerCase())) return false
    return true
  })

  const statusGroups = useMemo(() => {
    const map = new Map<AtlasStatusBucket, LeafTaskWithAssignee[]>()
    for (const row of filtered) {
      if (!map.has(row.task.status)) map.set(row.task.status, [])
      map.get(row.task.status)!.push(row)
    }
    return STATUSES.filter((s) => map.has(s)).map((status) => ({ status, rows: map.get(status)! }))
  }, [filtered])

  const selectedLabel = selectedPeople.size === 0 ? 'All people' : `${selectedPeople.size} selected`

  if (items.length === 0) return null

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-white/10 dark:bg-white/5 dark:shadow-none dark:backdrop-blur-md">
      <div className="min-w-0 flex-1">
        <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">Task board</h2>
        <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
          Leaf tasks only - epics and tasks with sub-tasks are excluded.
        </p>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <div className="relative">
          <Search size={13} className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search key or title…"
            aria-label="Search leaf tasks"
            className="w-48 rounded-lg border border-slate-200 bg-slate-50 py-1.5 pl-7 pr-2 text-xs text-slate-900 placeholder:text-slate-400 focus:border-fuchsia-400/60 focus:outline-none dark:border-white/10 dark:bg-white/5 dark:text-slate-100"
          />
        </div>

        <div className="flex items-center gap-1 rounded-full border border-slate-200 bg-white p-1 dark:border-white/10 dark:bg-white/5">
          {STATUSES.map((status) => (
            <button
              key={status}
              type="button"
              onClick={() => toggleStatus(status)}
              title={statusFilter.has(status) ? `Hide ${status} column` : `Show ${status} column`}
              className={`rounded-full px-2.5 py-1 text-xs font-semibold transition ${
                statusFilter.has(status)
                  ? STATUS_BADGE[status]
                  : 'text-slate-400 line-through hover:bg-slate-100 dark:text-slate-500 dark:hover:bg-white/10'
              }`}
            >
              {status}
            </button>
          ))}
        </div>

        <AssigneeCombobox
          options={comboOptions}
          selected={selectedPeople}
          onToggle={togglePerson}
          onClear={() => setSelectedPeople(new Set())}
          open={comboOpen}
          onOpenChange={setComboOpen}
          query={comboQuery}
          onQueryChange={setComboQuery}
          label={selectedLabel}
        />

        <label className="flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400">
          <input type="checkbox" checked={hideUnassigned} onChange={() => setHideUnassigned((v) => !v)} className="accent-fuchsia-500" />
          Hide unassigned
        </label>

        <label className="flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400">
          <input
            type="checkbox"
            checked={hideOutsideProgram}
            onChange={() => setHideOutsideProgram((v) => !v)}
            className="accent-fuchsia-500"
          />
          Hide outside the program
        </label>

        <div className="ml-auto flex items-center gap-1 text-xs text-slate-500 dark:text-slate-400">
          Group by
          <select
            value={groupBy}
            onChange={(e) => setGroupBy(e.target.value as GroupBy)}
            aria-label="Group tasks by"
            className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs dark:border-white/10 dark:bg-white/5 dark:text-slate-200"
          >
            <option value="status">Status</option>
            <option value="assignee">Assignee</option>
            <option value="epic">Epic</option>
          </select>
        </div>
      </div>

      <p className="mt-2 text-xs text-slate-400 dark:text-slate-500">
        {filtered.length} of {items.length} tasks
      </p>

      <div className="mt-2">
        {groupBy === 'assignee' && (
          <PersonSwimlanes items={filtered} assigneeOptions={assigneeOptions} hideUnassigned={hideUnassigned} />
        )}
        {groupBy === 'epic' && <EpicCardGroups items={filtered} epics={epics} />}
        {groupBy === 'status' && <StatusTable groups={statusGroups} />}
      </div>
    </div>
  )
}

function AssigneeCombobox({
  options,
  selected,
  onToggle,
  onClear,
  open,
  onOpenChange,
  query,
  onQueryChange,
  label,
}: {
  options: AssigneeOption[]
  selected: Set<string>
  onToggle: (key: string) => void
  onClear: () => void
  open: boolean
  onOpenChange: (open: boolean) => void
  query: string
  onQueryChange: (query: string) => void
  label: string
}) {
  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => onOpenChange(!open)}
        className="flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50 dark:border-white/10 dark:bg-white/5 dark:text-slate-300"
      >
        {label} <ChevronDown size={12} />
      </button>
      {open && (
        <div className="absolute z-20 mt-1 w-64 rounded-lg border border-slate-200 bg-white p-2 shadow-lg dark:border-white/10 dark:bg-slate-800">
          <input
            autoFocus
            value={query}
            onChange={(e) => onQueryChange(e.target.value)}
            placeholder="Type a name…"
            aria-label="Filter people"
            className="mb-2 w-full rounded-md border border-slate-200 bg-slate-50 px-2 py-1 text-xs text-slate-900 focus:border-fuchsia-400/60 focus:outline-none dark:border-white/10 dark:bg-white/5 dark:text-slate-100"
          />
          <div className="max-h-56 overflow-y-auto">
            {options.map((a) => (
              <label key={a.key} className="flex cursor-pointer items-center gap-2 rounded-md px-1.5 py-1 text-xs hover:bg-slate-50 dark:hover:bg-white/5">
                <input type="checkbox" checked={selected.has(a.key)} onChange={() => onToggle(a.key)} className="accent-fuchsia-500" />
                <AssigneeAvatar assignee={a} size={18} />
                <span className="flex-1 truncate text-slate-700 dark:text-slate-200">{a.label}</span>
                <span className="text-slate-400">{a.count}</span>
              </label>
            ))}
          </div>
          <div className="mt-2 flex justify-between border-t border-slate-100 pt-1.5 dark:border-white/10">
            <button type="button" onClick={onClear} className="text-[11px] font-medium text-fuchsia-600 hover:underline dark:text-fuchsia-300">
              Clear
            </button>
            <button type="button" onClick={() => onOpenChange(false)} className="text-[11px] font-medium text-slate-500 hover:text-slate-700 dark:text-slate-400">
              Done
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

// A task's sub-tasks, boxed together with the parent task's own key/title
// literally cutting across the top border line - the native <fieldset>/
// <legend> "notched border" rendering (browsers carve the border out from
// behind the legend automatically), rather than a header bar sitting above
// a separate box. Border/bg follow the same "tinted card" idiom as
// StatusView.tsx's issue-type-tinted TicketCard (docs/ui-conventions.md,
// Archetype D variant) - fuchsia is this app's general accent color, so a
// fuchsia tint reads as "grouped by task", distinct from that variant's
// bug/story/task colors. Reused (just re-wrapped per layout, via `children`)
// across all three "Group by" modes so a task's sub-tasks read the same way
// no matter which mode surfaced them.
function SubtaskFieldset({
  parent,
  count,
  className = '',
  children,
}: {
  parent: ParentTaskRef
  count: number
  className?: string
  children: ReactNode
}) {
  return (
    <fieldset
      className={`m-0 min-w-0 rounded-xl border border-fuchsia-300 bg-fuchsia-100 p-0 dark:border-fuchsia-500/30 dark:bg-fuchsia-500/10 ${className}`}
    >
      <legend className="ml-3 flex max-w-[calc(100%-1.5rem)] items-center gap-1.5 px-1.5 text-xs">
        <CornerDownRight size={12} className="shrink-0 text-fuchsia-500 dark:text-fuchsia-300" />
        <span className="shrink-0 font-mono text-[10px] font-semibold text-fuchsia-600 dark:text-fuchsia-300">{parent.jiraKey}</span>
        <span className="min-w-0 truncate font-semibold text-slate-700 dark:text-slate-200">{parent.title}</span>
        <span className="shrink-0 text-[10px] font-medium text-fuchsia-500 dark:text-fuchsia-300/70">
          {count} sub-task{count === 1 ? '' : 's'}
        </span>
        <a
          href={parent.jiraUrl}
          target="_blank"
          rel="noopener noreferrer"
          title="Open parent task in Jira"
          className="shrink-0 text-fuchsia-500 hover:text-fuchsia-700 dark:text-fuchsia-300/70 dark:hover:text-fuchsia-200"
        >
          <ArrowUpRight size={11} />
        </a>
      </legend>
      {children}
    </fieldset>
  )
}

// A directly-tracked "Outside the program" ticket gets an indigo left-edge
// accent instead of an icon (per this board's "mark it without cluttering
// the card" convention) - indigo isn't reserved for anything else app-wide
// (docs/ui-conventions.md's Semantic colors), so it reads as a distinct new
// meaning rather than colliding with fuchsia's general-accent/sub-task-group
// role or any of the other one-off reserved hues.
const OUTSIDE_PROGRAM_ACCENT = 'border-indigo-400 dark:border-indigo-400/60'

function TaskTableRow({ task, assignee }: LeafTaskWithAssignee) {
  return (
    <tr
      className={`border-t border-slate-100 first:border-t-0 hover:bg-slate-50/70 dark:border-white/5 dark:hover:bg-white/5 ${
        task.isOutsideProgram ? `border-l-2 ${OUTSIDE_PROGRAM_ACCENT}` : ''
      }`}
    >
      <td className="w-24 px-3 py-1.5 font-mono text-[11px] font-semibold text-fuchsia-600 dark:text-fuchsia-300">{task.jiraKey}</td>
      <td className="px-3 py-1.5 text-slate-800 dark:text-slate-100">{task.title}</td>
      <td className="w-44 px-3 py-1.5">
        <div className="flex items-center gap-1.5">
          <AssigneeAvatar assignee={assignee} size={16} />
          <span className="truncate text-slate-600 dark:text-slate-300">{assignee.label}</span>
        </div>
      </td>
      <td className="w-24 px-3 py-1.5 text-slate-400 dark:text-slate-500">{task.isOutsideProgram ? 'Outside' : task.epicKey}</td>
      <td className="w-8 px-3 py-1.5 text-right">
        <a
          href={task.jiraUrl}
          target="_blank"
          rel="noopener noreferrer"
          title="Open in Jira"
          className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
        >
          <ArrowUpRight size={11} />
        </a>
      </td>
    </tr>
  )
}

// "Group by: Status" - a dense table, the default view. Reads more names/
// rows per screen than the old kanban cards did, which was the actual fix
// for "hard to navigate". Within a status, a task's sub-tasks (identified by
// AtlasLeafTask.parent via groupByParentTask) are clustered into one
// fuchsia-bordered box - a mini nested table - with the parent task's own
// key/title as the box's label, instead of scattering as indistinguishable
// flat rows.
function StatusTable({ groups }: { groups: { status: AtlasStatusBucket; rows: LeafTaskWithAssignee[] }[] }) {
  return (
    <div className="overflow-hidden rounded-lg border border-slate-200 dark:border-white/10">
      {groups.length === 0 && <p className="p-4 text-center text-sm text-slate-400 dark:text-slate-500">No tasks match these filters.</p>}
      {groups.map((group) => (
        <div key={group.status}>
          <div className="flex items-center justify-between bg-slate-50 px-3 py-1.5 text-xs font-bold text-slate-500 dark:bg-white/5 dark:text-slate-400">
            <span>{group.status}</span>
            <span className="text-slate-400">{group.rows.length}</span>
          </div>
          <table className="w-full border-collapse text-xs">
            <tbody>
              {groupByParentTask(group.rows).map((entry) =>
                entry.kind === 'single' ? (
                  <TaskTableRow key={entry.row.task.taskId} {...entry.row} />
                ) : (
                  <SubtaskGroupTableRow key={`group-${entry.parent.taskId}`} entry={entry} />
                ),
              )}
            </tbody>
          </table>
        </div>
      ))}
    </div>
  )
}

function SubtaskGroupTableRow({ entry }: { entry: BoardRowGroup<LeafTaskWithAssignee> & { kind: 'group' } }) {
  return (
    <tr className="border-t border-slate-100 dark:border-white/5">
      <td colSpan={5} className="p-1.5">
        <SubtaskFieldset parent={entry.parent} count={entry.rows.length} className="overflow-hidden">
          <table className="w-full border-collapse text-xs">
            <tbody>
              {entry.rows.map(({ task, assignee }) => (
                <TaskTableRow key={task.taskId} task={task} assignee={assignee} />
              ))}
            </tbody>
          </table>
        </SubtaskFieldset>
      </td>
    </tr>
  )
}

// "Group by: Assignee" - a person becomes a whole labeled row (avatar, full
// name, progress bar) instead of a filter avatar, so "find someone" turns
// into scrolling to their lane rather than decoding a tiny badge. The
// jump-nav strip at top scrolls to + flashes a lane on click, a spatial
// alternative to filtering. "Hide unassigned" (the board's own toolbar
// checkbox) drops the Unassigned lane outright here.
function PersonSwimlanes({
  items,
  assigneeOptions,
  hideUnassigned,
}: {
  items: LeafTaskWithAssignee[]
  assigneeOptions: AssigneeOption[]
  hideUnassigned: boolean
}) {
  const [flashKey, setFlashKey] = useState<string | null>(null)
  const laneRefs = useRef<Map<string, HTMLDivElement>>(new Map())

  const lanes = useMemo(() => {
    const byKey = new Map<string, LeafTaskWithAssignee[]>()
    for (const row of items) {
      if (!byKey.has(row.assignee.key)) byKey.set(row.assignee.key, [])
      byKey.get(row.assignee.key)!.push(row)
    }
    return assigneeOptions
      .filter((a) => byKey.has(a.key))
      .filter((a) => !(hideUnassigned && a.kind === 'unassigned'))
      .map((a) => ({ assignee: a, rows: byKey.get(a.key)! }))
  }, [items, assigneeOptions, hideUnassigned])

  function jumpTo(key: string) {
    laneRefs.current.get(key)?.scrollIntoView({ behavior: 'smooth', block: 'center' })
    setFlashKey(key)
    window.setTimeout(() => setFlashKey((cur) => (cur === key ? null : cur)), 900)
  }

  return (
    <>
      <div className="flex flex-wrap gap-1.5 border-b border-slate-100 pb-3 dark:border-white/10">
        {lanes.map(({ assignee, rows }) => (
          <button
            key={assignee.key}
            type="button"
            onClick={() => jumpTo(assignee.key)}
            title={`Jump to ${assignee.label}`}
            className="flex items-center gap-1.5 rounded-full border border-slate-200 bg-white py-1 pl-1 pr-2.5 text-xs hover:border-fuchsia-300 hover:bg-fuchsia-50 dark:border-white/10 dark:bg-white/5 dark:hover:border-fuchsia-400/40 dark:hover:bg-fuchsia-500/10"
          >
            <AssigneeAvatar assignee={assignee} size={18} />
            <span className="font-medium text-slate-700 dark:text-slate-200">{assignee.label}</span>
            <span className="text-slate-400">{rows.length}</span>
          </button>
        ))}
      </div>

      <div className="mt-3 flex flex-col gap-3">
        {lanes.length === 0 && <p className="p-4 text-center text-sm text-slate-400 dark:text-slate-500">No tasks match these filters.</p>}
        {lanes.map(({ assignee, rows }) => {
          const done = rows.filter((r) => r.task.status === 'Done').length
          const pct = rows.length === 0 ? 0 : Math.round((done / rows.length) * 100)
          return (
            <div
              key={assignee.key}
              ref={(el) => {
                if (el) laneRefs.current.set(assignee.key, el)
                else laneRefs.current.delete(assignee.key)
              }}
              className={`rounded-xl border p-2.5 transition ${
                flashKey === assignee.key
                  ? 'border-fuchsia-400 bg-fuchsia-50/70 dark:border-fuchsia-400/50 dark:bg-fuchsia-500/10'
                  : 'border-slate-200 bg-slate-50/50 dark:border-white/10 dark:bg-white/[0.02]'
              }`}
            >
              <div className="mb-2 flex items-center gap-2">
                <AssigneeAvatar assignee={assignee} size={22} />
                <span className="text-sm font-semibold text-slate-800 dark:text-slate-100">{assignee.label}</span>
                <span className="text-xs text-slate-400 dark:text-slate-500">{rows.length} tasks</span>
                <div className="ml-auto flex w-28 items-center gap-1.5">
                  <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-slate-200 dark:bg-white/10">
                    <div className="h-full rounded-full bg-emerald-500" style={{ width: `${pct}%` }} />
                  </div>
                  <span className="text-[10px] text-slate-400 dark:text-slate-500">{pct}%</span>
                </div>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {groupByParentTask(rows).map((entry) =>
                  entry.kind === 'single' ? (
                    <TaskChip key={entry.row.task.taskId} task={entry.row.task} />
                  ) : (
                    <SubtaskFieldset key={`group-${entry.parent.taskId}`} parent={entry.parent} count={entry.rows.length} className="w-full">
                      <div className="flex flex-wrap gap-1.5 px-2 pb-2 pt-1">
                        {entry.rows.map(({ task }) => (
                          <TaskChip key={task.taskId} task={task} />
                        ))}
                      </div>
                    </SubtaskFieldset>
                  ),
                )}
              </div>
            </div>
          )
        })}
      </div>
    </>
  )
}

function TaskChip({ task }: { task: AtlasLeafTask }) {
  return (
    <div
      className={`flex items-center gap-1.5 rounded-lg border bg-white px-2 py-1 text-[11px] shadow-sm dark:bg-white/5 ${
        task.isOutsideProgram ? `border-2 ${OUTSIDE_PROGRAM_ACCENT}` : 'border-slate-200 dark:border-white/10'
      }`}
    >
      <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${STATUS_BADGE[task.status].split(' ')[0]}`} />
      <span className="font-mono font-semibold text-fuchsia-600 dark:text-fuchsia-300">{task.jiraKey}</span>
      <span className="max-w-40 truncate text-slate-700 dark:text-slate-200">{task.title}</span>
      <a
        href={task.jiraUrl}
        target="_blank"
        rel="noopener noreferrer"
        title="Open in Jira"
        className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
      >
        <ArrowUpRight size={10} />
      </a>
    </div>
  )
}

// "Group by: Epic" - collapsed-by-default epics (same convention as
// AtlasView's own "Tracked epics" accordion below), opening one drops its
// leaf tasks in below as cards instead of a nested task tree. Deliberately
// lighter than that accordion - no dates/notes/blocked-by/risk-override
// editing, just the same leaf-task data the rest of this board already has -
// so it's not a replacement for that section yet, just this board's own
// epic-first way to browse the same leaf tasks.
function EpicCardGroups({ items, epics }: { items: LeafTaskWithAssignee[]; epics: AtlasEpic[] }) {
  const [expandedEpics, setExpandedEpics] = useState<Set<string>>(new Set())

  const groups = useMemo(() => {
    const byKey = new Map<string, LeafTaskWithAssignee[]>()
    for (const row of items) {
      if (!byKey.has(row.task.epicKey)) byKey.set(row.task.epicKey, [])
      byKey.get(row.task.epicKey)!.push(row)
    }
    return epics.filter((e) => byKey.has(e.jiraKey)).map((e) => ({ epic: e, rows: byKey.get(e.jiraKey)! }))
  }, [items, epics])

  function toggle(key: string) {
    setExpandedEpics((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  if (groups.length === 0) return <p className="p-4 text-center text-sm text-slate-400 dark:text-slate-500">No tasks match these filters.</p>

  return (
    <div className="flex flex-col gap-2">
      {groups.map(({ epic, rows }) => {
        const done = rows.filter((r) => r.task.status === 'Done').length
        const pct = rows.length === 0 ? 0 : Math.round((done / rows.length) * 100)
        const isOpen = expandedEpics.has(epic.jiraKey)
        return (
          <div
            key={epic.jiraKey}
            className={`overflow-hidden rounded-xl border ${
              epic.isOutsideProgram ? OUTSIDE_PROGRAM_ACCENT : 'border-slate-200 dark:border-white/10'
            }`}
          >
            <button
              type="button"
              onClick={() => toggle(epic.jiraKey)}
              className="flex w-full items-center gap-2 bg-slate-50 px-3 py-2 text-left hover:bg-slate-100 dark:bg-white/5 dark:hover:bg-white/10"
            >
              {isOpen ? (
                <ChevronDown size={13} className="shrink-0 text-slate-400" />
              ) : (
                <ChevronRight size={13} className="shrink-0 text-slate-400" />
              )}
              {!epic.isOutsideProgram && (
                <span className="shrink-0 font-mono text-xs font-semibold text-fuchsia-600 dark:text-fuchsia-300">{epic.jiraKey}</span>
              )}
              <span className="min-w-0 flex-1 truncate text-sm font-medium text-slate-800 dark:text-slate-100">{epic.title}</span>
              <span className="shrink-0 text-xs text-slate-400 dark:text-slate-500">{rows.length} tasks</span>
              <div className="flex w-28 shrink-0 items-center gap-1.5">
                <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-slate-200 dark:bg-white/10">
                  <div className="h-full rounded-full bg-emerald-500" style={{ width: `${pct}%` }} />
                </div>
                <span className="w-8 text-right text-[10px] text-slate-400 dark:text-slate-500">{pct}%</span>
              </div>
              {!epic.isOutsideProgram && (
                <a
                  href={epic.jiraUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={(e) => e.stopPropagation()}
                  title="Open epic in Jira"
                  className="shrink-0 rounded-full p-0.5 text-slate-400 hover:bg-slate-200 hover:text-slate-600 dark:hover:bg-white/10 dark:hover:text-slate-200"
                >
                  <ArrowUpRight size={12} />
                </a>
              )}
            </button>

            {isOpen && (
              <div className="flex flex-wrap gap-2 border-t border-slate-200 bg-white p-2.5 dark:border-white/10 dark:bg-white/[0.02]">
                {groupByParentTask(rows).map((entry) =>
                  entry.kind === 'single' ? (
                    <TaskCard key={entry.row.task.taskId} task={entry.row.task} assignee={entry.row.assignee} />
                  ) : (
                    <SubtaskFieldset key={`group-${entry.parent.taskId}`} parent={entry.parent} count={entry.rows.length} className="w-full">
                      <div className="flex flex-wrap gap-2 px-2.5 pb-2.5 pt-1">
                        {entry.rows.map(({ task, assignee }) => (
                          <TaskCard key={task.taskId} task={task} assignee={assignee} />
                        ))}
                      </div>
                    </SubtaskFieldset>
                  ),
                )}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}

function TaskCard({ task, assignee }: { task: AtlasLeafTask; assignee: AssigneeInfo }) {
  return (
    <div
      className={`w-56 rounded-lg border bg-white p-2 shadow-sm dark:bg-white/5 ${
        task.isOutsideProgram ? `border-2 ${OUTSIDE_PROGRAM_ACCENT}` : 'border-slate-200 dark:border-white/10'
      }`}
    >
      <div className="flex items-center justify-between gap-1">
        <span className="font-mono text-[10px] font-semibold text-fuchsia-600 dark:text-fuchsia-300">{task.jiraKey}</span>
        <a
          href={task.jiraUrl}
          target="_blank"
          rel="noopener noreferrer"
          title="Open in Jira"
          className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
        >
          <ArrowUpRight size={11} />
        </a>
      </div>
      <p className="mt-1 text-xs text-slate-800 dark:text-slate-100">{task.title}</p>
      <div className="mt-1.5 flex items-center gap-1.5">
        <span className={`rounded-full px-1.5 py-0.5 text-[9px] font-semibold ${STATUS_BADGE[task.status]}`}>{task.status}</span>
        <AssigneeAvatar assignee={assignee} size={16} />
        <span className="truncate text-[10px] text-slate-500 dark:text-slate-400">{assignee.label}</span>
      </div>
    </div>
  )
}
