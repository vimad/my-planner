// Pure computed-values layer for the Atlas Dashboard view (ticket 08,
// .scratch/sprint-atlas-program/issues/08-dashboard-view.md). Every value
// here is derived at read time from an AtlasEpic's already-fetched task
// tree - progress %, status-bucket counts, at-risk count, and date-range
// roll-up are never stored server-side (spec §2), so the dashboard row and
// task rows compute them client-side from the same tree the API already
// returned.
import type { AtlasEpic, AtlasTaskNode } from '../types'
import { getId } from './getId'

// Same three buckets as AtlasTask.status (backend models/AtlasTask.ts) -
// kept as a local re-export rather than importing the backend type, per
// this codebase's frontend/backend type-boundary convention (see
// types.ts's header comment).
export type AtlasStatusBucket = 'To Do' | 'In Progress' | 'Done'

// Mirrors the winning dashboard prototype's STATUS_BADGE (branch
// prototype/atlas-dashboard-ui-variants, mockData.ts) - same color families
// as the app's existing status/priority badges elsewhere (docs/
// ui-conventions.md).
export const STATUS_BADGE: Record<AtlasStatusBucket, string> = {
  'To Do': 'bg-slate-100 text-slate-600 dark:bg-slate-500/20 dark:text-slate-300',
  'In Progress': 'bg-fuchsia-100 text-fuchsia-700 dark:bg-fuchsia-500/20 dark:text-fuchsia-300',
  Done: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-300',
}

// Rose family, reserved app-wide for "at risk"/destructive-adjacent meaning
// (docs/ui-conventions.md's semantic-colors section) - not part of
// STATUS_BADGE since at-risk is an orthogonal flag, not a fourth status.
export const AT_RISK_BADGE = 'bg-rose-100 text-rose-700 dark:bg-rose-500/20 dark:text-rose-300'

// Recursive flatten - depth hard-floors at one nested level server-side
// (services/atlasSync.ts), but this walks however deep it's handed so it
// never has to assume that ceiling.
export function flattenTasks(tasks: AtlasTaskNode[]): AtlasTaskNode[] {
  return tasks.flatMap((task) => [task, ...flattenTasks(task.subtasks)])
}

export interface AtlasLeafTask {
  taskId: string
  jiraKey: string
  title: string
  jiraUrl: string
  status: AtlasStatusBucket
  assigneeAccountId: string | null
  epicKey: string
  epicTitle: string
}

// A "leaf" is a task/sub-task with zero non-archived children - the Task
// Board's unit of display (AtlasTaskBoard.tsx, folded in from the winning
// variant of branch prototype/atlas-assignee-filters: assignees only make
// sense on the work item actually being done, not on a container). A task
// WITH visible sub-tasks is skipped as its own row; its children are walked
// instead, so only ever-bottom-of-tree items come out. Epics are never
// included at all. Caller decides which epics to pass (AtlasTaskBoard.tsx is
// only ever given the active list, mirroring AtlasView's own `active` split)
// - unlike flattenTasks/epicStats above, this doesn't re-check epic.archived
// itself.
export function collectLeafTasks(epics: Pick<AtlasEpic, 'jiraKey' | 'title' | 'tasks'>[]): AtlasLeafTask[] {
  const leaves: AtlasLeafTask[] = []
  for (const epic of epics) {
    const walk = (task: AtlasTaskNode) => {
      if (task.archived) return
      const visibleSubtasks = task.subtasks.filter((s) => !s.archived)
      if (visibleSubtasks.length === 0) {
        leaves.push({
          taskId: getId(task) ?? task.jiraKey,
          jiraKey: task.jiraKey,
          title: task.title,
          jiraUrl: task.jiraUrl,
          status: task.status,
          assigneeAccountId: task.assigneeAccountId,
          epicKey: epic.jiraKey,
          epicTitle: epic.title,
        })
        return
      }
      visibleSubtasks.forEach(walk)
    }
    epic.tasks.filter((t) => !t.archived).forEach(walk)
  }
  return leaves
}

export interface AtlasEpicStats {
  total: number
  todo: number
  inProgress: number
  done: number
  atRisk: number
  // 0 when the epic has no tasks yet - avoids a NaN from a 0/0 divide.
  progressPct: number
  startDate: string | null
  endDate: string | null
}

// Status-bucket counts, at-risk count, done%, and min-start/max-end across
// every task and sub-task in the epic (spec §6's epic overview row).
// `atRisk` reads the already-computed AtlasTask.atRisk flag as-is (the
// auto-risk rule itself - spec §5.1 - is computed/overridden server-side by
// ticket 09, out of scope here).
export function epicStats(epic: Pick<AtlasEpic, 'tasks'>): AtlasEpicStats {
  const flat = flattenTasks(epic.tasks)
  const starts = flat.map((t) => t.startDate).filter((d): d is string => Boolean(d))
  const ends = flat.map((t) => t.endDate).filter((d): d is string => Boolean(d))
  return {
    total: flat.length,
    todo: flat.filter((t) => t.status === 'To Do').length,
    inProgress: flat.filter((t) => t.status === 'In Progress').length,
    done: flat.filter((t) => t.status === 'Done').length,
    atRisk: flat.filter((t) => t.atRisk).length,
    progressPct: flat.length === 0 ? 0 : Math.round((flat.filter((t) => t.status === 'Done').length / flat.length) * 100),
    startDate: starts.length ? starts.reduce((a, b) => (a < b ? a : b)) : null,
    endDate: ends.length ? ends.reduce((a, b) => (a > b ? a : b)) : null,
  }
}

// 'YYYY-MM-DD' (Todo.dueDate's convention, reused here) -> "Mon D" for
// display; blank/partial/no-date cases per the prototype's formatDateRange.
export function formatDateRange(start: string | null | undefined, end: string | null | undefined): string {
  if (!start && !end) return 'No dates set'
  const fmt = (d: string) => new Date(d).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
  if (start && end) return `${fmt(start)} – ${fmt(end)}`
  return start ? `From ${fmt(start)}` : `Until ${fmt(end!)}`
}

// Display-only health grouping for the Present view's program strip/detail
// pane (ticket 11, spec §7) - derived from at-risk count, never a stored
// field. Matches the winning prototype's epicHealth (branch prototype/
// atlas-present-ui-variants, VariantD.tsx/mockData.ts): 0 at-risk tasks is
// on-track, exactly 1 is a lighter "watch" warning, 2+ escalates to at-risk.
export type EpicHealth = 'on-track' | 'watch' | 'at-risk'

export function epicHealth(stats: Pick<AtlasEpicStats, 'atRisk'>): EpicHealth {
  if (stats.atRisk === 0) return 'on-track'
  if (stats.atRisk === 1) return 'watch'
  return 'at-risk'
}

export const HEALTH_LABEL: Record<EpicHealth, string> = {
  'on-track': 'On track',
  watch: 'Watch',
  'at-risk': 'At risk',
}

// Emerald/amber/rose per spec §7 - the SVG progress ring's stroke color on
// the Present view's program strip.
export const HEALTH_RING: Record<EpicHealth, string> = {
  'on-track': 'stroke-emerald-500 dark:stroke-emerald-400',
  watch: 'stroke-amber-500 dark:stroke-amber-400',
  'at-risk': 'stroke-rose-500 dark:stroke-rose-400',
}

// Same three-color family as HEALTH_RING, as a border/bg tint for the
// detail pane's whole panel background (spec §7's "panel background tinted
// by the epic's health color").
export const HEALTH_TILE: Record<EpicHealth, string> = {
  'on-track': 'border-emerald-300 bg-emerald-50 dark:border-emerald-500/30 dark:bg-emerald-500/10',
  watch: 'border-amber-300 bg-amber-50 dark:border-amber-500/30 dark:bg-amber-500/10',
  'at-risk': 'border-rose-300 bg-rose-50 dark:border-rose-500/30 dark:bg-rose-500/10',
}

// The Present view's "needs attention" digest (ticket 11, spec §7) - a task
// worth narrating in a standup: either already at-risk, or blocked on
// something that isn't Done yet. Excludes archived (soft-deleted-from-Jira)
// tasks, same as the Dashboard's own drill-down filters them out of view
// (AtlasView.tsx's `visibleTasks`) - a resync-deleted task has nothing left
// to say out loud. At-risk takes priority over blocked when a task is both
// (matches the winning prototype's attentionItems, branch prototype/
// atlas-present-ui-variants/mockData.ts).
export interface AttentionItem {
  task: AtlasTaskNode
  reason: 'at-risk' | 'blocked'
}

export function attentionItems(epic: Pick<AtlasEpic, 'tasks'>): AttentionItem[] {
  const items: AttentionItem[] = []
  for (const task of flattenTasks(epic.tasks)) {
    if (task.archived) continue
    if (task.atRisk) items.push({ task, reason: 'at-risk' })
    else if (task.blockedBy.length > 0 && task.status !== 'Done') items.push({ task, reason: 'blocked' })
  }
  return items
}

export interface BlockedByRef {
  taskId: string
  jiraKey: string
  epicId: string
  epicKey: string
}

// GET /api/atlas/epics returns AtlasTask.blockedBy as bare ObjectId strings
// (no server-side populate - routes/atlasEpics.ts), so a "Blocked by" chip
// resolves each id against this lookup, built once from every tracked
// epic's already-fetched tree. blockedBy can point at a task in *any* epic
// (spec §5.2), so the lookup is built across the whole `epics` list, not
// just the blocker's own epic.
export function buildBlockedByLookup(epics: AtlasEpic[]): Map<string, BlockedByRef> {
  const lookup = new Map<string, BlockedByRef>()
  for (const epic of epics) {
    const epicId = getId(epic)
    if (!epicId) continue
    for (const task of flattenTasks(epic.tasks)) {
      const taskId = getId(task)
      if (!taskId) continue
      lookup.set(taskId, { taskId, jiraKey: task.jiraKey, epicId, epicKey: epic.jiraKey })
    }
  }
  return lookup
}

export interface BlockedByCandidate extends BlockedByRef {
  title: string
}

// Search universe for the "blocked by" picker (ticket 09; spec §5.2's link
// can point at "any task in any epic, not scoped to the same epic"). Unlike
// buildBlockedByLookup above (which resolves *existing* links for display,
// deliberately including archived epics/tasks so an old link never shows as
// broken), this is narrower - only non-archived tasks in non-archived
// epics - per spec §6's picker copy: "a picker searching across all
// tracked, non-archived tasks". An already-linked blocker that happens to
// sit in an archived epic still renders fine via the lookup; it just isn't
// offered again through this picker.
export function buildBlockedByCandidates(epics: AtlasEpic[]): BlockedByCandidate[] {
  const candidates: BlockedByCandidate[] = []
  for (const epic of epics) {
    if (epic.archived) continue
    const epicId = getId(epic)
    if (!epicId) continue
    for (const task of flattenTasks(epic.tasks)) {
      if (task.archived) continue
      const taskId = getId(task)
      if (!taskId) continue
      candidates.push({ taskId, jiraKey: task.jiraKey, title: task.title, epicId, epicKey: epic.jiraKey })
    }
  }
  return candidates
}
