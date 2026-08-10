import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from 'vitest'
import App from '../App'
import type { Team } from '../types'

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
  return Promise.resolve({
    ok,
    status: ok ? 200 : 500,
    json: () => Promise.resolve(body),
  })
}

let teamsData: Team[]
let fetchMock: FetchMock
// Set by a test just before firing a team create/rename action, read by
// stubFetch's POST/PATCH /api/teams handling below - keyed on method+URL
// rather than "the next mockImplementationOnce call", since PlanningView
// (ticket 18) now fires its own background fetches (sprints, memberships)
// on every render, and those can race a bare call-order-based mock.
let pendingCreatedTeam: Team | null = null
let pendingRenamedTeam: Team | null = null

// Stubs every endpoint AppShell's own effects touch too, since navigating
// to /sprint/* and back still shares one App tree - a stray unhandled URL
// would otherwise throw instead of silently no-op'ing. Also stubs the
// Planning view's own read-only endpoints (sprints/memberships/capacity/
// entries) with safe empty data, since SprintShell now mounts the real
// PlanningView (ticket 18) rather than a static stub.
function stubFetch(): FetchMock {
  const mock: FetchMock = vi.fn((url, init) => {
    const href = String(url)
    const method = init?.method ?? 'GET'
    if (href.includes('/api/todos/weekly-summary')) {
      return jsonResponse({ weekStart: '2024-01-01', weekEnd: '2024-01-07', categories: [] })
    }
    if (method === 'POST' && href.endsWith('/api/teams')) return jsonResponse(pendingCreatedTeam ?? {}, true)
    if (method === 'PATCH' && href.includes('/api/teams/')) return jsonResponse(pendingRenamedTeam ?? {}, true)
    if (method === 'DELETE' && href.includes('/api/teams/')) return jsonResponse({}, true)
    if (href.includes('/api/teams')) return jsonResponse(teamsData)
    if (href.includes('/api/sprints')) return jsonResponse([])
    if (href.includes('/api/team-memberships')) return jsonResponse([])
    if (href.includes('/api/todos')) return jsonResponse([])
    if (href.includes('/api/categories')) return jsonResponse([])
    if (href.includes('/api/boards')) return jsonResponse([])
    if (href.includes('/api/profiles')) return jsonResponse([{ _id: 'profile-1', name: 'Default Profile' }])
    return jsonResponse([])
  })
  vi.stubGlobal('fetch', mock)
  return mock
}

const teamA: Team = { _id: 'team-a', name: 'Team A', jiraLabels: ['team-a-label'] }
const teamB: Team = { _id: 'team-b', name: 'Team B', jiraLabels: ['team-b-label'] }

describe('SprintShell', () => {
  beforeEach(() => {
    window.history.pushState({}, '', '/')
    teamsData = [teamA, teamB]
    pendingCreatedTeam = null
    pendingRenamedTeam = null
    localStorage.clear()
    fetchMock = stubFetch()
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    localStorage.clear()
  })

  it('redirects /sprint to the last-active team\'s Planning view', async () => {
    window.history.pushState({}, '', '/sprint')

    render(<App />)

    await waitFor(() => {
      expect(window.location.pathname).toBe('/sprint/team-a/planning')
    })
    await waitFor(() => {
      expect(screen.getByText("No sprints found for this team's board.")).toBeInTheDocument()
    })
    expect(screen.getByRole('tab', { name: 'Planning' })).toHaveAttribute('aria-selected', 'true')
  })

  it('redirects a bare /sprint/:teamSlug to its Planning view', async () => {
    window.history.pushState({}, '', '/sprint/team-b')

    render(<App />)

    await waitFor(() => {
      expect(window.location.pathname).toBe('/sprint/team-b/planning')
    })
  })

  it('navigates between Planning/Status/Epics via the sub-nav pills', async () => {
    window.history.pushState({}, '', '/sprint/team-a/planning')

    render(<App />)

    await waitFor(() => {
      expect(screen.getByText("No sprints found for this team's board.")).toBeInTheDocument()
    })

    fireEvent.click(screen.getByRole('tab', { name: 'Status' }))
    await waitFor(() => {
      expect(window.location.pathname).toBe('/sprint/team-a/status')
    })
    // StatusView (ticket 21) shares Planning's own "no sprints" wording for
    // its sprint selector, so this also confirms the real view mounted
    // (rather than erroring) with the same empty-sprints stub data.
    expect(screen.getByText("No sprints found for this team's board.")).toBeInTheDocument()

    fireEvent.click(screen.getByRole('tab', { name: 'Epics' }))
    await waitFor(() => {
      expect(screen.getByText('Epics view coming soon.')).toBeInTheDocument()
    })
    expect(window.location.pathname).toBe('/sprint/team-a/epics')
  })

  it('does not render the Todos/Notes/Boards chrome on a /sprint route, and the workspace switcher navigates back to "/"', async () => {
    window.history.pushState({}, '', '/sprint/team-a/planning')

    render(<App />)

    await waitFor(() => {
      expect(screen.getByText("No sprints found for this team's board.")).toBeInTheDocument()
    })
    expect(screen.queryByRole('tab', { name: 'Todos' })).not.toBeInTheDocument()
    expect(screen.getByRole('tab', { name: 'Team A' })).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByRole('heading', { name: 'Sprint' })).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Switch workspace' }))
    fireEvent.click(screen.getByRole('button', { name: 'Planner →' }))

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'My Planner' })).toBeInTheDocument()
    })
    expect(screen.getByRole('tab', { name: 'Todos' })).toBeInTheDocument()
  })

  it('leaves the ordinary AppShell routes rendering exactly as before', async () => {
    render(<App />)

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'My Planner' })).toBeInTheDocument()
    })
    expect(screen.getByRole('tab', { name: 'Todos' })).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: 'Notes' })).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: /Boards/ })).toBeInTheDocument()
  })

  it('creates, renames, and deletes a team through the Manage teams panel, round-tripping the API', async () => {
    window.history.pushState({}, '', '/sprint/team-a/planning')

    render(<App />)
    await waitFor(() => {
      expect(screen.getByRole('tab', { name: 'Team A' })).toBeInTheDocument()
    })

    // Create
    const created: Team = { _id: 'team-c', name: 'Team C', jiraLabels: ['team-c-label'] }
    pendingCreatedTeam = created

    fireEvent.click(screen.getByLabelText('Manage teams'))
    fireEvent.change(screen.getByLabelText('New team name'), { target: { value: 'Team C' } })
    fireEvent.change(screen.getByLabelText('New team Jira label'), { target: { value: 'team-c-label' } })
    fireEvent.click(screen.getByRole('button', { name: 'Add team' }))

    await waitFor(() => {
      expect(screen.getByRole('tab', { name: 'Team C' })).toBeInTheDocument()
    })
    const createCall = fetchMock.mock.calls.find(([, opts]) => opts?.method === 'POST')
    expect(createCall).toBeDefined()
    expect(JSON.parse(createCall![1]?.body ?? '{}')).toEqual({ name: 'Team C', jiraLabels: ['team-c-label'] })

    // Rename
    const renamed = { ...teamA, name: 'Team Alpha' }
    pendingRenamedTeam = renamed

    fireEvent.click(screen.getByLabelText('Rename Team A'))
    fireEvent.change(screen.getByLabelText('Team name'), { target: { value: 'Team Alpha' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))

    await waitFor(() => {
      expect(screen.getByRole('tab', { name: 'Team Alpha' })).toBeInTheDocument()
    })
    const patchCall = fetchMock.mock.calls.find(([, opts]) => opts?.method === 'PATCH')
    expect(patchCall).toBeDefined()
    expect(patchCall![0]).toContain('/api/teams/team-a')
    expect(JSON.parse(patchCall![1]?.body ?? '{}')).toEqual({ name: 'Team Alpha' })

    // Delete
    fireEvent.click(screen.getByLabelText('Delete Team B'))
    fireEvent.click(screen.getByRole('button', { name: 'Confirm' }))

    await waitFor(() => {
      expect(screen.queryByRole('tab', { name: 'Team B' })).not.toBeInTheDocument()
    })
    const deleteCall = fetchMock.mock.calls.find(([, opts]) => opts?.method === 'DELETE')
    expect(deleteCall).toBeDefined()
    expect(deleteCall![0]).toContain('/api/teams/team-b')
  })

  it('does not delete a team when the confirmation is cancelled', async () => {
    window.history.pushState({}, '', '/sprint/team-a/planning')

    render(<App />)
    await waitFor(() => {
      expect(screen.getByRole('tab', { name: 'Team A' })).toBeInTheDocument()
    })

    fireEvent.click(screen.getByLabelText('Manage teams'))
    fireEvent.click(screen.getByLabelText('Delete Team B'))
    expect(screen.getByText('Delete "Team B"? This cannot be undone.')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))

    expect(screen.getByRole('tab', { name: 'Team B' })).toBeInTheDocument()
    expect(fetchMock.mock.calls.some(([, opts]) => opts?.method === 'DELETE')).toBe(false)
  })

  it('falls back to the "no teams yet" message, not a blank page, after deleting the team whose URL is still active', async () => {
    teamsData = [teamA]
    window.history.pushState({}, '', '/sprint/team-a/planning')

    render(<App />)
    await waitFor(() => {
      expect(screen.getByText("No sprints found for this team's board.")).toBeInTheDocument()
    })

    fireEvent.click(screen.getByLabelText('Manage teams'))
    fireEvent.click(screen.getByLabelText('Delete Team A'))
    fireEvent.click(screen.getByRole('button', { name: 'Confirm' }))

    await waitFor(() => {
      expect(screen.getByText(/No teams yet/)).toBeInTheDocument()
    })
    expect(window.location.pathname).toBe('/sprint')
  })

  it('shows a message inviting team creation when no teams exist yet, and still offers Manage teams', async () => {
    teamsData = []
    window.history.pushState({}, '', '/sprint')

    render(<App />)

    await waitFor(() => {
      expect(screen.getByText(/No teams yet/)).toBeInTheDocument()
    })
    expect(screen.getByLabelText('Manage teams')).toBeInTheDocument()
  })
})
