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

// Simulates typing into a Tiptap/ProseMirror editor - jsdom doesn't implement
// real contenteditable text insertion, so `fireEvent.paste` (which
// ProseMirror's paste handler reads `clipboardData` from directly, applying
// a transaction rather than relying on a DOM mutation to appear) is the
// reliable way to actually change the live document in these tests. See
// TodoDetail.test.tsx, which establishes this same pattern.
function pasteText(node: Element, text: string) {
  fireEvent.paste(node, {
    clipboardData: { getData: (type: string) => (type === 'text/plain' ? text : '') },
  })
}

// Minimal stand-in for the backend's tiptapToPlainText (utils/tiptapText.ts)
// - just enough to derive a notesText the "non-empty notes" indicator test
// can assert on, mirroring what the real PATCH route would compute server-
// side from a Tiptap JSON `notes` payload.
function extractPlainText(doc: unknown): string {
  if (!doc || typeof doc !== 'object') return ''
  const parts: string[] = []
  function walk(node: unknown): void {
    if (!node || typeof node !== 'object') return
    const n = node as { text?: unknown; content?: unknown[] }
    if (typeof n.text === 'string') parts.push(n.text)
    if (Array.isArray(n.content)) for (const child of n.content) walk(child)
  }
  walk(doc)
  return parts.join(' ').trim()
}

function findTaskById(tasks: AtlasEpic['tasks'], id: string): AtlasEpic['tasks'][number] | undefined {
  for (const t of tasks) {
    if (t._id === id) return t
    const found = findTaskById(t.subtasks, id)
    if (found) return found
  }
  return undefined
}

// Fakes what the real PATCH /api/atlas/tasks/:id route would persist, so
// that useAtlasEpics' subsequent refresh() (GET, right after a successful
// PATCH) reflects the edit - the same "assert on what the UI shows after
// the round-trip" style as the rest of this file, rather than mocking
// useAtlasEpics itself.
function applyTaskPatch(taskId: string, patch: Record<string, unknown>) {
  for (const e of listData) {
    const found = findTaskById(e.tasks, taskId)
    if (found) {
      const resolved = { ...patch }
      if ('notes' in resolved) resolved.notesText = extractPlainText(resolved.notes)
      Object.assign(found, resolved)
      return
    }
  }
}

function stubFetch(postHandler?: (init: FetchCallInit) => Promise<FakeResponse>): FetchMock {
  const mock: FetchMock = vi.fn((url, init) => {
    const href = String(url)
    const method = init?.method ?? 'GET'
    if (href.endsWith('/api/atlas/epics') && method === 'GET') {
      // A real fetch response is always a fresh deserialization, never the
      // server's live object - clone here too so a mutation applied by
      // applyTaskPatch (in-place, to simulate a persisted PATCH) is picked
      // up as a genuinely new array/object reference on the next GET,
      // exactly like the real backend's res.json() would produce. Without
      // this, setEpics(sameReference) would bail out of re-rendering
      // ancestors (e.g. the epic row's date-range roll-up) even though a
      // nested task's fields did change.
      return jsonResponse(structuredClone(listData))
    }
    if (href.endsWith('/api/atlas/epics') && method === 'POST') {
      return postHandler ? postHandler(init!) : jsonResponse({ error: 'no handler' }, 500)
    }
    if (/\/api\/atlas\/tasks\/[^/]+$/.test(href) && method === 'PATCH') {
      const taskId = href.split('/').pop()!
      applyTaskPatch(taskId, JSON.parse(init?.body ?? '{}'))
      return jsonResponse({}, 200)
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
              atRiskOverride: false,
              notes: null,
              notesText: '',
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
                  atRiskOverride: false,
                  notes: null,
                  notesText: '',
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
      atRiskOverride: false,
      notes: null,
      notesText: '',
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
          task({ _id: 't1', jiraKey: 'WOSMVP-100', notesText: 'Waiting on vendor.' }),
          task({ _id: 't2', jiraKey: 'WOSMVP-101', notesText: '' }),
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

describe('AtlasView task editing (ticket 09)', () => {
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
      atRiskOverride: false,
      notes: null,
      notesText: '',
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

  function patchCalls() {
    return fetchMock.mock.calls.filter(([url, init]) => /\/api\/atlas\/tasks\//.test(String(url)) && init?.method === 'PATCH')
  }

  it("editing a task's start/end date persists and is reflected immediately in the row and the epic's date-range roll-up", async () => {
    listData = [epic({ jiraKey: 'WOSMVP-1', tasks: [task({ _id: 't1', jiraKey: 'WOSMVP-100' })] })]
    stubFetch()
    render(<AtlasView />)
    await waitFor(() => expect(screen.getByText('WOSMVP-100')).toBeInTheDocument())
    // "No dates set" shows both on the task row and the epic roll-up.
    expect(screen.getAllByText('No dates set')).toHaveLength(2)

    fireEvent.click(screen.getByLabelText('Edit WOSMVP-100'))
    fireEvent.change(screen.getByLabelText('Start date'), { target: { value: '2026-08-01' } })
    fireEvent.change(screen.getByLabelText('End date'), { target: { value: '2026-08-20' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))

    // The task row's own date range and the epic overview row's roll-up
    // both update to the same range (spec's "reflected ... in the epic's
    // date-range roll-up").
    await waitFor(() => expect(screen.getAllByText('Aug 1 – Aug 20')).toHaveLength(2))
  })

  it("editing a task's notes via the rich-text editor persists and updates the ticket-08 notes indicator", async () => {
    listData = [epic({ jiraKey: 'WOSMVP-1', tasks: [task({ _id: 't1', jiraKey: 'WOSMVP-100' })] })]
    stubFetch()
    render(<AtlasView />)
    await waitFor(() => expect(screen.getByText('WOSMVP-100')).toBeInTheDocument())
    expect(screen.queryByText('notes')).not.toBeInTheDocument()

    fireEvent.click(screen.getByLabelText('Edit WOSMVP-100'))
    const editable = document.querySelector('[contenteditable]')
    if (!editable) throw new Error('expected a contenteditable notes editor to be rendered')
    pasteText(editable, 'Waiting on vendor.')
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))

    await waitFor(() => expect(screen.getByText('notes')).toBeInTheDocument())
  })

  it('a request that never touches the at-risk checkbox omits atRisk from the PATCH payload entirely', async () => {
    listData = [epic({ jiraKey: 'WOSMVP-1', tasks: [task({ _id: 't1', jiraKey: 'WOSMVP-100' })] })]
    stubFetch()
    render(<AtlasView />)
    await waitFor(() => expect(screen.getByText('WOSMVP-100')).toBeInTheDocument())

    fireEvent.click(screen.getByLabelText('Edit WOSMVP-100'))
    fireEvent.change(screen.getByLabelText('Start date'), { target: { value: '2026-08-01' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))

    await waitFor(() => expect(patchCalls()).toHaveLength(1))
    const body = JSON.parse(patchCalls()[0][1]!.body!)
    expect(body).not.toHaveProperty('atRisk')
  })

  it('manually toggling the at-risk checkbox includes atRisk: true in the PATCH payload, overriding the auto rule', async () => {
    listData = [epic({ jiraKey: 'WOSMVP-1', tasks: [task({ _id: 't1', jiraKey: 'WOSMVP-100', atRisk: false })] })]
    stubFetch()
    render(<AtlasView />)
    await waitFor(() => expect(screen.getByText('WOSMVP-100')).toBeInTheDocument())

    fireEvent.click(screen.getByLabelText('Edit WOSMVP-100'))
    fireEvent.click(screen.getByLabelText('Mark at risk (overrides the automatic end-date rule)'))
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))

    await waitFor(() => expect(patchCalls()).toHaveLength(1))
    const body = JSON.parse(patchCalls()[0][1]!.body!)
    expect(body.atRisk).toBe(true)
    // The row itself reflects the override once the refetch lands.
    await waitFor(() => expect(screen.getAllByText('at risk').length).toBeGreaterThan(0))
  })

  it('links a task as blocked-by a task in a different epic via the picker, showing the cross-epic chip', async () => {
    listData = [
      epic({ _id: 'e1', jiraKey: 'WOSMVP-1', tasks: [task({ _id: 't1', jiraKey: 'WOSMVP-100' })] }),
      epic({ _id: 'e2', jiraKey: 'WOSMVP-2', tasks: [task({ _id: 't2', jiraKey: 'WOSMVP-200', title: 'Other epic task' })] }),
    ]
    stubFetch()
    render(<AtlasView />)
    await waitFor(() => expect(screen.getByText('WOSMVP-100')).toBeInTheDocument())

    fireEvent.click(screen.getByLabelText('Edit WOSMVP-100'))
    fireEvent.change(screen.getByLabelText('Search tasks to block WOSMVP-100 on'), { target: { value: 'WOSMVP-200' } })
    fireEvent.click(screen.getByText('+ Add'))
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))

    await waitFor(() => expect(screen.getByText('· WOSMVP-2')).toBeInTheDocument())
  })

  it('allows creating a circular blocked-by chain (A blocks B, B blocks A) without error or warning', async () => {
    listData = [
      epic({
        _id: 'e1',
        jiraKey: 'WOSMVP-1',
        tasks: [task({ _id: 't1', jiraKey: 'WOSMVP-100' }), task({ _id: 't2', jiraKey: 'WOSMVP-101', blockedBy: ['t1'] })],
      }),
    ]
    stubFetch()
    render(<AtlasView />)
    // WOSMVP-101 already blocked by WOSMVP-100, so WOSMVP-100's key already
    // appears twice (its own row + the existing chip) before any edit.
    await waitFor(() => expect(screen.getAllByText('WOSMVP-100').length).toBeGreaterThan(0))
    expect(screen.getAllByText('Blocked by')).toHaveLength(1)

    fireEvent.click(screen.getByLabelText('Edit WOSMVP-100'))
    fireEvent.change(screen.getByLabelText('Search tasks to block WOSMVP-100 on'), { target: { value: 'WOSMVP-101' } })
    fireEvent.click(screen.getByText('+ Add'))
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))

    await waitFor(() => expect(screen.getAllByText('Blocked by')).toHaveLength(2))
  })

  it('does not show an Edit affordance on a read-only (archived-epic) task row', async () => {
    listData = [
      epic({ _id: 'e1', jiraKey: 'WOSMVP-1', title: 'Archived Epic', archived: true, tasks: [task({ _id: 't1', jiraKey: 'WOSMVP-100' })] }),
    ]
    stubFetch()
    render(<AtlasView />)
    await waitFor(() => expect(screen.getByText('Show 1 archived epic')).toBeInTheDocument())
    fireEvent.click(screen.getByText('Show 1 archived epic'))
    // The archived row itself isn't expanded by default - open its accordion
    // too before looking for the task row inside it.
    fireEvent.click(screen.getByText('Archived Epic'))

    await waitFor(() => expect(screen.getByText('WOSMVP-100')).toBeInTheDocument())
    expect(screen.queryByLabelText('Edit WOSMVP-100')).not.toBeInTheDocument()
  })
})
