import type { HydratedDocument } from 'mongoose'
import { bulkFetchIssues, searchJql, type JiraIssue } from './jiraClient.ts'
import { Epic, type EpicDoc } from '../models/Epic.ts'
import { Ticket, type TicketDoc } from '../models/Ticket.ts'

// "Stream" custom field id — resolved once via `field/search?query=Stream`
// and recorded in packages/backend/README.md ("Recorded results"). Per the
// spec, an id like this is stable until an admin deletes/recreates the
// field, so it's hardcoded rather than re-resolved on every sync.
const STREAM_FIELD_ID = 'customfield_10240'

// "Sprint" custom field id — Jira Software's built-in Greenhopper sprint
// field, confirmed live against wealthos.atlassian.net (`field/search?query=Sprint`)
// during this ticket's implementation.
const SPRINT_FIELD_ID = 'customfield_10020'

interface JiraUserRef {
  accountId?: string
  displayName?: string
  emailAddress?: string | null
}

interface JiraStatusRef {
  name?: string
}

interface JiraIssueTypeRef {
  name?: string
  subtask?: boolean
}

interface JiraParentRef {
  key?: string
  fields?: { issuetype?: JiraIssueTypeRef }
}

interface JiraSprintFieldEntry {
  id: number
  state?: string
}

interface JiraOptionField {
  value?: string
}

interface JiraSubtaskRef {
  key: string
}

// Parses the "[Dev]"/"[Test]" title prefix convention (see CONTEXT.md
// "Sub-task kind") — confirmed live against real WOSMVP sub-tasks (e.g.
// "[Dev]Beneficiary leaver inclusion in FPS").
function parseSubtaskKind(title: string): 'Dev' | 'Test' | null {
  if (title.startsWith('[Dev]')) return 'Dev'
  if (title.startsWith('[Test]')) return 'Test'
  return null
}

function secondsToHours(seconds: unknown): number | null {
  return typeof seconds === 'number' ? seconds / 3600 : null
}

// Maps a raw bulkfetch JiraIssue onto our cached Ticket shape. epicKey vs.
// parentKey is distinguished by the referenced parent's own issue type: a
// sub-task's parent is a Story/Bug/Task, an epic-child's parent is an Epic —
// confirmed live (WOSMVP-15059's parent carries
// fields.issuetype.name === "Story", WOSMVP-15058's carries "Epic").
export function mapIssueToTicketFields(issue: JiraIssue, syncedAt: Date): TicketDoc {
  const fields = issue.fields
  const assignee = fields.assignee as JiraUserRef | null | undefined
  const status = fields.status as JiraStatusRef | undefined
  const issuetype = fields.issuetype as JiraIssueTypeRef | undefined
  const parent = fields.parent as JiraParentRef | null | undefined
  const title = typeof fields.summary === 'string' ? fields.summary : ''
  const isEpicParent = parent?.fields?.issuetype?.name === 'Epic'
  const sprintEntries = (fields[SPRINT_FIELD_ID] as JiraSprintFieldEntry[] | null | undefined) ?? []
  // Array position isn't a reliable way to find the current sprint — a
  // ticket split across multiple sprints can have its active entry anywhere
  // in the array, not just last (confirmed live: a ticket whose active
  // sprint was NOT the final entry, causing it to go missing from Status —
  // see ADR 0002 follow-up). `state === 'active'` is Jira's own signal for
  // "this is the sprint it's in right now"; fall back to the last entry only
  // when nothing is active (e.g. a ticket that only ever carries closed
  // sprints).
  const currentSprint = sprintEntries.find((entry) => entry.state === 'active') ?? sprintEntries[sprintEntries.length - 1] ?? null
  const streamField = fields[STREAM_FIELD_ID] as JiraOptionField | null | undefined

  return {
    jiraKey: issue.key,
    type: issuetype?.name ?? '',
    title,
    status: status?.name ?? '',
    assigneeAccountId: assignee?.accountId ?? null,
    assigneeDisplayName: assignee?.displayName ?? null,
    assigneeEmail: assignee?.emailAddress ?? null,
    estimateHours: secondsToHours(fields.timeoriginalestimate),
    labels: Array.isArray(fields.labels) ? (fields.labels as string[]) : [],
    stream: streamField?.value ?? null,
    epicKey: parent && isEpicParent ? (parent.key ?? null) : null,
    parentKey: parent && !isEpicParent ? (parent.key ?? null) : null,
    subtaskKind: parseSubtaskKind(title),
    currentSprintKey: currentSprint ? String(currentSprint.id) : null,
    lastSyncedAt: syncedAt,
  }
}

export interface SyncedTicket {
  ticket: HydratedDocument<TicketDoc>
  previousAssigneeAccountId: string | null
  isNew: boolean
}

// Maps a raw bulkfetch JiraIssue (the epic issue itself, not one of its
// children) onto our cached Epic shape - mirrors mapIssueToTicketFields'
// title/status extraction exactly. Child-ticket rollup is never part of
// this (see models/Epic.ts).
function mapIssueToEpicFields(issue: JiraIssue, syncedAt: Date): EpicDoc {
  const fields = issue.fields
  const status = fields.status as JiraStatusRef | undefined
  const title = typeof fields.summary === 'string' ? fields.summary : ''
  return {
    jiraKey: issue.key,
    title,
    status: status?.name ?? '',
    lastSyncedAt: syncedAt,
  }
}

// Full sync (spec's "Sync semantics & staleness"): bulk-fetches the given
// tickets, follows each one's `subtasks` refs, and bulk-fetches those too —
// two Jira round-trips within this one sync action (bulkFetchIssues itself
// chunks each round-trip at 100 keys/call). Upserts a Ticket doc per issue
// and reports each one's previous assignee, so callers can detect
// reassignment (see routes/sprintPlanEntries.ts).
//
// Also follows each synced issue's epic (spec's "single-ticket entry:
// fetches and caches that one ticket (+ its sub-tasks, epic if any)") and
// upserts an Epic doc for it - the epics pill strip's GET /api/epics
// (ticket 13/20) reads Epic docs written only here, nowhere else populates
// that collection.
export async function fullSyncTickets(jiraKeys: string[]): Promise<SyncedTicket[]> {
  if (jiraKeys.length === 0) return []

  const syncedAt = new Date()
  const primaryResult = await bulkFetchIssues(jiraKeys)

  const subtaskKeys = new Set<string>()
  for (const issue of primaryResult.issues) {
    const subtasks = issue.fields.subtasks as JiraSubtaskRef[] | undefined
    for (const subtask of subtasks ?? []) {
      subtaskKeys.add(subtask.key)
    }
  }
  const subtaskResult = subtaskKeys.size > 0 ? await bulkFetchIssues([...subtaskKeys]) : { issues: [], issueErrors: [] }

  const allIssues = [...primaryResult.issues, ...subtaskResult.issues]
  const synced: SyncedTicket[] = []
  const epicKeys = new Set<string>()
  for (const issue of allIssues) {
    const existing = await Ticket.findOne({ jiraKey: issue.key })
    const fieldsToSet = mapIssueToTicketFields(issue, syncedAt)
    if (fieldsToSet.epicKey) epicKeys.add(fieldsToSet.epicKey)
    const ticket = await Ticket.findOneAndUpdate({ jiraKey: issue.key }, fieldsToSet, {
      upsert: true,
      returnDocument: 'after',
    })
    synced.push({
      ticket: ticket as HydratedDocument<TicketDoc>,
      previousAssigneeAccountId: existing?.assigneeAccountId ?? null,
      isNew: !existing,
    })
  }

  if (epicKeys.size > 0) {
    const epicResult = await bulkFetchIssues([...epicKeys])
    for (const issue of epicResult.issues) {
      await Epic.findOneAndUpdate({ jiraKey: issue.key }, mapIssueToEpicFields(issue, syncedAt), {
        upsert: true,
        returnDocument: 'after',
      })
    }
  }

  return synced
}

const LIGHTWEIGHT_FIELDS = ['summary', 'status']

// Lightweight sync (spec's "Sync semantics & staleness"): the Status view's
// per-person sync icon fetches only title + status via search/jql and
// upserts a Ticket doc touching only title/status/lastSyncedAt. Every other
// field is left exactly as-is on an already-Full-synced ticket, or
// defaulted (null, [] for labels) the first time this jiraKey is ever seen —
// rendered with a muted "?" type badge until some Full sync (e.g. via
// Planning) fills it in.
export async function lightweightSyncTickets(jql: string): Promise<HydratedDocument<TicketDoc>[]> {
  const issues = await searchJql(jql, LIGHTWEIGHT_FIELDS)
  const syncedAt = new Date()

  const tickets: HydratedDocument<TicketDoc>[] = []
  for (const issue of issues) {
    const status = issue.fields.status as { name?: string } | undefined
    const title = typeof issue.fields.summary === 'string' ? issue.fields.summary : ''

    const ticket = await Ticket.findOneAndUpdate(
      { jiraKey: issue.key },
      {
        $set: { title, status: status?.name ?? '', lastSyncedAt: syncedAt },
        $setOnInsert: {
          jiraKey: issue.key,
          type: null,
          assigneeAccountId: null,
          assigneeDisplayName: null,
          assigneeEmail: null,
          estimateHours: null,
          labels: [],
          stream: null,
          epicKey: null,
          parentKey: null,
          subtaskKind: null,
          currentSprintKey: null,
        },
      },
      { upsert: true, returnDocument: 'after' },
    )
    tickets.push(ticket as HydratedDocument<TicketDoc>)
  }
  return tickets
}

// Effort (CONTEXT.md): sum of a ticket's sub-tasks' estimateHours (queried
// via parentKey) if any exist, else the ticket's own estimateHours. A
// sub-task with no estimate contributes 0 to the sum rather than making the
// whole total null.
export async function computeEffortHours(ticket: Pick<TicketDoc, 'jiraKey' | 'estimateHours'>): Promise<number | null> {
  const subtasks = await Ticket.find({ parentKey: ticket.jiraKey })
  if (subtasks.length === 0) return ticket.estimateHours
  return subtasks.reduce((sum, subtask) => sum + (subtask.estimateHours ?? 0), 0)
}
