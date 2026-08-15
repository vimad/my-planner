import { bulkFetchIssues, listSprints, resolveBoard, searchJql, type JiraIssue } from './jiraClient.ts'
import { FUTURE_SPRINTS_BOARD_NAME } from './sprintSync.ts'
import { mapIssueToTicketFields } from './ticketSync.ts'
import { isSplitTicket } from './devQaResolution.ts'

// Matches sprintSync.ts's own PROJECT_KEY - every team's backlog lives on
// the same WOSMVP project's Product Delivery Board.
const PROJECT_KEY = 'WOSMVP'

export type BacklogCategory = 'tech-ops' | 'product' | 'bug'

// The three named sprints this endpoint browses, all living on the
// Product Delivery Board alongside the future sprints searchJiraSprints
// already resolves there (spec's "Problem Statement").
const CATEGORY_SPRINT_NAMES: Record<BacklogCategory, string> = {
  'tech-ops': 'Tech and Ops Backlog',
  product: 'Product Backlog',
  bug: 'Bug backlog',
}

export interface BacklogTicket {
  key: string
  title: string
  type: string
  labels: string[]
  dev: { name: string } | null
  qa: { name: string } | null
  assignee: { name: string } | null
}

interface JiraSubtaskRef {
  key: string
}

interface JiraIssueTypeRef {
  subtask?: boolean
  name?: string
}

interface JiraStatusRef {
  name?: string
}

// Fields the Jira search itself needs - just enough for mapIssueToTicketFields
// to derive title/type/labels/assignee, plus the raw Sub-task refs (not part
// of TicketDoc) used below to fetch each Story/Bug's own Sub-tasks, plus
// status for the Done-exclusion backstop below.
const BACKLOG_SEARCH_FIELDS = ['summary', 'issuetype', 'labels', 'assignee', 'subtasks', 'status']

function roleFromSubtask(fields: ReturnType<typeof mapIssueToTicketFields> | undefined): { name: string } | null {
  return fields?.assigneeDisplayName ? { name: fields.assigneeDisplayName } : null
}

// Read-only, uncached browse of one category's named backlog sprint, scoped
// to jiraLabels the same way every other Planning ticket list is scoped
// (routes/statusSync.ts's labels-in JQL clause). Never touches Ticket/
// TicketDevQaOverride/TicketAssigneeOverride or any other collection -
// mapIssueToTicketFields is reused purely for its field-parsing, never for
// its caller's persistence side effect (that lives in ticketSync.ts's own
// fullSyncTickets/lightweightSyncTickets, neither of which is called here).
//
// Returns null when the Product Delivery Board or the category's named
// sprint can't be resolved (mirrors searchJiraSprints' null convention -
// see routes/sprints.ts's 502 on that same signal). An empty jiraLabels
// short-circuits before any Jira call at all: an empty `labels in ()`
// clause is not valid JQL, so this is the one case handled entirely
// client-side rather than sent to Jira and trusted to "match nothing".
export async function searchBacklog(category: BacklogCategory, jiraLabels: string[]): Promise<BacklogTicket[] | null> {
  if (jiraLabels.length === 0) return []

  const board = await resolveBoard(PROJECT_KEY, FUTURE_SPRINTS_BOARD_NAME)
  if (!board) return null

  const sprints = await listSprints(board.id, ['future'])
  const sprint = sprints.find((s) => s.name === CATEGORY_SPRINT_NAMES[category])
  if (!sprint) return null

  const labelClause = jiraLabels.map((label) => `"${label}"`).join(', ')
  // Assignable work is Bug/Story/Task - a Sub-task is only ever surfaced
  // below as a Story/Bug's resolved Dev/QA (via its own bulkFetchIssues
  // lookup), never as its own pickable backlog row. `subtaskIssueTypes()`
  // excludes every sub-task issue type regardless of its configured name,
  // so this holds even for a custom-named sub-task type. Epics are excluded
  // too - a sprint plan assigns individual Story/Bug/Task work, never a
  // whole Epic. A ticket already in Done is excluded as well - it's already
  // completed, so there's nothing left to plan.
  // Rank ASC matches the manual drag-order the board's own Backlog view
  // shows and lets you reorder there - same ordering, not just the same
  // ticket set.
  const jql = `sprint = ${sprint.id} AND labels in (${labelClause}) AND issuetype not in subtaskIssueTypes() AND issuetype != Epic AND status != Done ORDER BY Rank ASC`
  const rawIssues = await searchJql(jql, BACKLOG_SEARCH_FIELDS)
  // Defensive backstop for the JQL clause above, keyed off the same
  // `issuetype.subtask` boolean mapIssueToTicketFields itself ignores -
  // never trust a live Jira query alone to have excluded every Sub-task,
  // Epic, or Done ticket. Matches epics.ts's own `status === 'Done'` string
  // comparison against the raw status name.
  const issues = rawIssues.filter((issue) => {
    const issuetype = issue.fields.issuetype as JiraIssueTypeRef | undefined
    const status = issue.fields.status as JiraStatusRef | undefined
    return !issuetype?.subtask && issuetype?.name !== 'Epic' && status?.name !== 'Done'
  })

  const syncedAt = new Date()
  const mapped = issues.map((issue) => ({ issue, fields: mapIssueToTicketFields(issue, syncedAt) }))

  // Only Story/Bug results need their Dev/QA Sub-tasks resolved - a Task
  // reads its own plain assignee directly, no Sub-task lookup (ticket's
  // checklist).
  const subtaskKeysByParentKey = new Map<string, string[]>()
  for (const { issue, fields } of mapped) {
    if (!isSplitTicket(fields.type)) continue
    const subtasks = (issue.fields.subtasks as JiraSubtaskRef[] | undefined) ?? []
    subtaskKeysByParentKey.set(issue.key, subtasks.map((subtask) => subtask.key))
  }

  const allSubtaskKeys = [...subtaskKeysByParentKey.values()].flat()
  const subtaskResult = allSubtaskKeys.length > 0 ? await bulkFetchIssues(allSubtaskKeys) : { issues: [], issueErrors: [] }
  const subtaskFieldsByKey = new Map(
    subtaskResult.issues.map((issue: JiraIssue) => [issue.key, mapIssueToTicketFields(issue, syncedAt)]),
  )

  return mapped.map(({ issue, fields }) => {
    if (isSplitTicket(fields.type)) {
      const subtaskFields = (subtaskKeysByParentKey.get(issue.key) ?? []).map((key) => subtaskFieldsByKey.get(key))
      const devSubtask = subtaskFields.find((f) => f?.subtaskKind === 'Dev')
      const qaSubtask = subtaskFields.find((f) => f?.subtaskKind === 'Test')
      return {
        key: issue.key,
        title: fields.title,
        type: fields.type ?? '',
        labels: fields.labels,
        dev: roleFromSubtask(devSubtask),
        qa: roleFromSubtask(qaSubtask),
        assignee: null,
      }
    }

    return {
      key: issue.key,
      title: fields.title,
      type: fields.type ?? '',
      labels: fields.labels,
      dev: null,
      qa: null,
      assignee: fields.assigneeDisplayName ? { name: fields.assigneeDisplayName } : null,
    }
  })
}
