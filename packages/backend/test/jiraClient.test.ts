import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  bulkFetchIssues,
  findCustomField,
  listSprints,
  resolveBoard,
  searchJql,
  searchUsers,
  type JiraIssue,
} from '../src/services/jiraClient.ts'

function jsonResponse(body: unknown, init: { status?: number; headers?: Record<string, string> } = {}): Response {
  return new Response(JSON.stringify(body), {
    status: init.status ?? 200,
    headers: { 'content-type': 'application/json', ...init.headers },
  })
}

function issue(key: string): JiraIssue {
  return { id: key, key, fields: {} }
}

describe('jiraClient', () => {
  beforeEach(() => {
    process.env.JIRA_BASE_URL = 'https://wealthos.atlassian.net'
    process.env.JIRA_EMAIL = 'vinod@example.com'
    process.env.JIRA_API_TOKEN = 'secret-token'
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    delete process.env.JIRA_BASE_URL
    delete process.env.JIRA_EMAIL
    delete process.env.JIRA_API_TOKEN
  })

  it('sends the Basic auth header built from email:apiToken', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ values: [{ id: 1, name: 'Odyssey', type: 'scrum' }] }))
    vi.stubGlobal('fetch', fetchMock)

    await resolveBoard('WOSMVP')

    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe('https://wealthos.atlassian.net/rest/agile/1.0/board?projectKeyOrId=WOSMVP')
    const expected = `Basic ${Buffer.from('vinod@example.com:secret-token').toString('base64')}`
    expect(init.headers.Authorization).toBe(expected)
  })

  it('resolveBoard returns null when no board matches', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({ values: [] })))
    expect(await resolveBoard('NOPE')).toBeNull()
  })

  it('resolveBoard passes an optional name filter through, to disambiguate a project with many boards', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ values: [{ id: 235, name: 'Odyssey', type: 'scrum' }] }))
    vi.stubGlobal('fetch', fetchMock)

    await resolveBoard('WOSMVP', 'Odyssey')

    expect(fetchMock.mock.calls[0][0]).toBe(
      'https://wealthos.atlassian.net/rest/agile/1.0/board?projectKeyOrId=WOSMVP&name=Odyssey',
    )
  })

  it('listSprints passes the state filter through as a comma-separated query param', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ values: [{ id: 5, name: 'sprint 5', state: 'active' }] }))
    vi.stubGlobal('fetch', fetchMock)

    const sprints = await listSprints(42, ['active', 'future'])

    expect(fetchMock.mock.calls[0][0]).toBe('https://wealthos.atlassian.net/rest/agile/1.0/board/42/sprint?state=active,future')
    expect(sprints).toEqual([{ id: 5, name: 'sprint 5', state: 'active' }])
  })

  it('bulkFetchIssues chunks more than 100 keys into multiple calls', async () => {
    const keys = Array.from({ length: 150 }, (_, i) => `WOSMVP-${i + 1}`)
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ issues: keys.slice(0, 100).map(issue), issueErrors: [] }))
      .mockResolvedValueOnce(jsonResponse({ issues: keys.slice(100).map(issue), issueErrors: [] }))
    vi.stubGlobal('fetch', fetchMock)

    const result = await bulkFetchIssues(keys)

    expect(fetchMock).toHaveBeenCalledTimes(2)
    const firstBody = JSON.parse(fetchMock.mock.calls[0][1].body)
    const secondBody = JSON.parse(fetchMock.mock.calls[1][1].body)
    expect(firstBody.issueIdsOrKeys).toHaveLength(100)
    expect(secondBody.issueIdsOrKeys).toHaveLength(50)
    expect(result.issues).toHaveLength(150)
    expect(result.issueErrors).toEqual([])
  })

  it('searchJql follows nextPageToken across pages until exhausted', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ issues: [issue('WOSMVP-1')], nextPageToken: 'page-2' }))
      .mockResolvedValueOnce(jsonResponse({ issues: [issue('WOSMVP-2')] }))
    vi.stubGlobal('fetch', fetchMock)

    const issues = await searchJql('assignee = currentUser()', ['summary', 'status'])

    expect(fetchMock).toHaveBeenCalledTimes(2)
    const secondBody = JSON.parse(fetchMock.mock.calls[1][1].body)
    expect(secondBody.nextPageToken).toBe('page-2')
    expect(issues.map((i) => i.key)).toEqual(['WOSMVP-1', 'WOSMVP-2'])
  })

  it('findCustomField returns the matching fields', async () => {
    const fields = [{ id: 'customfield_10099', name: 'Stream', schema: { custom: 'select', type: 'option' } }]
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({ values: fields })))

    expect(await findCustomField('Stream')).toEqual(fields)
  })

  it('searchUsers degrades to null on a 403 instead of throwing', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({ errorMessages: ['forbidden'] }, { status: 403 })))

    await expect(searchUsers('vinod')).resolves.toBeNull()
  })

  it('searchUsers returns results on success', async () => {
    const users = [{ accountId: 'abc123', displayName: 'Vinod' }]
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse(users)))

    expect(await searchUsers('vinod')).toEqual(users)
  })

  it('retries once on a 429 and succeeds', async () => {
    vi.useFakeTimers()
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({}, { status: 429, headers: { 'Retry-After': '0' } }))
      .mockResolvedValueOnce(jsonResponse({ values: [] }))
    vi.stubGlobal('fetch', fetchMock)

    const promise = resolveBoard('WOSMVP')
    await vi.runAllTimersAsync()
    const board = await promise

    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(board).toBeNull()
    vi.useRealTimers()
  })

  it('throws on a non-ok, non-429 response', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({ errorMessages: ['nope'] }, { status: 500 })))

    await expect(resolveBoard('WOSMVP')).rejects.toThrow(/500/)
  })
})
