import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from 'vitest'
import { StatusView } from './StatusView'
import type { Person, Sprint, Status, Team, TeamMembership, Ticket } from '../types'

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
const grace: Person = { _id: 'p2', name: 'Grace Hopper', email: 'grace@example.com', jiraAccountId: 'acc-2' }
const membershipAda: TeamMembership = { _id: 'm1', teamId: 'team-a', personId: ada, role: 'SE', capacityPercentOverride: null }
const membershipGrace: TeamMembership = { _id: 'm2', teamId: 'team-a', personId: grace, role: 'QA', capacityPercentOverride: null }

const statuses: Status[] = [
  { _id: 's-todo', name: 'To Do', order: 1, category: 'todo', lastSyncedAt: new Date().toISOString() },
  { _id: 's-wip', name: 'Dev WIP', order: 2, category: 'in_progress', lastSyncedAt: new Date().toISOString() },
  { _id: 's-merged', name: 'Merged', order: 6, category: 'in_progress', lastSyncedAt: new Date().toISOString() },
  { _id: 's-done', name: 'Done', order: 7, category: 'done', lastSyncedAt: new Date().toISOString() },
]

function ticket(overrides: Partial<Ticket> & { jiraKey: string; assigneeAccountId: string | null; status: string }): Ticket {
  return {
    _id: overrides.jiraKey,
    type: 'Story',
    title: 'A ticket',
    assigneeDisplayName: null,
    assigneeEmail: null,
    estimateHours: null,
    labels: ['team-a-label'],
    stream: null,
    epicKey: null,
    parentKey: null,
    subtaskKind: null,
    currentSprintKey: '132',
    lastSyncedAt: new Date().toISOString(),
    ...overrides,
  }
}

let ticketsData: Ticket[]
let statusesData: Status[]
let fetchMock: FetchMock

function stubFetch(): FetchMock {
  const mock: FetchMock = vi.fn((url, init) => {
    const href = String(url)
    const method = init?.method ?? 'GET'

    if (href.includes('/api/sprints')) return jsonResponse([sprint])
    if (href.includes('/api/team-memberships')) return jsonResponse([membershipAda, membershipGrace])
    if (href.includes('/api/statuses')) return jsonResponse(statusesData)

    if (href.endsWith('/api/status-sync') && method === 'POST') {
      const body: { personId: string } = JSON.parse(init?.body ?? '{}')
      const account = body.personId === getIdOf(ada) ? ada.jiraAccountId : grace.jiraAccountId
      const discovered = ticket({
        jiraKey: 'WOSMVP-999',
        assigneeAccountId: account,
        status: 'Dev WIP',
        title: 'Newly discovered',
        type: null,
      })
      ticketsData = [...ticketsData.filter((t) => t.jiraKey !== discovered.jiraKey), discovered]
      // Mirrors the backend's real behavior (services/statusSync.ts's
      // refreshStatusSet): every sync also refreshes the mirrored Status
      // set wholesale, as a side effect independent of which ticket was
      // discovered.
      statusesData = statuses
      return jsonResponse([discovered])
    }

    if (href.includes('/api/tickets')) return jsonResponse(ticketsData)

    return jsonResponse([])
  })
  vi.stubGlobal('fetch', mock)
  return mock
}

function getIdOf(p: Person): string {
  return p._id ?? p.id ?? ''
}

describe('StatusView', () => {
  beforeEach(() => {
    ticketsData = []
    statusesData = statuses
    fetchMock = stubFetch()
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('shows the empty state for the auto-selected first person until they are synced', async () => {
    render(<StatusView team={team} />)

    const roster = await screen.findByLabelText('Team roster')
    expect(within(roster).getByText('Ada Lovelace')).toBeInTheDocument()
    expect(await screen.findByText(/No tickets discovered yet — sync Ada Lovelace/)).toBeInTheDocument()
  })

  it('re-fetches the mirrored status set on sync, so a ticket landing in a column the session\'s stale status snapshot lacked still renders (not just counted in the roster)', async () => {
    // This session's Status view loaded before the local Status mirror had
    // ever been populated (e.g. this is the very first sync anyone's run) -
    // the initial GET /api/statuses returns empty, same as a brand-new app.
    statusesData = []
    fetchMock = stubFetch()

    render(<StatusView team={team} />)
    await screen.findByLabelText('Team roster')

    fireEvent.click(screen.getByRole('button', { name: "Sync Ada Lovelace's tickets" }))

    // The roster count reads straight from `tickets`, so it updates
    // regardless of whether `statuses` is stale.
    await waitFor(() => expect(screen.getByText('1 ticket', { exact: false })).toBeInTheDocument())

    // The board itself is built from `statuses`, though - without a
    // refetch there, the newly-discovered "Dev WIP" ticket would have no
    // column to land in and the board would wrongly still say nothing's
    // been discovered.
    const board = await screen.findByLabelText("Ada Lovelace's board")
    expect(within(board).getByText('Dev WIP', { exact: false })).toBeInTheDocument()
    expect(within(board).getByText('WOSMVP-999')).toBeInTheDocument()
  })

  it("syncing a person populates their board", async () => {
    render(<StatusView team={team} />)
    await screen.findByLabelText('Team roster')

    fireEvent.click(screen.getByRole('button', { name: "Sync Ada Lovelace's tickets" }))

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        'http://localhost:4100/api/status-sync',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({ teamId: 'team-a', personId: 'p1', sprintId: 'sprint-1' }),
        }),
      ),
    )

    const board = await screen.findByLabelText("Ada Lovelace's board")
    expect(within(board).getByText('WOSMVP-999')).toBeInTheDocument()
    expect(within(board).getByText('Newly discovered')).toBeInTheDocument()
  })

  it('only renders status columns the selected person actually has a ticket in, per ADR 0003', async () => {
    ticketsData = [
      ticket({ jiraKey: 'WOSMVP-100', assigneeAccountId: 'acc-1', status: 'To Do' }),
      ticket({ jiraKey: 'WOSMVP-101', assigneeAccountId: 'acc-1', status: 'Dev WIP' }),
    ]
    fetchMock = stubFetch()

    render(<StatusView team={team} />)

    const board = await screen.findByLabelText("Ada Lovelace's board")
    expect(within(board).getByText('To Do', { exact: false })).toBeInTheDocument()
    expect(within(board).getByText('Dev WIP', { exact: false })).toBeInTheDocument()
    // "Merged" and "Done" are in the locally-mirrored Status set but Ada has
    // no ticket in either right now - must be omitted entirely, not shown
    // blank.
    expect(within(board).queryByText('Merged', { exact: false })).not.toBeInTheDocument()
    expect(within(board).queryByText('Done', { exact: false })).not.toBeInTheDocument()
  })

  it('shows a muted "?" type badge for a Lightweight-synced ticket whose type is unknown', async () => {
    ticketsData = [ticket({ jiraKey: 'WOSMVP-200', assigneeAccountId: 'acc-1', status: 'To Do', type: null, title: 'Mystery' })]
    fetchMock = stubFetch()

    render(<StatusView team={team} />)

    const board = await screen.findByLabelText("Ada Lovelace's board")
    const card = within(board).getByText('Mystery').closest('div')
    expect(card).not.toBeNull()
    expect(within(card as HTMLElement).getByText('?')).toBeInTheDocument()
  })

  it('renders an "open in Jira" link pointing at the right URL', async () => {
    ticketsData = [ticket({ jiraKey: 'WOSMVP-300', assigneeAccountId: 'acc-1', status: 'To Do' })]
    fetchMock = stubFetch()

    render(<StatusView team={team} />)

    const link = await screen.findByRole('link', { name: 'Open WOSMVP-300 in Jira' })
    expect(link).toHaveAttribute('href', 'https://wealthos.atlassian.net/browse/WOSMVP-300')
    expect(link).toHaveAttribute('target', '_blank')
  })

  it('switching the selected person shows their own board, not the previous person\'s', async () => {
    ticketsData = [
      ticket({ jiraKey: 'WOSMVP-100', assigneeAccountId: 'acc-1', status: 'To Do', title: "Ada's ticket" }),
      ticket({ jiraKey: 'WOSMVP-200', assigneeAccountId: 'acc-2', status: 'Dev WIP', title: "Grace's ticket" }),
    ]
    fetchMock = stubFetch()

    render(<StatusView team={team} />)
    await screen.findByLabelText("Ada Lovelace's board")

    fireEvent.click(screen.getByRole('button', { name: 'Grace Hopper' }))

    const board = await screen.findByLabelText("Grace Hopper's board")
    expect(within(board).getByText("Grace's ticket")).toBeInTheDocument()
    expect(within(board).queryByText("Ada's ticket")).not.toBeInTheDocument()
  })
})
