import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from 'vitest'
import { AtlasPlanningView } from './AtlasPlanningView'
import type { AtlasPlanningEntry, AtlasRosterMember } from '../types'

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

function member(id: string, name: string): AtlasRosterMember {
  return { _id: id, personId: { _id: `p-${id}`, name, email: `${name.toLowerCase()}@x.com`, jiraAccountId: `acc-${id}` }, createdAt: '2026-08-01T00:00:00.000Z' }
}

let rosterData: AtlasRosterMember[]
let entriesData: AtlasPlanningEntry[]
let syncedEntriesData: AtlasPlanningEntry[]
let fetchMock: FetchMock

function stubFetch(): FetchMock {
  const mock: FetchMock = vi.fn((url, init) => {
    const href = String(url)
    const method = init?.method ?? 'GET'

    if (href.endsWith('/api/atlas/roster') && method === 'GET') {
      return jsonResponse(structuredClone(rosterData))
    }
    if (href.endsWith('/api/people') && method === 'GET') {
      return jsonResponse(structuredClone(rosterData.map((m) => m.personId)))
    }
    if (href.endsWith('/api/atlas-planning-entries') && method === 'GET') {
      return jsonResponse(structuredClone(entriesData))
    }
    if (href.endsWith('/api/atlas-planning-entries/sync') && method === 'POST') {
      entriesData = syncedEntriesData
      return jsonResponse(structuredClone(entriesData))
    }
    if (/\/api\/atlas-planning-entries\/[^/]+$/.test(href) && method === 'PATCH') {
      const id = href.split('/').pop()!
      const body = JSON.parse(init?.body ?? '{}')
      const found = entriesData.find((e) => e._id === id)
      if (!found) return jsonResponse({ error: 'Planning entry not found' }, 404)
      Object.assign(found, body)
      return jsonResponse(found, 200)
    }
    return jsonResponse([])
  })
  fetchMock = mock
  vi.stubGlobal('fetch', mock)
  return mock
}

describe('AtlasPlanningView', () => {
  beforeEach(() => {
    rosterData = [member('m1', 'Alice'), member('m2', 'Bob')]
    entriesData = []
    syncedEntriesData = []
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('shows an empty-roster message when the roster has no members', async () => {
    rosterData = []
    stubFetch()
    render(<AtlasPlanningView />)

    await waitFor(() => expect(screen.getByText(/No one on the Atlas roster yet/)).toBeInTheDocument())
  })

  it('renders one row per roster member in roster order, each starting with no tickets', async () => {
    stubFetch()
    render(<AtlasPlanningView />)

    await waitFor(() => expect(screen.getByRole('group', { name: 'People and their tickets' })).toBeInTheDocument())
    const table = screen.getByRole('group', { name: 'People and their tickets' })
    const names = within(table).getAllByText(/^(Alice|Bob)$/).map((el) => el.textContent)
    expect(names).toEqual(['Alice', 'Bob'])
    expect(within(table).getAllByText('No tickets')).toHaveLength(2)
  })

  it('renders board-synced tickets already present on load, grouped by person', async () => {
    entriesData = [
      { _id: 'e1', rosterMemberId: 'm1', taskId: 't1', jiraKey: 'WOSMVP-100', order: 0, startDate: null, endDate: null },
      { _id: 'e2', rosterMemberId: 'm1', taskId: 't2', jiraKey: 'WOSMVP-101', order: 1, startDate: null, endDate: null },
    ]
    stubFetch()
    render(<AtlasPlanningView />)

    await waitFor(() => {
      const aliceRow = screen.getByLabelText('Tickets for Alice')
      expect(within(aliceRow).getByText('WOSMVP-100')).toBeInTheDocument()
      expect(within(aliceRow).getByText('WOSMVP-101')).toBeInTheDocument()
    })
    expect(screen.getByText('WOSMVP-100')).toHaveAttribute('href', 'https://wealthos.atlassian.net/browse/WOSMVP-100')
  })

  it('performs a one-time initial load from the board when no entries exist yet', async () => {
    entriesData = []
    syncedEntriesData = [{ _id: 'e1', rosterMemberId: 'm1', taskId: 't1', jiraKey: 'WOSMVP-900', order: 0, startDate: null, endDate: null }]
    stubFetch()
    render(<AtlasPlanningView />)

    await waitFor(() => {
      const aliceRow = screen.getByLabelText('Tickets for Alice')
      expect(within(aliceRow).getByText('WOSMVP-900')).toBeInTheDocument()
    })
    expect(fetchMock).toHaveBeenCalledWith(expect.stringContaining('/api/atlas-planning-entries/sync'), expect.objectContaining({ method: 'POST' }))
  })

  it('has no attach, reassign, or remove controls - Planning is fully board-derived', async () => {
    entriesData = [{ _id: 'e1', rosterMemberId: 'm1', taskId: 't1', jiraKey: 'WOSMVP-100', order: 0, startDate: null, endDate: null }]
    stubFetch()
    render(<AtlasPlanningView />)
    await waitFor(() => expect(screen.getByText('WOSMVP-100')).toBeInTheDocument())

    expect(screen.queryByLabelText('Person to attach ticket to')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Attach' })).not.toBeInTheDocument()
    expect(screen.queryByLabelText('Reassign WOSMVP-100')).not.toBeInTheDocument()
    expect(screen.queryByLabelText('Remove WOSMVP-100')).not.toBeInTheDocument()
  })

  it("sets a ticket's start/end date via the badge's calendar popover", async () => {
    entriesData = [{ _id: 'e1', rosterMemberId: 'm1', taskId: 't1', jiraKey: 'WOSMVP-100', order: 0, startDate: null, endDate: null }]
    stubFetch()
    render(<AtlasPlanningView />)
    await waitFor(() => expect(screen.getByText('WOSMVP-100')).toBeInTheDocument())

    fireEvent.click(screen.getByLabelText('Set dates for WOSMVP-100'))
    fireEvent.change(screen.getByLabelText('Start date for WOSMVP-100'), { target: { value: '2026-08-24' } })
    fireEvent.change(screen.getByLabelText('End date for WOSMVP-100'), { target: { value: '2026-08-26' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))

    await waitFor(() => {
      const patchCall = fetchMock.mock.calls.find(([url, init]) => String(url).endsWith('/e1') && init?.method === 'PATCH')
      expect(patchCall).toBeDefined()
      expect(JSON.parse(patchCall![1]!.body!)).toEqual({ startDate: '2026-08-24', endDate: '2026-08-26' })
    })
    expect(screen.queryByLabelText('Start date for WOSMVP-100')).not.toBeInTheDocument()
  })

  // Ticket 03 (.scratch/atlas-planning-tab): just the wiring - the Gantt
  // chart's own rendering/drag/leave-shading behavior (which requires
  // mocking @svar-ui/react-gantt for jsdom, same as SprintGanttChart's own
  // PlanningView never clicking its Gantt trigger in PlanningView.test.tsx)
  // is covered in depth by AtlasPlanningGanttChart.test.tsx instead. This
  // only checks the trigger button renders in the header action row -
  // opening it here would instantiate the real, un-mocked SVAR chart.
  it('renders a Gantt chart trigger button in the header action row', async () => {
    entriesData = [{ _id: 'e1', rosterMemberId: 'm1', taskId: 't1', jiraKey: 'WOSMVP-100', order: 0, startDate: null, endDate: null }]
    stubFetch()
    render(<AtlasPlanningView />)
    await waitFor(() => expect(screen.getByRole('button', { name: 'Gantt chart' })).toBeInTheDocument())
  })
})
