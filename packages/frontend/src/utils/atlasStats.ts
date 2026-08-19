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
