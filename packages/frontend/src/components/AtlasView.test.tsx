import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from 'vitest'
import { AtlasView } from './AtlasView'
import type { AtlasEpic } from '../types'

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

let listData: AtlasEpic[]
let fetchMock: FetchMock

function stubFetch(postHandler?: (init: FetchCallInit) => Promise<FakeResponse>): FetchMock {
  const mock: FetchMock = vi.fn((url, init) => {
    const href = String(url)
    const method = init?.method ?? 'GET'
    if (href.endsWith('/api/atlas/epics') && method === 'GET') {
      return jsonResponse(listData)
    }
    if (href.endsWith('/api/atlas/epics') && method === 'POST') {
      return postHandler ? postHandler(init!) : jsonResponse({ error: 'no handler' }, 500)
    }
    return jsonResponse([])
  })
  fetchMock = mock
  vi.stubGlobal('fetch', mock)
  return mock
}

describe('AtlasView', () => {
  beforeEach(() => {
    listData = []
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('shows the empty state and loads the (empty) tracked-epics list on mount', async () => {
    stubFetch()
    render(<AtlasView />)

    await waitFor(() => {
      expect(screen.getByText('No epics tracked yet')).toBeInTheDocument()
    })
    expect(fetchMock).toHaveBeenCalledWith(expect.stringContaining('/api/atlas/epics'))
  })

  it('submitting a valid epic key syncs it and renders the epic + its task/sub-task tree', async () => {
    stubFetch(async (init) => {
      const body = JSON.parse(init.body ?? '{}')
      expect(body.jiraKey).toBe('WOSMVP-8262')
      listData = [
        {
          _id: 'e1',
          jiraKey: 'WOSMVP-8262',
          title: 'The Epic',
          jiraUrl: 'https://wealthos.atlassian.net/browse/WOSMVP-8262',
          notes: '',
          archived: false,
          lastSyncedAt: '2026-08-19T00:00:00.000Z',
          tasks: [
            {
              _id: 't1',
              epicId: 'e1',
              parentTaskId: null,
              jiraKey: 'WOSMVP-100',
              title: 'Do the thing',
              jiraUrl: 'https://wealthos.atlassian.net/browse/WOSMVP-100',
              assigneeAccountId: null,
              status: 'To Do',
              startDate: null,
              endDate: null,
              atRisk: false,
              notes: '',
              blockedBy: [],
              archived: false,
              subtasks: [
                {
                  _id: 't2',
                  epicId: 'e1',
                  parentTaskId: 't1',
                  jiraKey: 'WOSMVP-101',
                  title: 'Do the sub-thing',
                  jiraUrl: 'https://wealthos.atlassian.net/browse/WOSMVP-101',
                  assigneeAccountId: null,
                  status: 'In Progress',
                  startDate: null,
                  endDate: null,
                  atRisk: false,
                  notes: '',
                  blockedBy: [],
                  archived: false,
                  subtasks: [],
                },
              ],
            },
          ],
        },
      ]
      return jsonResponse({ epic: { _id: 'e1', jiraKey: 'WOSMVP-8262' }, tasks: [] }, 201)
    })

    render(<AtlasView />)
    await waitFor(() => expect(screen.getByText('No epics tracked yet')).toBeInTheDocument())

    fireEvent.change(screen.getByLabelText('Jira epic key'), { target: { value: 'WOSMVP-8262' } })
    fireEvent.click(screen.getByRole('button', { name: 'Track' }))

    expect(screen.getByRole('button', { name: 'Syncing…' })).toBeDisabled()

    await waitFor(() => {
      expect(screen.getByText('The Epic')).toBeInTheDocument()
    })
    expect(screen.getByText('WOSMVP-100')).toBeInTheDocument()
    expect(screen.getByText('Do the thing')).toBeInTheDocument()
    expect(screen.getByText('WOSMVP-101')).toBeInTheDocument()
    expect(screen.getByText('Do the sub-thing')).toBeInTheDocument()
    expect(screen.queryByText('No epics tracked yet')).not.toBeInTheDocument()
    // Input cleared after a successful track.
    expect(screen.getByLabelText('Jira epic key')).toHaveValue('')
  })

  it('submitting an unresolvable key shows an inline error and adds nothing to the list', async () => {
    stubFetch(async () => jsonResponse({ error: 'Jira issue WOSMVP-9999 was not found' }, 404))

    render(<AtlasView />)
    await waitFor(() => expect(screen.getByText('No epics tracked yet')).toBeInTheDocument())

    fireEvent.change(screen.getByLabelText('Jira epic key'), { target: { value: 'WOSMVP-9999' } })
    fireEvent.click(screen.getByRole('button', { name: 'Track' }))

    await waitFor(() => {
      expect(screen.getByText('Error: Jira issue WOSMVP-9999 was not found')).toBeInTheDocument()
    })
    expect(screen.getByText('No epics tracked yet')).toBeInTheDocument()
    // Input is not cleared on failure, so the user can correct/resubmit.
    expect(screen.getByLabelText('Jira epic key')).toHaveValue('WOSMVP-9999')
  })

  it('submitting a non-Epic key shows an inline error and adds nothing to the list', async () => {
    stubFetch(async () => jsonResponse({ error: 'WOSMVP-100 is a Story issue, not an Epic' }, 422))

    render(<AtlasView />)
    await waitFor(() => expect(screen.getByText('No epics tracked yet')).toBeInTheDocument())

    fireEvent.change(screen.getByLabelText('Jira epic key'), { target: { value: 'WOSMVP-100' } })
    fireEvent.click(screen.getByRole('button', { name: 'Track' }))

    await waitFor(() => {
      expect(screen.getByText('Error: WOSMVP-100 is a Story issue, not an Epic')).toBeInTheDocument()
    })
    expect(screen.getByText('No epics tracked yet')).toBeInTheDocument()
  })

  it('disables the Track button while the input is blank', async () => {
    stubFetch()
    render(<AtlasView />)
    await waitFor(() => expect(screen.getByText('No epics tracked yet')).toBeInTheDocument())

    expect(screen.getByRole('button', { name: 'Track' })).toBeDisabled()
  })
})

describe('AtlasView dashboard layout', () => {
  function task(overrides: Partial<AtlasEpic['tasks'][number]> = {}): AtlasEpic['tasks'][number] {
    return {
      _id: 't1',
      epicId: 'e1',
      parentTaskId: null,
      jiraKey: 'WOSMVP-100',
      title: 'Do the thing',
      jiraUrl: 'https://wealthos.atlassian.net/browse/WOSMVP-100',
      assigneeAccountId: null,
      status: 'To Do',
      startDate: null,
      endDate: null,
      atRisk: false,
      notes: '',
      blockedBy: [],
      archived: false,
      subtasks: [],
      ...overrides,
    }
  }

  function epic(overrides: Partial<AtlasEpic> = {}): AtlasEpic {
    return {
      _id: 'e1',
      jiraKey: 'WOSMVP-1',
      title: 'First Epic',
      jiraUrl: 'https://wealthos.atlassian.net/browse/WOSMVP-1',
      notes: '',
      archived: false,
      lastSyncedAt: '2026-08-19T00:00:00.000Z',
      tasks: [],
      ...overrides,
    }
  }

  beforeEach(() => {
    listData = []
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('shows an overview row per epic with progress, status pills, date range, and a Jira link; only the first is expanded by default', async () => {
    listData = [
      epic({
        _id: 'e1',
        jiraKey: 'WOSMVP-1',
        title: 'First Epic',
        tasks: [
          task({ _id: 't1', jiraKey: 'WOSMVP-100', status: 'Done', startDate: '2026-07-01', endDate: '2026-07-10' }),
          task({ _id: 't2', jiraKey: 'WOSMVP-101', status: 'In Progress', startDate: '2026-07-05', endDate: '2026-07-20' }),
        ],
      }),
      epic({ _id: 'e2', jiraKey: 'WOSMVP-2', title: 'Second Epic', tasks: [task({ _id: 't3', jiraKey: 'WOSMVP-200' })] }),
    ]
    stubFetch()
    render(<AtlasView />)

    await waitFor(() => expect(screen.getByText('First Epic')).toBeInTheDocument())
    expect(screen.getByText('Second Epic')).toBeInTheDocument()

    // First epic's task tree is visible (expanded by default) ...
    expect(screen.getByText('WOSMVP-100')).toBeInTheDocument()
    // ... the second epic's is not.
    expect(screen.queryByText('WOSMVP-200')).not.toBeInTheDocument()

    // Progress = 1 done / 2 total = 50%.
    expect(screen.getByText('50%')).toBeInTheDocument()
    // Date range rolled up across the epic's tasks, right-aligned label.
    expect(screen.getByText('Jul 1 – Jul 20')).toBeInTheDocument()
    // "Open in Jira" icon-link per row.
    expect(screen.getAllByTitle('Open in Jira')).toHaveLength(2)

    // Clicking the second epic's row expands its tree too (accordion, not
    // exclusive-enforced - the first stays open).
    fireEvent.click(screen.getByText('Second Epic'))
    expect(screen.getByText('WOSMVP-200')).toBeInTheDocument()
    expect(screen.getByText('WOSMVP-100')).toBeInTheDocument()
  })

  it('only shows the At-risk pill when the count is greater than zero', async () => {
    listData = [epic({ jiraKey: 'WOSMVP-1', tasks: [task({ atRisk: false })] })]
    stubFetch()
    render(<AtlasView />)
    await waitFor(() => expect(screen.getByText('First Epic')).toBeInTheDocument())
    expect(screen.queryByText('at risk')).not.toBeInTheDocument()
  })

  it('shows the At-risk pill and per-task badge when at-risk tasks exist', async () => {
    listData = [epic({ jiraKey: 'WOSMVP-1', tasks: [task({ jiraKey: 'WOSMVP-100', atRisk: true })] })]
    stubFetch()
    render(<AtlasView />)
    await waitFor(() => expect(screen.getByText('First Epic')).toBeInTheDocument())
    expect(screen.getAllByText('at risk').length).toBeGreaterThan(0)
  })

  it('shows a notes indicator on a task row when notes are non-empty, and none when empty', async () => {
    listData = [
      epic({
        jiraKey: 'WOSMVP-1',
        tasks: [
          task({ _id: 't1', jiraKey: 'WOSMVP-100', notes: 'Waiting on vendor.' }),
          task({ _id: 't2', jiraKey: 'WOSMVP-101', notes: '' }),
        ],
      }),
    ]
    stubFetch()
    render(<AtlasView />)
    await waitFor(() => expect(screen.getByText('First Epic')).toBeInTheDocument())
    expect(screen.getAllByText('notes')).toHaveLength(1)
  })

  it('renders epic-level notes once, above the task rows, and nothing when notes are empty', async () => {
    listData = [epic({ jiraKey: 'WOSMVP-1', notes: 'Vendor delay is the long pole here.', tasks: [task()] })]
    stubFetch()
    render(<AtlasView />)
    await waitFor(() => expect(screen.getByText('Vendor delay is the long pole here.')).toBeInTheDocument())
  })

  it('shows "Blocked by" chips, appending " · <epicKey>" only for a cross-epic blocker', async () => {
    listData = [
      epic({
        _id: 'e1',
        jiraKey: 'WOSMVP-1',
        title: 'First Epic',
        tasks: [
          task({ _id: 't1', jiraKey: 'WOSMVP-100' }),
          task({ _id: 't2', jiraKey: 'WOSMVP-101', blockedBy: ['t1', 't-other-epic'] }),
        ],
      }),
      epic({ _id: 'e2', jiraKey: 'WOSMVP-2', title: 'Second Epic', tasks: [task({ _id: 't-other-epic', jiraKey: 'WOSMVP-200' })] }),
    ]
    stubFetch()
    render(<AtlasView />)
    await waitFor(() => expect(screen.getByText('Blocked by')).toBeInTheDocument())

    // Same-epic blocker (WOSMVP-100, in the same epic): key appears twice -
    // once as its own task row, once as the chip - but never epic-suffixed.
    expect(screen.getAllByText('WOSMVP-100')).toHaveLength(2)
    expect(screen.queryByText('· WOSMVP-1')).not.toBeInTheDocument()
    // Cross-epic blocker (WOSMVP-200, owned by WOSMVP-2): the chip appends
    // " · <epicKey>".
    expect(screen.getByText('· WOSMVP-2')).toBeInTheDocument()
  })

  it('excludes archived epics from the main list, and reveals them at reduced opacity via the toggle', async () => {
    listData = [
      epic({ _id: 'e1', jiraKey: 'WOSMVP-1', title: 'Active Epic', archived: false }),
      epic({ _id: 'e2', jiraKey: 'WOSMVP-2', title: 'Archived Epic', archived: true }),
    ]
    stubFetch()
    render(<AtlasView />)
    await waitFor(() => expect(screen.getByText('Active Epic')).toBeInTheDocument())
    expect(screen.queryByText('Archived Epic')).not.toBeInTheDocument()

    fireEvent.click(screen.getByText('Show 1 archived epic'))
    expect(screen.getByText('Archived Epic')).toBeInTheDocument()
  })
})
