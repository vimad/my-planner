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
let fetchMock: FetchMock
let nextEntryId: number

function stubFetch(postHandler?: (init: FetchCallInit) => Promise<FakeResponse>): FetchMock {
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
    if (href.endsWith('/api/atlas-planning-entries') && method === 'POST') {
      if (postHandler) return postHandler(init!)
      const body = JSON.parse(init?.body ?? '{}')
      const created: AtlasPlanningEntry = {
        _id: `e${nextEntryId++}`,
        rosterMemberId: body.rosterMemberId,
        jiraKey: body.jiraKey,
        startDate: null,
        endDate: null,
      }
      entriesData = [...entriesData, created]
      return jsonResponse(created, 201)
    }
    if (/\/api\/atlas-planning-entries\/[^/]+$/.test(href) && method === 'PATCH') {
      const id = href.split('/').pop()!
      const body = JSON.parse(init?.body ?? '{}')
      const found = entriesData.find((e) => e._id === id)
      if (!found) return jsonResponse({ error: 'Planning entry not found' }, 404)
      Object.assign(found, body)
      return jsonResponse(found, 200)
    }
    if (/\/api\/atlas-planning-entries\/[^/]+$/.test(href) && method === 'DELETE') {
      const id = href.split('/').pop()!
      const found = entriesData.find((e) => e._id === id)
      if (!found) return jsonResponse({ error: 'Planning entry not found' }, 404)
      entriesData = entriesData.filter((e) => e._id !== id)
      return Promise.resolve({ ok: true, status: 204, json: () => Promise.resolve(undefined) })
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
    nextEntryId = 1
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('shows an empty-roster message and no attach form when the roster has no members', async () => {
    rosterData = []
    stubFetch()
    render(<AtlasPlanningView />)

    await waitFor(() => expect(screen.getByText(/No one on the Atlas roster yet/)).toBeInTheDocument())
    expect(screen.queryByLabelText('Person to attach ticket to')).not.toBeInTheDocument()
  })

  it('renders one row per roster member in roster order, each starting with no tickets attached', async () => {
    stubFetch()
    render(<AtlasPlanningView />)

    await waitFor(() => expect(screen.getByRole('group', { name: 'People and their attached tickets' })).toBeInTheDocument())
    const table = screen.getByRole('group', { name: 'People and their attached tickets' })
    const names = within(table).getAllByText(/^(Alice|Bob)$/).map((el) => el.textContent)
    expect(names).toEqual(['Alice', 'Bob'])
    expect(within(table).getAllByText('No tickets attached')).toHaveLength(2)
  })

  it('requires a person to be picked before submitting', async () => {
    stubFetch()
    render(<AtlasPlanningView />)
    await waitFor(() => expect(screen.getByLabelText('Jira key to attach')).toBeInTheDocument())

    fireEvent.change(screen.getByLabelText('Jira key to attach'), { target: { value: '14802' } })
    fireEvent.click(screen.getByRole('button', { name: 'Attach' }))

    expect(screen.getByText('Pick a person')).toBeInTheDocument()
    expect(fetchMock).not.toHaveBeenCalledWith(expect.stringContaining('/api/atlas-planning-entries'), expect.objectContaining({ method: 'POST' }))
  })

  it('rejects a malformed Jira key before submitting', async () => {
    stubFetch()
    render(<AtlasPlanningView />)
    await waitFor(() => expect(screen.getByLabelText('Jira key to attach')).toBeInTheDocument())

    fireEvent.change(screen.getByLabelText('Person to attach ticket to'), { target: { value: 'm1' } })
    fireEvent.change(screen.getByLabelText('Jira key to attach'), { target: { value: 'not-a-key' } })
    fireEvent.click(screen.getByRole('button', { name: 'Attach' }))

    expect(screen.getByText('Enter a valid Jira key, e.g. WOSMVP-14802')).toBeInTheDocument()
    expect(fetchMock).not.toHaveBeenCalledWith(expect.stringContaining('/api/atlas-planning-entries'), expect.objectContaining({ method: 'POST' }))
  })

  it('attaches a ticket to the picked person, normalizing the key, and clears the input', async () => {
    stubFetch()
    render(<AtlasPlanningView />)
    await waitFor(() => expect(screen.getByLabelText('Jira key to attach')).toBeInTheDocument())

    fireEvent.change(screen.getByLabelText('Person to attach ticket to'), { target: { value: 'm1' } })
    fireEvent.change(screen.getByLabelText('Jira key to attach'), { target: { value: '14802' } })
    fireEvent.click(screen.getByRole('button', { name: 'Attach' }))

    await waitFor(() => expect(screen.getByText('WOSMVP-14802')).toBeInTheDocument())
    expect(screen.getByLabelText('Jira key to attach')).toHaveValue('')
    const aliceRow = screen.getByLabelText('Tickets for Alice')
    expect(within(aliceRow).getByText('WOSMVP-14802')).toBeInTheDocument()
    expect(within(aliceRow).getByText('WOSMVP-14802')).toHaveAttribute('href', 'https://wealthos.atlassian.net/browse/WOSMVP-14802')
  })

  it('removes an attached ticket from its person row', async () => {
    entriesData = [{ _id: 'e1', rosterMemberId: 'm1', jiraKey: 'WOSMVP-100', startDate: null, endDate: null }]
    stubFetch()
    render(<AtlasPlanningView />)
    await waitFor(() => expect(screen.getByText('WOSMVP-100')).toBeInTheDocument())

    fireEvent.click(screen.getByLabelText('Remove WOSMVP-100'))

    await waitFor(() => expect(screen.queryByText('WOSMVP-100')).not.toBeInTheDocument())
    const aliceRow = screen.getByLabelText('Tickets for Alice')
    expect(within(aliceRow).getByText('No tickets attached')).toBeInTheDocument()
  })

  it('reassigns an attached ticket to a different person via the badge picker', async () => {
    entriesData = [{ _id: 'e1', rosterMemberId: 'm1', jiraKey: 'WOSMVP-100', startDate: null, endDate: null }]
    stubFetch()
    render(<AtlasPlanningView />)
    await waitFor(() => expect(screen.getByText('WOSMVP-100')).toBeInTheDocument())

    const aliceRow = screen.getByLabelText('Tickets for Alice')
    fireEvent.click(within(aliceRow).getByLabelText('Reassign WOSMVP-100'))
    fireEvent.click(screen.getByRole('button', { name: 'Bob' }))

    await waitFor(() => {
      const bobRow = screen.getByLabelText('Tickets for Bob')
      expect(within(bobRow).getByText('WOSMVP-100')).toBeInTheDocument()
    })
    const aliceRowAfter = screen.getByLabelText('Tickets for Alice')
    expect(within(aliceRowAfter).getByText('No tickets attached')).toBeInTheDocument()
  })

  // Ticket 03 (.scratch/atlas-planning-tab): just the wiring - the Gantt
  // chart's own rendering/drag/leave-shading behavior (which requires
  // mocking @svar-ui/react-gantt for jsdom, same as SprintGanttChart's own
  // PlanningView never clicking its Gantt trigger in PlanningView.test.tsx)
  // is covered in depth by AtlasPlanningGanttChart.test.tsx instead. This
  // only checks the trigger button renders in the header action row -
  // opening it here would instantiate the real, un-mocked SVAR chart.
  it('renders a Gantt chart trigger button in the header action row', async () => {
    entriesData = [{ _id: 'e1', rosterMemberId: 'm1', jiraKey: 'WOSMVP-100', startDate: null, endDate: null }]
    stubFetch()
    render(<AtlasPlanningView />)
    await waitFor(() => expect(screen.getByRole('button', { name: 'Gantt chart' })).toBeInTheDocument())
  })

  it('surfaces a server-side attach error inline without clearing the input', async () => {
    stubFetch(async () => jsonResponse({ error: 'jiraKey is required' }, 400))
    render(<AtlasPlanningView />)
    await waitFor(() => expect(screen.getByLabelText('Jira key to attach')).toBeInTheDocument())

    fireEvent.change(screen.getByLabelText('Person to attach ticket to'), { target: { value: 'm1' } })
    fireEvent.change(screen.getByLabelText('Jira key to attach'), { target: { value: '14802' } })
    fireEvent.click(screen.getByRole('button', { name: 'Attach' }))

    await waitFor(() => expect(screen.getByText('Error: jiraKey is required')).toBeInTheDocument())
    expect(screen.getByLabelText('Jira key to attach')).toHaveValue('14802')
  })
})
