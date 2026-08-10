import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from 'vitest'
import { TeamRoster } from './TeamRoster'
import type { Person, Team, TeamMembership } from '../types'

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

const team: Team = { _id: 'team-a', name: 'Team A', jiraLabels: ['team-a-label'] }

const ada: Person = { _id: 'p1', name: 'Ada Lovelace', email: 'ada@example.com', jiraAccountId: 'acc-1' }
const grace: Person = { _id: 'p2', name: 'Grace Hopper', email: 'grace@example.com', jiraAccountId: 'acc-2' }

const membershipAda: TeamMembership = {
  _id: 'm1',
  teamId: 'team-a',
  personId: ada,
  role: 'SE',
  capacityPercentOverride: null,
}

let membershipsData: TeamMembership[]
let peopleData: Person[]
let fetchMock: FetchMock

// Handles every endpoint useTeamRoster touches - team-memberships CRUD,
// people list/create, and the optional jira-search passthrough (stubbed
// unavailable/null by default, matching the "degrade silently" contract).
function stubFetch(): FetchMock {
  const mock: FetchMock = vi.fn((url, init) => {
    const href = String(url)
    const method = init?.method ?? 'GET'

    if (href.includes('/api/people/jira-search')) {
      return jsonResponse(null)
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
    if (href.includes('/api/team-memberships') && method === 'POST') {
      const body = JSON.parse(init?.body ?? '{}')
      const person = peopleData.find((p) => p._id === body.personId)
      const created: TeamMembership = {
        _id: `m-${body.personId}`,
        teamId: body.teamId,
        personId: person as Person,
        role: body.role,
        capacityPercentOverride: body.capacityPercentOverride ?? null,
      }
      membershipsData = [...membershipsData, created]
      return jsonResponse({ _id: created._id, teamId: created.teamId, personId: body.personId, role: created.role, capacityPercentOverride: created.capacityPercentOverride }, true)
    }
    if (href.includes('/api/team-memberships/') && method === 'PATCH') {
      const id = href.split('/').pop()
      const body = JSON.parse(init?.body ?? '{}')
      const existing = membershipsData.find((m) => m._id === id)
      const updated: TeamMembership = {
        ...(existing as TeamMembership),
        ...body,
        capacityPercentOverride:
          'capacityPercentOverride' in body ? body.capacityPercentOverride : (existing?.capacityPercentOverride ?? null),
      }
      membershipsData = membershipsData.map((m) => (m._id === id ? updated : m))
      return jsonResponse(updated, true)
    }
    if (href.includes('/api/team-memberships/') && method === 'DELETE') {
      const id = href.split('/').pop()
      membershipsData = membershipsData.filter((m) => m._id !== id)
      return jsonResponse({}, true)
    }
    if (href.includes('/api/team-memberships')) {
      return jsonResponse(membershipsData)
    }
    return jsonResponse([])
  })
  vi.stubGlobal('fetch', mock)
  return mock
}

describe('TeamRoster', () => {
  beforeEach(() => {
    membershipsData = [membershipAda]
    peopleData = [ada, grace]
    fetchMock = stubFetch()
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('lists the current roster', async () => {
    render(<TeamRoster team={team} />)

    await waitFor(() => expect(screen.getByText('Ada Lovelace')).toBeInTheDocument())
    expect(screen.getByLabelText('Role for Ada Lovelace')).toHaveValue('SE')
  })

  it('adds an existing person via the autocomplete search', async () => {
    render(<TeamRoster team={team} />)
    await waitFor(() => expect(screen.getByText('Ada Lovelace')).toBeInTheDocument())

    fireEvent.change(screen.getByLabelText('Search people'), { target: { value: 'Grace' } })
    await waitFor(() => expect(screen.getByText('Grace Hopper · grace@example.com')).toBeInTheDocument())
    fireEvent.click(screen.getByText('Grace Hopper · grace@example.com'))

    fireEvent.click(screen.getByRole('button', { name: 'Add' }))

    await waitFor(() => expect(screen.getByText('Grace Hopper')).toBeInTheDocument())
    expect(fetchMock).toHaveBeenCalledWith(
      'http://localhost:4100/api/team-memberships',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ teamId: 'team-a', personId: 'p2', role: 'TL', capacityPercentOverride: undefined }),
      }),
    )
  })

  it('adds a person via manual entry, creating the Person then the membership', async () => {
    render(<TeamRoster team={team} />)
    await waitFor(() => expect(screen.getByText('Ada Lovelace')).toBeInTheDocument())

    fireEvent.click(screen.getByRole('button', { name: 'New person' }))
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

  it('edits role inline', async () => {
    render(<TeamRoster team={team} />)
    await waitFor(() => expect(screen.getByText('Ada Lovelace')).toBeInTheDocument())

    fireEvent.change(screen.getByLabelText('Role for Ada Lovelace'), { target: { value: 'TL' } })

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        'http://localhost:4100/api/team-memberships/m1',
        expect.objectContaining({ method: 'PATCH', body: JSON.stringify({ role: 'TL' }) }),
      ),
    )
  })

  it('edits capacity override inline and explicitly clears it to null', async () => {
    render(<TeamRoster team={team} />)
    await waitFor(() => expect(screen.getByText('Ada Lovelace')).toBeInTheDocument())

    const capacityInput = screen.getByLabelText('Capacity override for Ada Lovelace')
    fireEvent.change(capacityInput, { target: { value: '65' } })
    fireEvent.blur(capacityInput)

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        'http://localhost:4100/api/team-memberships/m1',
        expect.objectContaining({ method: 'PATCH', body: JSON.stringify({ capacityPercentOverride: 65 }) }),
      ),
    )

    membershipsData = membershipsData.map((m) => (m._id === 'm1' ? { ...m, capacityPercentOverride: 65 } : m))

    const updatedInput = await screen.findByLabelText('Capacity override for Ada Lovelace')
    fireEvent.change(updatedInput, { target: { value: '' } })
    fireEvent.blur(updatedInput)

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        'http://localhost:4100/api/team-memberships/m1',
        expect.objectContaining({ method: 'PATCH', body: JSON.stringify({ capacityPercentOverride: null }) }),
      ),
    )
  })

  it('removes a membership after confirming', async () => {
    render(<TeamRoster team={team} />)
    await waitFor(() => expect(screen.getByText('Ada Lovelace')).toBeInTheDocument())

    fireEvent.click(screen.getByLabelText('Remove Ada Lovelace from team'))
    expect(screen.getByRole('alertdialog')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Remove' }))

    await waitFor(() => expect(screen.queryByText('Ada Lovelace')).not.toBeInTheDocument())
    expect(fetchMock).toHaveBeenCalledWith('http://localhost:4100/api/team-memberships/m1', expect.objectContaining({ method: 'DELETE' }))
  })
})
