import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from 'vitest'
import { PlanningView } from './PlanningView'
import type { Person, Sprint, SprintCapacity, SprintPlanEntry, Team, TeamMembership, Ticket } from '../types'

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

const team: Team = { _id: 'team-a', name: 'Team A', jiraLabels: ['team-a-label'] }
const sprint: Sprint = { _id: 'sprint-1', jiraSprintId: '132', name: 'WOSMVP Sprint 132', state: 'active' }

const ada: Person = { _id: 'p1', name: 'Ada Lovelace', email: 'ada@example.com', jiraAccountId: 'acc-1' }
const membershipAda: TeamMembership = { _id: 'm1', teamId: 'team-a', personId: ada, role: 'SE', capacityPercentOverride: null }

function ticket(overrides: Partial<Ticket> & { jiraKey: string; assigneeAccountId: string | null }): Ticket {
  return {
    _id: overrides.jiraKey,
    type: 'Story',
    title: 'A ticket',
    status: 'To Do',
    assigneeDisplayName: null,
    assigneeEmail: null,
    estimateHours: 4,
    labels: [],
    stream: null,
    epicKey: null,
    parentKey: null,
    subtaskKind: null,
    currentSprintKey: null,
    lastSyncedAt: new Date().toISOString(),
    ...overrides,
  }
}

const adaTicket = ticket({ jiraKey: 'WOSMVP-100', assigneeAccountId: 'acc-1', title: 'Fix login' })
const unmappedTicket = ticket({ jiraKey: 'WOSMVP-150', assigneeAccountId: 'acc-x', title: 'Mystery ticket' })
const newTicket = ticket({ jiraKey: 'WOSMVP-200', assigneeAccountId: 'acc-1', title: 'New feature' })

const capacityRow: SprintCapacity = {
  teamMembershipId: 'm1',
  personId: 'p1',
  personName: 'Ada Lovelace',
  role: 'SE',
  capacityPercentOverride: null,
  effectivePercentage: 80,
  leaveDays: 1,
  total: 72,
  available: 57.6,
  planned: 32,
  remaining: 25.6,
}

let entriesData: SprintPlanEntry[]
let fetchMock: FetchMock

function entry(id: string, t: Ticket, order: number): SprintPlanEntry {
  return { _id: id, teamId: 'team-a', sprintId: 'sprint-1', ticketId: t, order }
}

function stubFetch(): FetchMock {
  const mock: FetchMock = vi.fn((url, init) => {
    const href = String(url)
    const method = init?.method ?? 'GET'

    if (href.includes('/api/sprints')) return jsonResponse([sprint])
    if (href.includes('/api/team-memberships')) return jsonResponse([membershipAda])

    if (href.includes('/api/sprint-plan-entries') && method === 'POST') {
      const body = JSON.parse(init?.body ?? '{}')
      const created = entry(`e-${body.jiraKey}`, newTicket, entriesData.length)
      entriesData = [...entriesData, created]
      return jsonResponse(created, 201)
    }
    if (href.includes('/api/sprint-plan-entries')) return jsonResponse(entriesData)

    if (href.includes('/capacity')) return jsonResponse([capacityRow])

    return jsonResponse([])
  })
  vi.stubGlobal('fetch', mock)
  return mock
}

describe('PlanningView', () => {
  beforeEach(() => {
    entriesData = [entry('e1', adaTicket, 0), entry('e2', unmappedTicket, 0)]
    fetchMock = stubFetch()
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('renders capacity cards with the API-computed numbers', async () => {
    render(<PlanningView team={team} />)

    await waitFor(() => expect(screen.getByText('Ada Lovelace')).toBeInTheDocument())
    expect(screen.getByText('32h planned')).toBeInTheDocument()
    expect(screen.getByText('57.6h avail')).toBeInTheDocument()
    expect(screen.getByText('25.6h remaining')).toBeInTheDocument()
    expect(screen.getByText('1d leave')).toBeInTheDocument()
  })

  it('lists a synced ticket under its assignee\'s row', async () => {
    render(<PlanningView team={team} />)

    await waitFor(() => expect(screen.getByLabelText('Tickets for Ada Lovelace')).toBeInTheDocument())
    expect(within(screen.getByLabelText('Tickets for Ada Lovelace')).getByText('100')).toBeInTheDocument()
  })

  it('lands a ticket whose assignee is not on the team in the flagged unmapped row', async () => {
    render(<PlanningView team={team} />)

    await waitFor(() => expect(screen.getByLabelText('Tickets for Unmapped')).toBeInTheDocument())
    const unmappedRow = screen.getByLabelText('Tickets for Unmapped')
    expect(within(unmappedRow).getByText('150')).toBeInTheDocument()
    expect(screen.getByText('⚠ Unmapped')).toBeInTheDocument()
  })

  it('adding a ticket via the entry bar populates the right person\'s row', async () => {
    render(<PlanningView team={team} />)
    await waitFor(() => expect(screen.getByLabelText('Tickets for Ada Lovelace')).toBeInTheDocument())

    fireEvent.change(screen.getByLabelText('Ticket number to add to plan'), { target: { value: '200' } })
    fireEvent.click(screen.getByRole('button', { name: 'Add' }))

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        'http://localhost:4100/api/sprint-plan-entries',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({ teamId: 'team-a', sprintId: 'sprint-1', jiraKey: 'WOSMVP-200' }),
        }),
      ),
    )

    await waitFor(() =>
      expect(within(screen.getByLabelText('Tickets for Ada Lovelace')).getByText('200')).toBeInTheDocument(),
    )
    expect(screen.getByLabelText('Ticket number to add to plan')).toHaveValue('')
  })
})
