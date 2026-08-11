import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from 'vitest'
import { AddSprintPopover } from './AddSprintPopover'
import type { JiraSprintSearchResult, Sprint } from '../types'

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

function jsonResponse(body: unknown, status = 200): Promise<FakeResponse> {
  return Promise.resolve({ ok: status < 400, status, json: () => Promise.resolve(body) })
}

const cachedSprints: Sprint[] = [{ _id: 's1', jiraSprintId: '132', name: 'WOSMVP Sprint 132', state: 'active' }]

const searchResults: JiraSprintSearchResult[] = [
  { id: 132, name: 'WOSMVP Sprint 132', state: 'active' },
  { id: 134, name: 'WOSMVP Sprint 134', state: 'future' },
]

let fetchMock: FetchMock

function stubFetch(): FetchMock {
  const mock: FetchMock = vi.fn((url, init) => {
    const href = String(url)
    if (href.includes('/api/sprints/search')) {
      const q = new URL(href, 'http://localhost').searchParams.get('q') ?? ''
      const filtered = q ? searchResults.filter((s) => s.name.toLowerCase().includes(q.toLowerCase())) : searchResults
      return jsonResponse(filtered)
    }
    if (href.endsWith('/api/sprints') && init?.method === 'POST') {
      return jsonResponse({ _id: 's2', jiraSprintId: '134', name: 'WOSMVP Sprint 134', state: 'future' }, 200)
    }
    return jsonResponse([])
  })
  fetchMock = mock
  vi.stubGlobal('fetch', mock)
  return mock
}

function searchCalls(): number {
  return fetchMock.mock.calls.filter(([url]) => String(url).includes('/api/sprints/search')).length
}

describe('AddSprintPopover', () => {
  beforeEach(() => {
    stubFetch()
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('fetches nothing on open - lazy, only searches once the user types', async () => {
    render(<AddSprintPopover teamId="team-a" cachedSprints={cachedSprints} onImported={vi.fn()} />)

    fireEvent.click(screen.getByRole('button', { name: 'Add sprint from Jira' }))

    expect(screen.getByText('Type a sprint name to search Jira…')).toBeInTheDocument()
    expect(searchCalls()).toBe(0)

    fireEvent.change(screen.getByLabelText('Search Jira sprints'), { target: { value: '134' } })
    await waitFor(() => expect(screen.getByText(/WOSMVP Sprint 134/)).toBeInTheDocument())
    expect(searchCalls()).toBe(1)
  })

  it('clearing the query back to blank stops showing results without a new fetch', async () => {
    render(<AddSprintPopover teamId="team-a" cachedSprints={cachedSprints} onImported={vi.fn()} />)

    fireEvent.click(screen.getByRole('button', { name: 'Add sprint from Jira' }))
    fireEvent.change(screen.getByLabelText('Search Jira sprints'), { target: { value: '134' } })
    await waitFor(() => expect(screen.getByText(/WOSMVP Sprint 134/)).toBeInTheDocument())

    const callsAfterSearch = searchCalls()
    fireEvent.change(screen.getByLabelText('Search Jira sprints'), { target: { value: '' } })

    expect(screen.getByText('Type a sprint name to search Jira…')).toBeInTheDocument()
    expect(searchCalls()).toBe(callsAfterSearch)
  })

  it('shows an in-cache indicator for a sprint already in our cache', async () => {
    render(<AddSprintPopover teamId="team-a" cachedSprints={cachedSprints} onImported={vi.fn()} />)

    fireEvent.click(screen.getByRole('button', { name: 'Add sprint from Jira' }))
    fireEvent.change(screen.getByLabelText('Search Jira sprints'), { target: { value: 'sprint' } })
    await waitFor(() => expect(screen.getByText(/WOSMVP Sprint 132/)).toBeInTheDocument())

    const row132 = screen.getByText(/WOSMVP Sprint 132/).closest('div')
    expect(row132).toHaveTextContent('in cache')

    const row134 = screen.getByText(/WOSMVP Sprint 134/).closest('div')
    expect(row134).not.toHaveTextContent('in cache')
  })

  it('debounces the search as the user types', async () => {
    render(<AddSprintPopover teamId="team-a" cachedSprints={cachedSprints} onImported={vi.fn()} />)

    fireEvent.click(screen.getByRole('button', { name: 'Add sprint from Jira' }))
    fireEvent.change(screen.getByLabelText('Search Jira sprints'), { target: { value: '13' } })
    await waitFor(() => expect(searchCalls()).toBe(1))

    const callsBeforeTyping = searchCalls()
    fireEvent.change(screen.getByLabelText('Search Jira sprints'), { target: { value: '134' } })

    // No extra call fired synchronously on each keystroke.
    expect(searchCalls()).toBe(callsBeforeTyping)

    await waitFor(() => expect(screen.getByText(/WOSMVP Sprint 134/)).toBeInTheDocument())
    expect(screen.queryByText(/WOSMVP Sprint 132/)).not.toBeInTheDocument()
  })

  it('adds a sprint, calls onImported, and closes the popup', async () => {
    const onImported = vi.fn()
    render(<AddSprintPopover teamId="team-a" cachedSprints={cachedSprints} onImported={onImported} />)

    fireEvent.click(screen.getByRole('button', { name: 'Add sprint from Jira' }))
    fireEvent.change(screen.getByLabelText('Search Jira sprints'), { target: { value: '134' } })
    await waitFor(() => expect(screen.getByText(/WOSMVP Sprint 134/)).toBeInTheDocument())

    fireEvent.click(screen.getByRole('button', { name: 'Add' }))

    await waitFor(() => expect(onImported).toHaveBeenCalledWith('s2'))
    const postCall = fetchMock.mock.calls.find(
      ([url, init]) => String(url).endsWith('/api/sprints') && init?.method === 'POST',
    )
    expect(postCall).toBeDefined()
    expect(JSON.parse(postCall?.[1]?.body ?? '{}')).toEqual({ teamId: 'team-a', jiraSprintId: 134 })

    await waitFor(() => expect(screen.queryByRole('textbox', { name: 'Search Jira sprints' })).not.toBeInTheDocument())
  })
})
