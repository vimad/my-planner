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

export class EpicNotFoundError extends Error {}
export class NotAnEpicError extends Error {}

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
      $setOnInsert: { jiraKey, notes: '', archived: false },
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

  return { epic, tasks: [...level0Docs.values(), ...level1Docs] }
}
