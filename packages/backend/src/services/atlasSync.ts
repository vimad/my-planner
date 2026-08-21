import type { Types } from 'mongoose'
import { bulkFetchIssues, issueUrl, searchJql, type JiraIssue } from './jiraClient.ts'
import { AtlasEpic, type AtlasEpicDoc } from '../models/AtlasEpic.ts'
import { AtlasTask, type AtlasTaskDoc, type AtlasTaskStatus } from '../models/AtlasTask.ts'

// Fields requested off the epic issue itself — just enough to validate it
// really is an Epic and to populate AtlasEpic's Jira-sourced fields (spec §2).
const EPIC_FIELDS = ['summary', 'issuetype']
// Fields requested off every task/sub-task issue — summary/status/assignee
// populate AtlasTask's Jira-sourced fields; subtasks is read to discover the
// next hierarchy level down (never fetched for its own sake).
const TASK_FIELDS = ['summary', 'status', 'assignee', 'subtasks']
// Fields requested for ticket 10's "missing task" reconciliation check
// (reconcileMissingTasks below) — `parent` is the only field that check
// actually reads, to tell a genuine Jira-side delete (issue absent from the
// bulk-fetch result entirely) apart from a reparent (issue still resolves,
// just under a different immediate parent than before).
const MISSING_TASK_CHECK_FIELDS = ['parent']

export class EpicNotFoundError extends Error {}
export class NotAnEpicError extends Error {}
// Thrown when directly-tracking a ticket (trackAndSyncStandaloneTask) would
// silently rip it out of where it already lives — either a real epic's task
// tree, or another standalone ticket's sub-task list — rather than folding
// it into "Outside the program". Jira-side reparents are still allowed to
// move a task freely (reconcileMissingTasks below); this only guards a
// *manual* duplicate "Track" submission.
export class TicketAlreadyTrackedError extends Error {}

// Sentinel jiraKey for the single synthetic "Outside the program" epic
// (models/AtlasEpic.ts's isOutsideProgram) — deliberately not a shape any
// real Jira key can take (real keys are `<PROJECT>-<number>`), so it can
// never collide with one.
export const OUTSIDE_PROGRAM_KEY = '__outside-program__'

interface JiraStatusRef {
  statusCategory?: { key?: string }
}

interface JiraUserRef {
  accountId?: string
}

interface JiraSubtaskRef {
  key: string
}

interface JiraIssueTypeRef {
  name?: string
}

interface JiraParentRef {
  key?: string
}

// Collapses Jira's real workflow status down to Atlas's three buckets, per
// fields.status.statusCategory.key ('new'/'indeterminate'/'done' — spec §2,
// §3). Falls back to "To Do" for a missing/unrecognized category rather than
// throwing — a sync should never hard-fail over an unexpected status shape.
export function mapStatusCategory(fields: Record<string, unknown>): AtlasTaskStatus {
  const status = fields.status as JiraStatusRef | undefined
  const key = status?.statusCategory?.key
  if (key === 'done') return 'Done'
  if (key === 'indeterminate') return 'In Progress'
  return 'To Do'
}

export interface AtlasTaskNode {
  _id: unknown
  parentTaskId: unknown
  jiraKey: string
  subtasks: AtlasTaskNode[]
  [key: string]: unknown
}

// Turns a flat list of AtlasTask docs (plain objects, e.g. from
// `.toObject()`) into a nested tree by parentTaskId — pure, no I/O, so it's
// reused as-is by both trackAndSyncEpic's return value and the GET /api/
// atlas/epics route's list response. A task whose parentTaskId points at
// nothing in the given list (shouldn't normally happen) is treated as a
// root rather than silently dropped.
export function buildTaskTree<T extends { _id: unknown; parentTaskId: unknown }>(
  tasks: T[],
): (T & { subtasks: AtlasTaskNode[] })[] {
  const byId = new Map<string, T & { subtasks: AtlasTaskNode[] }>()
  for (const task of tasks) {
    byId.set(String(task._id), { ...task, subtasks: [] })
  }

  const roots: (T & { subtasks: AtlasTaskNode[] })[] = []
  for (const node of byId.values()) {
    if (node.parentTaskId) {
      const parent = byId.get(String(node.parentTaskId))
      if (parent) {
        parent.subtasks.push(node as unknown as AtlasTaskNode)
        continue
      }
    }
    roots.push(node)
  }
  return roots
}

function issueTitle(issue: JiraIssue): string {
  return typeof issue.fields.summary === 'string' ? issue.fields.summary : ''
}

// Upserts one AtlasTask doc for a synced issue. Only ever $set's
// Jira-sourced fields (epicId/parentTaskId/title/jiraUrl/assigneeAccountId/
// status) — startDate/endDate/atRisk/atRiskOverride/notes/notesText/
// blockedBy/archived are Atlas-local (spec §2) and are left to
// $setOnInsert defaults so a resync never clobbers a manual edit made in
// ticket 09/10's UI. Setting epicId/parentTaskId from the *current* fetch on
// every sync is also what implements the "Jira-side reparent just moves the
// task" rule (spec §4.6) for free — no separate reparent-detection code
// needed.
//
// atRisk/atRiskOverride specifically: leaving both to $setOnInsert (never
// touched on an existing doc) is what lets a manual at-risk override
// survive forever across resyncs (spec §5.1) — see utils/atlasRisk.ts's
// resolveAtRisk for how the *effective* value is actually computed at read
// time from these two fields.
async function upsertAtlasTask(
  issue: JiraIssue,
  epicId: unknown,
  parentTaskId: unknown,
): Promise<AtlasTaskDoc & { _id: unknown }> {
  const assignee = issue.fields.assignee as JiraUserRef | null | undefined
  const doc = await AtlasTask.findOneAndUpdate(
    { jiraKey: issue.key },
    {
      $set: {
        epicId,
        parentTaskId,
        title: issueTitle(issue),
        jiraUrl: issueUrl(issue.key),
        assigneeAccountId: assignee?.accountId ?? null,
        status: mapStatusCategory(issue.fields),
      },
      $setOnInsert: {
        jiraKey: issue.key,
        startDate: null,
        endDate: null,
        atRisk: false,
        atRiskOverride: false,
        notes: null,
        notesText: '',
        blockedBy: [],
        archived: false,
      },
    },
    { upsert: true, returnDocument: 'after' },
  )
  return doc as unknown as AtlasTaskDoc & { _id: unknown }
}

export interface TrackAndSyncResult {
  epic: AtlasEpicDoc & { _id: unknown }
  tasks: (AtlasTaskDoc & { _id: unknown })[]
}

// Ticket 10's resync diffing (spec §4.5/§4.6, ticket 03's Q4): after a fresh
// sync has upserted every task/sub-task Jira still returns for this scope,
// anything previously tracked within `scope` that *wasn't* touched by this
// round is either genuinely gone from Jira or has been reparented away from
// it. `scope` is `{ epicId }` for an epic sync (trackAndSyncEpic) or
// `{ parentTaskId }` for a standalone ticket's own sub-tasks
// (trackAndSyncStandaloneTask) — either way it's the exact filter that
// previously produced this round's "previously tracked" set. `seenJiraKeys`
// is every jiraKey this sync round just upserted (level-0 + level-1) — a doc
// whose jiraKey isn't in that set is the input to this reconciliation pass.
//
// A single extra bulkFetchIssues call (requesting only `fields.parent`)
// tells the two cases apart in one round-trip:
//   - the key comes back in `issueErrors` (or simply isn't in `issues`) ->
//     the Jira issue itself is gone -> archive (soft-delete), every other
//     field left exactly as it was (notes/dates/atRisk/blockedBy).
//   - the key resolves, with a `fields.parent.key` that Atlas can resolve to
//     one of its *own* tracked records (another AtlasEpic, for a top-level
//     task; or another AtlasTask, for a sub-task) -> reparented -> move
//     epicId/parentTaskId to match, again touching nothing else.
//   - the key resolves, but its new parent isn't anything Atlas tracks (a
//     project/epic Atlas was never told about) -> there's nowhere valid
//     within Atlas's own collections to point epicId at, so this falls back
//     to archiving too, rather than leaving a dangling/incorrect epicId on
//     an orphaned doc. Same soft-delete outcome as a real delete, just a
//     different root cause.
async function reconcileMissingTasks(
  scope: { epicId: Types.ObjectId } | { parentTaskId: Types.ObjectId },
  seenJiraKeys: Set<string>,
): Promise<void> {
  const previouslyTracked = await AtlasTask.find({ ...scope, archived: false })
  const missing = previouslyTracked.filter((task) => !seenJiraKeys.has(task.jiraKey))
  if (missing.length === 0) return

  const { issues } = await bulkFetchIssues(
    missing.map((task) => task.jiraKey),
    MISSING_TASK_CHECK_FIELDS,
  )
  const foundByKey = new Map(issues.map((found) => [found.key, found]))

  for (const task of missing) {
    const found = foundByKey.get(task.jiraKey)
    if (!found) {
      await AtlasTask.updateOne({ _id: task._id }, { $set: { archived: true } })
      continue
    }

    const parentKey = (found.fields.parent as JiraParentRef | undefined)?.key
    const newEpic = parentKey ? await AtlasEpic.findOne({ jiraKey: parentKey }) : null
    if (newEpic) {
      await AtlasTask.updateOne({ _id: task._id }, { $set: { epicId: newEpic._id, parentTaskId: null } })
      continue
    }

    const newParentTask = parentKey ? await AtlasTask.findOne({ jiraKey: parentKey }) : null
    if (newParentTask) {
      await AtlasTask.updateOne(
        { _id: task._id },
        { $set: { epicId: newParentTask.epicId, parentTaskId: newParentTask._id } },
      )
      continue
    }

    await AtlasTask.updateOne({ _id: task._id }, { $set: { archived: true } })
  }
}

// The ticket-07 sync: entering an epic key resolves it against Jira and, if
// it's a real Epic, recursively pulls its full task/sub-task tree — Epic ->
// Task (JQL `parent = "<epicKey>"`) -> Sub-task (bulk-fetched off each
// level-0 task's own fields.subtasks refs), mirroring ticketSync.ts's
// fullSyncTickets two-round-trip pattern. Depth hard-floors here: a
// level-1 issue's own fields.subtasks is never followed (Jira's hierarchy
// never goes deeper than Sub-task — research/jira-epic-sync-mechanics.md §2).
//
// JQL shape: this worktree has no packages/backend/.env (gitignored,
// per-checkout) so the one-shot `parentEpic = <epicKey>` query could not be
// live-verified against a real epic during this ticket's implementation —
// see the note left on the ticket file. This function commits to the
// two-step `parent =` approach instead, which is what's implemented below
// and exactly mirrors ticketSync.ts's already-live-tested subtask-following
// pattern.
//
// Throws EpicNotFoundError / NotAnEpicError *before* touching Mongo at all
// on a bad key (spec §4.3: "nothing is saved") — no partial AtlasEpic/
// AtlasTask writes on a rejected key.
export async function trackAndSyncEpic(jiraKey: string): Promise<TrackAndSyncResult> {
  const epicResult = await bulkFetchIssues([jiraKey], EPIC_FIELDS)
  const epicIssue = epicResult.issues[0]
  if (!epicIssue) {
    throw new EpicNotFoundError(`Jira issue ${jiraKey} was not found`)
  }
  const issuetype = epicIssue.fields.issuetype as JiraIssueTypeRef | undefined
  if (issuetype?.name !== 'Epic') {
    throw new NotAnEpicError(`${jiraKey} is a ${issuetype?.name ?? 'unknown-type'} issue, not an Epic`)
  }

  const syncedAt = new Date()
  const epicDoc = await AtlasEpic.findOneAndUpdate(
    { jiraKey },
    {
      $set: {
        title: issueTitle(epicIssue),
        jiraUrl: issueUrl(jiraKey),
        lastSyncedAt: syncedAt,
      },
      $setOnInsert: { jiraKey, notes: null, notesText: '', archived: false },
    },
    { upsert: true, returnDocument: 'after' },
  )
  const epic = epicDoc as unknown as AtlasEpicDoc & { _id: unknown }

  const level0Issues = await searchJql(`parent = "${jiraKey}"`, TASK_FIELDS)

  const subtaskToParentKey = new Map<string, string>()
  for (const level0Issue of level0Issues) {
    const subtasks = (level0Issue.fields.subtasks as JiraSubtaskRef[] | undefined) ?? []
    for (const subtask of subtasks) {
      subtaskToParentKey.set(subtask.key, level0Issue.key)
    }
  }

  const level1Result =
    subtaskToParentKey.size > 0
      ? await bulkFetchIssues([...subtaskToParentKey.keys()], TASK_FIELDS)
      : { issues: [], issueErrors: [] }

  const level0Docs = new Map<string, AtlasTaskDoc & { _id: unknown }>()
  for (const level0Issue of level0Issues) {
    const doc = await upsertAtlasTask(level0Issue, epic._id, null)
    level0Docs.set(level0Issue.key, doc)
  }

  const level1Docs: (AtlasTaskDoc & { _id: unknown })[] = []
  for (const level1Issue of level1Result.issues) {
    // Depth hard-floor sanity check (research doc §2): a fetched sub-task
    // unexpectedly carrying its own non-empty subtasks would mean Jira went
    // a level deeper than this sync ever walks — surfaced as a warning, not
    // a crash, since there's nothing further down to follow regardless.
    const nestedSubtasks = (level1Issue.fields.subtasks as JiraSubtaskRef[] | undefined) ?? []
    if (nestedSubtasks.length > 0) {
      console.warn(
        `atlasSync: ${level1Issue.key} (expected to be a leaf sub-task) itself has sub-tasks — Atlas never walks past this depth`,
      )
    }

    const parentKey = subtaskToParentKey.get(level1Issue.key)
    const parentDoc = parentKey ? level0Docs.get(parentKey) : undefined
    const doc = await upsertAtlasTask(level1Issue, epic._id, parentDoc?._id ?? null)
    level1Docs.push(doc)
  }

  // Ticket 10: on every sync (initial or a later "Sync now" resync alike),
  // reconcile anything previously tracked under this epic that this round's
  // fetch didn't touch at all — see reconcileMissingTasks' own comment for
  // the delete-vs-reparent distinction. A no-op on a brand-new epic's first
  // sync, since AtlasTask.find({ epicId: epic._id, ... }) has nothing to
  // return yet.
  const seenJiraKeys = new Set([...level0Docs.keys(), ...level1Docs.map((doc) => doc.jiraKey)])
  await reconcileMissingTasks({ epicId: epic._id as Types.ObjectId }, seenJiraKeys)

  return { epic, tasks: [...level0Docs.values(), ...level1Docs] }
}

// The synthetic "Outside the program" epic that owns every directly-tracked
// non-Epic ticket (models/AtlasEpic.ts's isOutsideProgram) — a singleton,
// found-or-created idempotently by its sentinel jiraKey. Its title is kept
// in sync on every call ($set) in case it's ever edited; jiraUrl/notes stay
// $setOnInsert-only, same convention as a real epic's local-only fields.
export async function getOrCreateOutsideProgramEpic(): Promise<AtlasEpicDoc & { _id: unknown }> {
  const doc = await AtlasEpic.findOneAndUpdate(
    { jiraKey: OUTSIDE_PROGRAM_KEY },
    {
      $set: { title: 'Outside the program', isOutsideProgram: true },
      $setOnInsert: {
        jiraKey: OUTSIDE_PROGRAM_KEY,
        jiraUrl: '',
        notes: null,
        notesText: '',
        archived: false,
        lastSyncedAt: new Date(),
      },
    },
    { upsert: true, returnDocument: 'after' },
  )
  return doc as unknown as AtlasEpicDoc & { _id: unknown }
}

// Directly-tracking any non-Epic ticket (Task/Story/Bug — the "add any
// ticket" half of trackAndSyncTicket below): pulls just that one issue plus
// one level of its own Jira sub-tasks (same Task -> Sub-task depth floor as
// trackAndSyncEpic), and files them under the shared "Outside the program"
// epic instead of a real one. Reused as-is for a later resync (this
// codebase's "Sync now" for the whole Outside-the-program card, and the
// global "Sync all") - the whole function is upsert-based, so calling it
// again on an already-tracked key is a no-op resync, not a duplicate.
//
// Guards against a manual duplicate "Track" silently reparenting a ticket
// that's already tracked somewhere else (a real epic's task tree, or another
// standalone ticket's sub-task list) into Outside-the-program - that kind of
// move only ever happens as a *Jira-side* reparent, detected and applied by
// reconcileMissingTasks, never from this direct-track entry point.
export async function trackAndSyncStandaloneTask(jiraKey: string): Promise<TrackAndSyncResult> {
  const result = await bulkFetchIssues([jiraKey], TASK_FIELDS)
  const issue = result.issues[0]
  if (!issue) {
    throw new EpicNotFoundError(`Jira issue ${jiraKey} was not found`)
  }

  const outsideEpic = await getOrCreateOutsideProgramEpic()

  const existing = await AtlasTask.findOne({ jiraKey })
  if (existing) {
    const belongsElsewhere = String(existing.epicId) !== String(outsideEpic._id)
    const isAlreadyASubtask = existing.parentTaskId !== null
    if (belongsElsewhere) {
      const owningEpic = await AtlasEpic.findOne({ _id: existing.epicId })
      throw new TicketAlreadyTrackedError(
        `${jiraKey} is already tracked under epic ${owningEpic?.jiraKey ?? 'unknown'} - untrack it there first`,
      )
    }
    if (isAlreadyASubtask) {
      throw new TicketAlreadyTrackedError(`${jiraKey} is already tracked as a sub-task of another ticket`)
    }
  }

  const rootDoc = await upsertAtlasTask(issue, outsideEpic._id, null)

  const subtasks = (issue.fields.subtasks as JiraSubtaskRef[] | undefined) ?? []
  const subtaskResult = subtasks.length > 0 ? await bulkFetchIssues(subtasks.map((s) => s.key), TASK_FIELDS) : { issues: [], issueErrors: [] }

  const childDocs: (AtlasTaskDoc & { _id: unknown })[] = []
  for (const childIssue of subtaskResult.issues) {
    const nestedSubtasks = (childIssue.fields.subtasks as JiraSubtaskRef[] | undefined) ?? []
    if (nestedSubtasks.length > 0) {
      console.warn(
        `atlasSync: ${childIssue.key} (expected to be a leaf sub-task) itself has sub-tasks — Atlas never walks past this depth`,
      )
    }
    const doc = await upsertAtlasTask(childIssue, outsideEpic._id, rootDoc._id)
    childDocs.push(doc)
  }

  const seenJiraKeys = new Set([rootDoc.jiraKey, ...childDocs.map((doc) => doc.jiraKey)])
  await reconcileMissingTasks({ parentTaskId: rootDoc._id as Types.ObjectId }, seenJiraKeys)

  return { epic: outsideEpic, tasks: [rootDoc, ...childDocs] }
}

// The "Track" form's real entry point: resolves the key against Jira once to
// find out what it is, then branches - an Epic gets the full recursive
// epic-tree sync (trackAndSyncEpic); anything else (Task/Story/Bug/...) gets
// filed under "Outside the program" (trackAndSyncStandaloneTask). Each
// branch re-fetches the issue itself rather than threading the one fetched
// here through - a little redundant, but keeps trackAndSyncEpic's own
// well-tested fetch-then-validate gate untouched and independently correct.
export async function trackAndSyncTicket(jiraKey: string): Promise<TrackAndSyncResult> {
  const result = await bulkFetchIssues([jiraKey], ['issuetype'])
  const issue = result.issues[0]
  if (!issue) {
    throw new EpicNotFoundError(`Jira issue ${jiraKey} was not found`)
  }

  const issuetype = issue.fields.issuetype as JiraIssueTypeRef | undefined
  if (issuetype?.name === 'Epic') {
    return trackAndSyncEpic(jiraKey)
  }
  return trackAndSyncStandaloneTask(jiraKey)
}
