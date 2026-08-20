import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from 'vitest'
import { AtlasPeopleButton } from './AtlasPeopleButton'
import type { AtlasRosterMember, JiraUserSuggestion, Person } from '../types'

interface FakeResponse {
  ok: boolean
  status: number
  json: () => Promise<unknown>
}

interface FetchCallInit {
  method?: string
  headers?: Record<string, string>
  body?: string
}

type FetchMock = Mock<(url: string, init?: FetchCallInit) => Promise<FakeResponse>>

function jsonResponse(body: unknown, ok = true): Promise<FakeResponse> {
  return Promise.resolve({ ok, status: ok ? 200 : 500, json: () => Promise.resolve(body) })
}

const ada: Person = { _id: 'p1', name: 'Ada Lovelace', email: 'ada@example.com', jiraAccountId: 'acc-1' }
const grace: Person = { _id: 'p2', name: 'Grace Hopper', email: 'grace@example.com', jiraAccountId: 'acc-2' }

const rosterAda: AtlasRosterMember = { _id: 'm1', personId: ada, createdAt: '2026-08-19T00:00:00.000Z' }

let rosterData: AtlasRosterMember[]
let peopleData: Person[]
let fetchMock: FetchMock
let jiraSearchResult: JiraUserSuggestion[] | null

// Handles every endpoint useAtlasRoster.ts touches - atlas/roster CRUD,
// people list/create, and the jira-search passthrough (controlled per-test
// via `jiraSearchResult`). Mirrors TeamRoster.test.tsx's stubFetch.
function stubFetch(): FetchMock {
  const mock: FetchMock = vi.fn((url, init) => {
    const href = String(url)
    const method = init?.method ?? 'GET'

    if (href.includes('/api/people/jira-search')) {
      return jsonResponse(jiraSearchResult)
    }
    if (href.startsWith('http://localhost:4100/api/people') && method === 'POST') {
      const body = JSON.parse(init?.body ?? '{}')
      const created: Person = { _id: 'p-new', ...body }
      peopleData = [...peopleData, created]
      return jsonResponse(created, true)
    }
    if (href.includes('/api/people')) {
      return jsonResponse(peopleData)
    }
    if (href.includes('/api/atlas/roster') && method === 'POST') {
      const body = JSON.parse(init?.body ?? '{}')
      const person = peopleData.find((p) => p._id === body.personId)
      const created: AtlasRosterMember = {
        _id: `m-${body.personId}`,
        personId: person as Person,
        createdAt: '2026-08-20T00:00:00.000Z',
      }
      rosterData = [...rosterData, created]
      return jsonResponse({ _id: created._id, personId: body.personId }, true)
    }
    if (href.includes('/api/atlas/roster/') && method === 'DELETE') {
      const id = href.split('/').pop()
      rosterData = rosterData.filter((m) => m._id !== id)
      return jsonResponse({}, true)
    }
    if (href.includes('/api/atlas/roster')) {
      return jsonResponse(rosterData)
    }
    return jsonResponse([])
  })
  vi.stubGlobal('fetch', mock)
  return mock
}

describe('AtlasPeopleButton', () => {
  beforeEach(() => {
    rosterData = [rosterAda]
    peopleData = [ada, grace]
    jiraSearchResult = null
    fetchMock = stubFetch()
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('shows the roster count on the closed button', async () => {
    render(<AtlasPeopleButton />)
    await waitFor(() => expect(screen.getByLabelText('Manage Atlas people')).toHaveTextContent('1 person'))
  })

  it('opens the panel and lists the current roster', async () => {
    render(<AtlasPeopleButton />)
    fireEvent.click(screen.getByLabelText('Manage Atlas people'))

    await waitFor(() => expect(screen.getByText('Ada Lovelace')).toBeInTheDocument())
    expect(screen.getByText('ada@example.com')).toBeInTheDocument()
  })

  it('adds an existing person via the autocomplete search', async () => {
    render(<AtlasPeopleButton />)
    fireEvent.click(screen.getByLabelText('Manage Atlas people'))
    await waitFor(() => expect(screen.getByText('Ada Lovelace')).toBeInTheDocument())

    fireEvent.click(screen.getByRole('button', { name: 'Existing person' }))
    fireEvent.change(screen.getByLabelText('Search people'), { target: { value: 'Grace' } })
    await waitFor(() => expect(screen.getByText('Grace Hopper · grace@example.com')).toBeInTheDocument())
    fireEvent.click(screen.getByText('Grace Hopper · grace@example.com'))

    fireEvent.click(screen.getByRole('button', { name: 'Add' }))

    await waitFor(() => expect(screen.getByText('Grace Hopper')).toBeInTheDocument())
    expect(fetchMock).toHaveBeenCalledWith(
      'http://localhost:4100/api/atlas/roster',
      expect.objectContaining({ method: 'POST', body: JSON.stringify({ personId: 'p2' }) }),
    )
  })

  it('adds a person via manual entry, creating the Person then the roster entry', async () => {
    render(<AtlasPeopleButton />)
    fireEvent.click(screen.getByLabelText('Manage Atlas people'))
    await waitFor(() => expect(screen.getByText('Ada Lovelace')).toBeInTheDocument())

    fireEvent.click(screen.getByRole('button', { name: 'Manual entry' }))
    fireEvent.change(screen.getByLabelText('New person name'), { target: { value: 'Alan Turing' } })
    fireEvent.change(screen.getByLabelText('New person email'), { target: { value: 'alan@example.com' } })
    fireEvent.change(screen.getByLabelText('New person Jira account id'), { target: { value: 'acc-3' } })

    fireEvent.click(screen.getByRole('button', { name: 'Add' }))

    await waitFor(() => expect(screen.getByText('Alan Turing')).toBeInTheDocument())
    expect(fetchMock).toHaveBeenCalledWith(
      'http://localhost:4100/api/people',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ name: 'Alan Turing', email: 'alan@example.com', jiraAccountId: 'acc-3' }),
      }),
    )
  })

  it('searches Jira live, then adds the selected user with the locked jiraAccountId', async () => {
    jiraSearchResult = [{ accountId: 'acc-jira-1', displayName: 'Alan Turing', emailAddress: 'alan@example.com' }]

    render(<AtlasPeopleButton />)
    fireEvent.click(screen.getByLabelText('Manage Atlas people'))
    await waitFor(() => expect(screen.getByText('Ada Lovelace')).toBeInTheDocument())

    fireEvent.click(screen.getByRole('button', { name: 'Search Jira' }))
    fireEvent.change(screen.getByLabelText('Search Jira users'), { target: { value: 'Alan' } })

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith('http://localhost:4100/api/people/jira-search?query=Alan'),
    )
    await waitFor(() => expect(screen.getByText(/Alan Turing/)).toBeInTheDocument())
    fireEvent.click(screen.getByText(/Alan Turing/))

    fireEvent.click(screen.getByRole('button', { name: 'Add' }))

    await waitFor(() => expect(screen.getAllByText('Alan Turing').length).toBeGreaterThan(0))
    expect(fetchMock).toHaveBeenCalledWith(
      'http://localhost:4100/api/people',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ name: 'Alan Turing', email: 'alan@example.com', jiraAccountId: 'acc-jira-1' }),
      }),
    )
  })

  it('removes a roster entry after confirming', async () => {
    render(<AtlasPeopleButton />)
    fireEvent.click(screen.getByLabelText('Manage Atlas people'))
    await waitFor(() => expect(screen.getByText('Ada Lovelace')).toBeInTheDocument())

    fireEvent.click(screen.getByLabelText('Remove Ada Lovelace from Atlas'))
    expect(screen.getByRole('alertdialog')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Remove' }))

    await waitFor(() => expect(screen.queryByText('Ada Lovelace')).not.toBeInTheDocument())
    expect(fetchMock).toHaveBeenCalledWith('http://localhost:4100/api/atlas/roster/m1', expect.objectContaining({ method: 'DELETE' }))
  })

  it('closes the panel on an outside click', async () => {
    render(<AtlasPeopleButton />)
    fireEvent.click(screen.getByLabelText('Manage Atlas people'))
    await waitFor(() => expect(screen.getByLabelText('Atlas people panel')).toBeInTheDocument())

    fireEvent.mouseDown(document.body)

    expect(screen.queryByLabelText('Atlas people panel')).not.toBeInTheDocument()
  })
})
