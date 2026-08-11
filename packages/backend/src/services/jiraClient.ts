// Thin read-only wrapper over Jira Cloud's REST API (Basic auth). Every
// function reads JIRA_BASE_URL/JIRA_EMAIL/JIRA_API_TOKEN from process.env on
// each call rather than caching a client instance, so a missing/changed .env
// value is caught at call time, not just at server boot.

const AGILE_PREFIX = '/rest/agile/1.0'
const API_PREFIX = '/rest/api/3'

// issue/bulkfetch's documented ceiling — see spec's "Jira integration surface".
const BULK_FETCH_CHUNK_SIZE = 100

export interface JiraBoard {
  id: number
  name: string
  type: string
  location?: { projectKey?: string }
}

export type JiraSprintState = 'active' | 'future' | 'closed'

export interface JiraSprint {
  id: number
  name: string
  state: JiraSprintState
  startDate?: string
  endDate?: string
  originBoardId?: number
}

export interface JiraIssue {
  id: string
  key: string
  fields: Record<string, unknown>
}

export interface JiraIssueError {
  issueId?: string
  errorMessages?: string[]
}

export interface JiraBulkFetchResult {
  issues: JiraIssue[]
  issueErrors: JiraIssueError[]
}

export interface JiraCustomFieldSchema {
  custom?: string
  type?: string
  customId?: number
}

export interface JiraCustomField {
  id: string
  name: string
  schema?: JiraCustomFieldSchema
}

export interface JiraUser {
  accountId: string
  displayName?: string
  emailAddress?: string | null
}

export interface JiraBoardColumn {
  name: string
}

export interface JiraBoardConfiguration {
  columnConfig: {
    columns: JiraBoardColumn[]
  }
}

interface JiraConfig {
  baseUrl: string
  email: string
  apiToken: string
}

function getConfig(): JiraConfig {
  const baseUrl = process.env.JIRA_BASE_URL
  const email = process.env.JIRA_EMAIL
  const apiToken = process.env.JIRA_API_TOKEN
  if (!baseUrl || !email || !apiToken) {
    throw new Error('Jira is not configured: set JIRA_BASE_URL, JIRA_EMAIL, and JIRA_API_TOKEN')
  }
  return { baseUrl, email, apiToken }
}

function authHeader(config: JiraConfig): string {
  return `Basic ${Buffer.from(`${config.email}:${config.apiToken}`).toString('base64')}`
}

// A manual sync-button click is tens of requests against an hourly quota in
// the tens/hundreds of thousands (see spec's "Rate limits") — a single retry
// after the server's own Retry-After is all that's worth doing, not a
// backoff loop.
async function jiraFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const config = getConfig()
  const headers = {
    Authorization: authHeader(config),
    Accept: 'application/json',
    ...(init.body ? { 'Content-Type': 'application/json' } : {}),
    ...init.headers,
  }
  const request = () => fetch(`${config.baseUrl}${path}`, { ...init, headers })

  let res = await request()
  if (res.status === 429) {
    const retryAfterSeconds = Number(res.headers.get('Retry-After')) || 1
    await new Promise((resolve) => setTimeout(resolve, retryAfterSeconds * 1000))
    res = await request()
  }
  return res
}

async function jiraJson<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await jiraFetch(path, init)
  if (!res.ok) {
    const body = await res.text().catch(() => '')
    throw new Error(`Jira request failed: ${res.status} ${res.statusText} (${path})${body ? ` — ${body}` : ''}`)
  }
  return (await res.json()) as T
}

function chunk<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = []
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size))
  }
  return chunks
}

// A project can back many boards (confirmed live on WOSMVP: 12 boards, of
// which only "Odyssey" is the scrum board this integration targets) — an
// optional `name` filter (partial match, same as the Jira UI's board
// picker) is required to disambiguate rather than assuming projectKeyOrId
// alone identifies a single board.
export async function resolveBoard(projectKey: string, name?: string): Promise<JiraBoard | null> {
  const params = new URLSearchParams({ projectKeyOrId: projectKey })
  if (name) params.set('name', name)
  const data = await jiraJson<{ values: JiraBoard[] }>(`${AGILE_PREFIX}/board?${params.toString()}`)
  return data.values[0] ?? null
}

// This board has 100+ sprints (README.md) - more than a single page of
// Jira's default page size, so a plain unpaginated call silently drops
// everything past page 1. Since sprints come back oldest-first, that
// dropped exactly the active/future ones (highest ids) callers actually
// care about - the bug behind a just-created future sprint being invisible
// to both the cache sync and the live search (services/sprintSync.ts).
// Capped at MAX_SPRINT_PAGES purely as a runaway-loop guard against a
// malformed/always-false `isLast`, not an expected ceiling.
const MAX_SPRINT_PAGES = 20

export async function listSprints(boardId: number, states?: JiraSprintState[]): Promise<JiraSprint[]> {
  const sprints: JiraSprint[] = []
  let startAt = 0

  for (let page = 0; page < MAX_SPRINT_PAGES; page++) {
    const params = new URLSearchParams({ startAt: String(startAt) })
    if (states && states.length > 0) params.set('state', states.join(','))

    const data = await jiraJson<{ values: JiraSprint[]; isLast?: boolean }>(
      `${AGILE_PREFIX}/board/${boardId}/sprint?${params.toString()}`,
    )
    sprints.push(...data.values)

    if (data.isLast !== false || data.values.length === 0) break
    startAt += data.values.length
  }

  return sprints
}

// One sprint by its numeric Jira id, live (no board/list round trip) —
// backs the "import a not-yet-cached sprint by id" flow in sprintSync.ts's
// importSprint. Throws (via jiraJson) if Jira has no such sprint.
export async function getSprint(sprintId: number): Promise<JiraSprint> {
  return jiraJson<JiraSprint>(`${AGILE_PREFIX}/sprint/${sprintId}`)
}

// Backs the Status set's "refresh wholesale from the board's workflow
// column configuration" (spec's "Sync semantics & staleness") — one entry
// per board column, in column order.
export async function getBoardConfiguration(boardId: number): Promise<JiraBoardConfiguration> {
  return jiraJson<JiraBoardConfiguration>(`${AGILE_PREFIX}/board/${boardId}/configuration`)
}

export async function bulkFetchIssues(keys: string[], fields?: string[]): Promise<JiraBulkFetchResult> {
  const result: JiraBulkFetchResult = { issues: [], issueErrors: [] }
  for (const batch of chunk(keys, BULK_FETCH_CHUNK_SIZE)) {
    const data = await jiraJson<{ issues: JiraIssue[]; issueErrors?: JiraIssueError[] }>(
      `${API_PREFIX}/issue/bulkfetch`,
      {
        method: 'POST',
        body: JSON.stringify({
          issueIdsOrKeys: batch,
          ...(fields ? { fields } : {}),
        }),
      },
    )
    result.issues.push(...data.issues)
    result.issueErrors.push(...(data.issueErrors ?? []))
  }
  return result
}

export async function searchJql(jql: string, fields: string[]): Promise<JiraIssue[]> {
  const issues: JiraIssue[] = []
  let nextPageToken: string | undefined
  do {
    const data = await jiraJson<{ issues: JiraIssue[]; nextPageToken?: string }>(`${API_PREFIX}/search/jql`, {
      method: 'POST',
      body: JSON.stringify({
        jql,
        fields,
        ...(nextPageToken ? { nextPageToken } : {}),
      }),
    })
    issues.push(...data.issues)
    nextPageToken = data.nextPageToken
  } while (nextPageToken)
  return issues
}

export async function findCustomField(query: string): Promise<JiraCustomField[]> {
  const data = await jiraJson<{ values: JiraCustomField[] }>(
    `${API_PREFIX}/field/search?query=${encodeURIComponent(query)}&type=custom`,
  )
  return data.values
}

// Requires the "Browse users and groups" global permission, which isn't
// guaranteed alongside the "Browse projects" permission read-only ticket
// access needs (see spec's "Jira integration surface") — degrade to `null`
// on a 403 rather than throwing, since callers must treat this as an
// optional convenience, never a blocker.
export async function searchUsers(query: string): Promise<JiraUser[] | null> {
  const res = await jiraFetch(`${API_PREFIX}/user/search?query=${encodeURIComponent(query)}`)
  if (res.status === 403) {
    return null
  }
  if (!res.ok) {
    const body = await res.text().catch(() => '')
    throw new Error(
      `Jira request failed: ${res.status} ${res.statusText} (${API_PREFIX}/user/search)${body ? ` — ${body}` : ''}`,
    )
  }
  return (await res.json()) as JiraUser[]
}
