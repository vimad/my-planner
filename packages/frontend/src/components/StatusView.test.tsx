import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from 'vitest'
import { StatusView } from './StatusView'
import type { Person, Sprint, Standup, Status, Team, TeamMembership, Ticket } from '../types'

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
let standupData: Standup | null
let fetchMock: FetchMock

function stubFetch(): FetchMock {
  const mock: FetchMock = vi.fn((url, init) => {
    const href = String(url)
    const method = init?.method ?? 'GET'

    if (href.includes('/api/sprints')) return jsonResponse([sprint])
    if (href.includes('/api/team-memberships')) return jsonResponse([membershipAda, membershipGrace])
    if (href.includes('/api/statuses')) return jsonResponse(statusesData)

    if (href.includes('/api/standups')) {
      if (method === 'GET') {
        const requestedDate = new URL(href).searchParams.get('date')
        return standupData && standupData.date === requestedDate
          ? jsonResponse(standupData)
          : jsonResponse({ error: 'No standup started for this day' }, 404)
      }
      if (method === 'POST' && href.endsWith('/api/standups')) {
        const body: { teamId: string; date: string; teamMembershipIds: string[] } = JSON.parse(init?.body ?? '{}')
        standupData = {
          _id: 'standup-1',
          teamId: body.teamId,
          date: body.date,
          entries: body.teamMembershipIds.map((id) => ({ teamMembershipId: id, totalSeconds: 0, activeStartedAt: null })),
          endedAt: null,
        }
        return jsonResponse(standupData, 201)
      }
      if (method === 'POST' && href.includes('/timer/start')) {
        const body: { teamMembershipId: string } = JSON.parse(init?.body ?? '{}')
        if (standupData) {
          standupData = {
            ...standupData,
            entries: standupData.entries.map((e) =>
              e.teamMembershipId === body.teamMembershipId ? { ...e, activeStartedAt: new Date().toISOString() } : e,
            ),
          }
        }
        return jsonResponse(standupData)
      }
      if (method === 'POST' && href.includes('/timer/stop')) {
        const body: { teamMembershipId: string } = JSON.parse(init?.body ?? '{}')
        if (standupData) {
          standupData = {
            ...standupData,
            entries: standupData.entries.map((e) =>
              e.teamMembershipId === body.teamMembershipId
                ? { ...e, totalSeconds: e.totalSeconds + 5, activeStartedAt: null }
                : e,
            ),
          }
        }
        return jsonResponse(standupData)
      }
      if (method === 'POST' && href.includes('/end')) {
        if (standupData) {
          standupData = { ...standupData, endedAt: new Date().toISOString() }
        }
        return jsonResponse(standupData)
      }
    }

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
    standupData = null
    fetchMock = stubFetch()
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.useRealTimers()
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

  it("matches a ticket's status against a board column case-insensitively (Jira's board-column name and workflow status name aren't guaranteed the same casing)", async () => {
    // Confirmed live against wealthos.atlassian.net: a real ticket's
    // `status` came back "DEV WIP" (all caps, from the issue's actual
    // workflow status) while the mirrored board column's `name` is
    // "Dev WIP" (mixed case, from the board's own column config) - the two
    // are independently-editable Jira surfaces for "the same" status.
    ticketsData = [ticket({ jiraKey: 'WOSMVP-400', assigneeAccountId: 'acc-1', status: 'DEV WIP', title: 'Case mismatch' })]
    fetchMock = stubFetch()

    render(<StatusView team={team} />)

    const board = await screen.findByLabelText("Ada Lovelace's board")
    expect(within(board).getByText('Case mismatch')).toBeInTheDocument()
    expect(within(board).getByText('Dev WIP', { exact: false })).toBeInTheDocument()
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

  it('does not render a type or stream badge on the ticket card', async () => {
    ticketsData = [
      ticket({ jiraKey: 'WOSMVP-200', assigneeAccountId: 'acc-1', status: 'To Do', type: 'Bug', stream: 'Platform', title: 'No badges here' }),
    ]
    fetchMock = stubFetch()

    render(<StatusView team={team} />)

    const board = await screen.findByLabelText("Ada Lovelace's board")
    expect(within(board).getByText('No badges here')).toBeInTheDocument()
    expect(within(board).queryByText('Bug')).not.toBeInTheDocument()
    expect(within(board).queryByText('Platform')).not.toBeInTheDocument()
    expect(within(board).queryByText('?')).not.toBeInTheDocument()
  })

  it("colors the ticket card background by issue type, matching Planning view's badge colors", async () => {
    ticketsData = [
      ticket({ jiraKey: 'WOSMVP-201', assigneeAccountId: 'acc-1', status: 'To Do', type: 'Bug', title: 'A bug' }),
      ticket({ jiraKey: 'WOSMVP-202', assigneeAccountId: 'acc-1', status: 'To Do', type: 'Story', title: 'A story' }),
      ticket({ jiraKey: 'WOSMVP-203', assigneeAccountId: 'acc-1', status: 'To Do', type: 'Dev Task', title: 'A task' }),
    ]
    fetchMock = stubFetch()

    render(<StatusView team={team} />)

    const board = await screen.findByLabelText("Ada Lovelace's board")
    expect(within(board).getByText('A bug').closest('div')).toHaveClass('bg-red-100')
    expect(within(board).getByText('A story').closest('div')).toHaveClass('bg-green-100')
    expect(within(board).getByText('A task').closest('div')).toHaveClass('bg-blue-100')
  })

  it("shows a sub-task's parent above its own title, linking out to Jira in a new tab", async () => {
    ticketsData = [
      ticket({ jiraKey: 'WOSMVP-300', assigneeAccountId: 'acc-1', status: 'To Do', type: 'Story', title: 'Parent story' }),
      ticket({
        jiraKey: 'WOSMVP-301',
        assigneeAccountId: 'acc-1',
        status: 'To Do',
        type: 'Sub-task',
        title: 'Sub-task title',
        parentKey: 'WOSMVP-300',
      }),
    ]
    fetchMock = stubFetch()

    render(<StatusView team={team} />)

    const board = await screen.findByLabelText("Ada Lovelace's board")
    const card = within(board).getByText('Sub-task title').closest('div') as HTMLElement
    const parentLink = within(card).getByRole('link', { name: /Parent story/ })
    expect(parentLink).toHaveAttribute('href', 'https://wealthos.atlassian.net/browse/WOSMVP-300')
    expect(parentLink).toHaveAttribute('target', '_blank')
  })

  it("colors a sub-task's card by its parent's issue type, not its own", async () => {
    ticketsData = [
      ticket({ jiraKey: 'WOSMVP-310', assigneeAccountId: 'acc-1', status: 'To Do', type: 'Bug', title: 'Parent bug' }),
      ticket({
        jiraKey: 'WOSMVP-311',
        assigneeAccountId: 'acc-1',
        status: 'To Do',
        type: 'Sub-task',
        title: 'Bug sub-task',
        parentKey: 'WOSMVP-310',
      }),
    ]
    fetchMock = stubFetch()

    render(<StatusView team={team} />)

    const board = await screen.findByLabelText("Ada Lovelace's board")
    expect(within(board).getByText('Bug sub-task').closest('div')).toHaveClass('bg-red-100')
  })

  it("hides a sub-task's parent as its own separate board card, even when the parent is also assigned to the same person", async () => {
    ticketsData = [
      ticket({ jiraKey: 'WOSMVP-300', assigneeAccountId: 'acc-1', status: 'To Do', type: 'Story', title: 'Parent story' }),
      ticket({
        jiraKey: 'WOSMVP-301',
        assigneeAccountId: 'acc-1',
        status: 'To Do',
        type: 'Sub-task',
        title: 'Sub-task title',
        parentKey: 'WOSMVP-300',
      }),
    ]
    fetchMock = stubFetch()

    render(<StatusView team={team} />)

    const board = await screen.findByLabelText("Ada Lovelace's board")
    expect(within(board).getByText('Sub-task title')).toBeInTheDocument()
    expect(within(board).queryByRole('link', { name: 'Open WOSMVP-300 in Jira' })).not.toBeInTheDocument()
  })

  it("falls back to the parent's bare key when the parent ticket wasn't independently synced", async () => {
    ticketsData = [
      ticket({
        jiraKey: 'WOSMVP-401',
        assigneeAccountId: 'acc-1',
        status: 'To Do',
        type: 'Sub-task',
        title: 'Orphan sub-task',
        parentKey: 'WOSMVP-400',
      }),
    ]
    fetchMock = stubFetch()

    render(<StatusView team={team} />)

    const board = await screen.findByLabelText("Ada Lovelace's board")
    const card = within(board).getByText('Orphan sub-task').closest('div') as HTMLElement
    const parentLink = within(card).getByRole('link', { name: /WOSMVP-400/ })
    expect(parentLink).toHaveAttribute('href', 'https://wealthos.atlassian.net/browse/WOSMVP-400')
  })

  it('renders an "open in Jira" link pointing at the right URL', async () => {
    ticketsData = [ticket({ jiraKey: 'WOSMVP-300', assigneeAccountId: 'acc-1', status: 'To Do' })]
    fetchMock = stubFetch()

    render(<StatusView team={team} />)

    const link = await screen.findByRole('link', { name: 'Open WOSMVP-300 in Jira' })
    expect(link).toHaveAttribute('href', 'https://wealthos.atlassian.net/browse/WOSMVP-300')
    expect(link).toHaveAttribute('target', '_blank')
  })

  it('copies the full Jira link (not just the bare key) when the copy button is clicked', async () => {
    ticketsData = [ticket({ jiraKey: 'WOSMVP-300', assigneeAccountId: 'acc-1', status: 'To Do' })]
    fetchMock = stubFetch()
    const writeText = vi.fn().mockResolvedValue(undefined)
    Object.assign(navigator, { clipboard: { writeText } })

    render(<StatusView team={team} />)

    const board = await screen.findByLabelText("Ada Lovelace's board")
    const copyButton = within(board).getByRole('button', { name: 'Copy link to WOSMVP-300' })

    expect(within(board).queryByText('Copied!')).not.toBeInTheDocument()
    fireEvent.click(copyButton)

    expect(writeText).toHaveBeenCalledWith('https://wealthos.atlassian.net/browse/WOSMVP-300')
    expect(await within(board).findByText('Copied!')).toBeInTheDocument()
  })

  it('does not claim success when the clipboard write fails', async () => {
    ticketsData = [ticket({ jiraKey: 'WOSMVP-301', assigneeAccountId: 'acc-1', status: 'To Do' })]
    fetchMock = stubFetch()
    const writeText = vi.fn().mockRejectedValue(new Error('denied'))
    Object.assign(navigator, { clipboard: { writeText } })

    render(<StatusView team={team} />)

    const board = await screen.findByLabelText("Ada Lovelace's board")
    const copyButton = within(board).getByRole('button', { name: 'Copy link to WOSMVP-301' })
    fireEvent.click(copyButton)

    await waitFor(() => expect(writeText).toHaveBeenCalled())
    // Flush the rejected promise's .catch() before asserting the negative -
    // otherwise this would trivially pass even if the code wrongly showed
    // "Copied!" a tick later, since nothing here waits for that tick.
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(within(board).queryByText('Copied!')).not.toBeInTheDocument()
  })

  describe('standup', () => {
    it('shows "Start standup" when none exists yet for today, and persists a shuffled order on click', async () => {
      const randomSpy = vi.spyOn(Math, 'random').mockReturnValue(0)

      render(<StatusView team={team} />)
      const roster = await screen.findByLabelText('Team roster')
      const namesInOrder = () => within(roster).getAllByRole('listitem').map((li) => li.textContent)

      expect(namesInOrder()[0]).toContain('Ada Lovelace')
      expect(namesInOrder()[1]).toContain('Grace Hopper')
      expect(screen.queryByRole('button', { name: 'End standup' })).not.toBeInTheDocument()

      fireEvent.click(await screen.findByRole('button', { name: 'Start standup' }))

      await waitFor(() =>
        expect(fetchMock).toHaveBeenCalledWith(
          'http://localhost:4100/api/standups',
          expect.objectContaining({
            method: 'POST',
            body: expect.stringContaining('"teamMembershipIds":["m2","m1"]'),
          }),
        ),
      )

      // Fisher-Yates with Math.random always 0 swaps the two-person roster,
      // and that persisted order is what now renders.
      await waitFor(() => expect(namesInOrder()[0]).toContain('Grace Hopper'))
      expect(namesInOrder()[1]).toContain('Ada Lovelace')
      expect(await screen.findByRole('button', { name: 'End standup' })).toBeInTheDocument()
      expect(screen.queryByRole('button', { name: 'Start standup' })).not.toBeInTheDocument()

      randomSpy.mockRestore()
    })

    it("starts and stops a person's timer, accumulating and displaying elapsed time", async () => {
      const randomSpy = vi.spyOn(Math, 'random').mockReturnValue(0)
      render(<StatusView team={team} />)
      fireEvent.click(await screen.findByRole('button', { name: 'Start standup' }))
      await screen.findByRole('button', { name: 'End standup' })

      const roster = await screen.findByLabelText('Team roster')
      const playButton = within(roster).getByRole('button', { name: "Start Grace Hopper's timer" })

      fireEvent.click(playButton)

      await waitFor(() =>
        expect(fetchMock).toHaveBeenCalledWith(
          'http://localhost:4100/api/standups/standup-1/timer/start',
          expect.objectContaining({ method: 'POST', body: JSON.stringify({ teamMembershipId: 'm2' }) }),
        ),
      )

      const stopButton = await within(roster).findByRole('button', { name: "Stop Grace Hopper's timer" })

      // Starting a second person's timer while one is already running is
      // disabled - only one person is ever "on the clock" at once.
      const otherPlayButton = within(roster).getByRole('button', { name: "Start Ada Lovelace's timer" })
      expect(otherPlayButton).toBeDisabled()

      fireEvent.click(stopButton)

      await waitFor(() =>
        expect(fetchMock).toHaveBeenCalledWith(
          'http://localhost:4100/api/standups/standup-1/timer/stop',
          expect.objectContaining({ method: 'POST', body: JSON.stringify({ teamMembershipId: 'm2' }) }),
        ),
      )

      await waitFor(() => expect(within(roster).getByText('0:05')).toBeInTheDocument())
      expect(within(roster).getByRole('button', { name: "Start Grace Hopper's timer" })).toBeInTheDocument()

      randomSpy.mockRestore()
    })

    it("ending the standup returns to the normal roster view, with a summary of that day's times", async () => {
      const randomSpy = vi.spyOn(Math, 'random').mockReturnValue(0)
      render(<StatusView team={team} />)
      fireEvent.click(await screen.findByRole('button', { name: 'Start standup' }))
      await screen.findByRole('button', { name: 'End standup' })

      const roster = await screen.findByLabelText('Team roster')
      fireEvent.click(within(roster).getByRole('button', { name: "Start Grace Hopper's timer" }))
      fireEvent.click(await within(roster).findByRole('button', { name: "Stop Grace Hopper's timer" }))
      await waitFor(() => expect(within(roster).getByText('0:05')).toBeInTheDocument())

      fireEvent.click(screen.getByRole('button', { name: 'End standup' }))

      await waitFor(() =>
        expect(fetchMock).toHaveBeenCalledWith(
          'http://localhost:4100/api/standups/standup-1/end',
          expect.objectContaining({ method: 'POST' }),
        ),
      )

      // Back to the normal view - no more per-row timer controls, and the
      // roster falls back to its plain fetched order.
      await waitFor(() => expect(screen.queryByRole('button', { name: 'End standup' })).not.toBeInTheDocument())
      expect(within(roster).queryByRole('button', { name: "Start Ada Lovelace's timer" })).not.toBeInTheDocument()
      const namesInOrder = within(roster).getAllByRole('listitem').map((li) => li.textContent)
      expect(namesInOrder[0]).toContain('Ada Lovelace')

      fireEvent.click(screen.getByRole('button', { name: "View today's standup" }))

      const modal = await screen.findByText("Today's standup")
      const summary = modal.closest('div') as HTMLElement
      expect(within(summary).getByText('Grace Hopper')).toBeInTheDocument()
      expect(within(summary).getByText('0:05')).toBeInTheDocument()

      fireEvent.click(screen.getByRole('button', { name: 'Close' }))
      await waitFor(() => expect(screen.queryByText("Today's standup")).not.toBeInTheDocument())

      randomSpy.mockRestore()
    })

    // Reverting to "Start standup" once the client's date rolls over to a new
    // day is covered at the hook level (hooks/useStandup.test.ts), where fake
    // timers can be driven directly without fighting testing-library's own
    // (real-timer-based) waitFor polling.
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
