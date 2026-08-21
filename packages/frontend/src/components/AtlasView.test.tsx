import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
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

// AtlasTaskBoard.tsx (mounted above the epic list, collapsed by default like
// the epic accordion below it) can also render a leaf task's jiraKey/title
// once expanded - a jiraKey/title query that must resolve to exactly the
// accordion row (or assert the accordion specifically doesn't show one)
// needs scoping to just the "Tracked epics" group (AtlasView.tsx's
// aria-label) to avoid colliding with the board's own card.
function epicsRegion() {
  return within(screen.getByRole('group', { name: 'Tracked epics' }))
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

// Ticket 10's epic-level PATCH equivalent of applyTaskPatch above.
function applyEpicPatch(epicId: string, patch: Record<string, unknown>) {
  const found = listData.find((e) => (e._id ?? e.id) === epicId)
  if (!found) return
  const resolved = { ...patch }
  if ('notes' in resolved) resolved.notesText = extractPlainText(resolved.notes)
  Object.assign(found, resolved)
}

function stubFetch(
  postHandler?: (init: FetchCallInit) => Promise<FakeResponse>,
  // Ticket 10's "Sync now"/"Sync all" - a test that cares what a resync
  // actually changes (new/removed/reparented tasks) passes a handler here to
  // mutate `listData` before the next GET reflects it; most tests only care
  // that the button called the right endpoint and triggered a refetch, so
  // this defaults to a no-op 200.
  syncHandler?: (epicId: string) => void,
): FetchMock {
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
    if (/\/api\/atlas\/epics\/[^/]+$/.test(href) && method === 'PATCH') {
      const epicId = href.split('/').pop()!
      applyEpicPatch(epicId, JSON.parse(init?.body ?? '{}'))
      return jsonResponse({}, 200)
    }
    if (/\/api\/atlas\/epics\/[^/]+\/sync$/.test(href) && method === 'POST') {
      const epicId = href.split('/').slice(-2, -1)[0]!
      syncHandler?.(epicId)
      return jsonResponse({}, 200)
    }
    if (href.endsWith('/api/atlas/epics/sync-all') && method === 'POST') {
      for (const e of listData) syncHandler?.(e._id ?? e.id ?? '')
      return jsonResponse({ synced: [], errors: [] }, 200)
    }
    if (/\/api\/atlas\/epics\/[^/]+$/.test(href) && method === 'DELETE') {
      const epicId = href.split('/').pop()!
      const found = listData.find((e) => (e._id ?? e.id) === epicId)
      if (!found) return jsonResponse({ error: 'Epic not found' }, 404)
      if (!found.archived) return jsonResponse({ error: 'Only archived epics can be deleted' }, 400)
      listData = listData.filter((e) => (e._id ?? e.id) !== epicId)
      return Promise.resolve({ ok: true, status: 204, json: () => Promise.resolve(undefined) })
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
          notes: null,
          notesText: '',
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

    fireEvent.change(screen.getByLabelText('Epic number to track'), { target: { value: 'WOSMVP-8262' } })
    fireEvent.click(screen.getByRole('button', { name: 'Track' }))

    expect(screen.getByRole('button', { name: 'Syncing…' })).toBeDisabled()

    await waitFor(() => {
      expect(screen.getByText('The Epic')).toBeInTheDocument()
    })
    // The epic row starts collapsed (accordion, not auto-expanded) - open it
    // to reach WOSMVP-100's own row, then its own sub-task toggle (also
    // collapsed by default) to reach WOSMVP-101.
    fireEvent.click(screen.getByText('The Epic'))
    expect(screen.getByText('WOSMVP-100')).toBeInTheDocument()
    expect(screen.getByText('Do the thing')).toBeInTheDocument()
    fireEvent.click(screen.getByLabelText('Expand WOSMVP-100'))
    expect(screen.getByText('WOSMVP-101')).toBeInTheDocument()
    expect(screen.getByText('Do the sub-thing')).toBeInTheDocument()
    expect(screen.queryByText('No epics tracked yet')).not.toBeInTheDocument()
    // Input cleared after a successful track.
    expect(screen.getByLabelText('Epic number to track')).toHaveValue('')
  })

  it('submitting an unresolvable key shows an inline error and adds nothing to the list', async () => {
    stubFetch(async () => jsonResponse({ error: 'Jira issue WOSMVP-9999 was not found' }, 404))

    render(<AtlasView />)
    await waitFor(() => expect(screen.getByText('No epics tracked yet')).toBeInTheDocument())

    fireEvent.change(screen.getByLabelText('Epic number to track'), { target: { value: 'WOSMVP-9999' } })
    fireEvent.click(screen.getByRole('button', { name: 'Track' }))

    await waitFor(() => {
      expect(screen.getByText('Error: Jira issue WOSMVP-9999 was not found')).toBeInTheDocument()
    })
    expect(screen.getByText('No epics tracked yet')).toBeInTheDocument()
    // Input is not cleared on failure, so the user can correct/resubmit.
    expect(screen.getByLabelText('Epic number to track')).toHaveValue('WOSMVP-9999')
  })

  it('submitting a non-Epic key shows an inline error and adds nothing to the list', async () => {
    stubFetch(async () => jsonResponse({ error: 'WOSMVP-100 is a Story issue, not an Epic' }, 422))

    render(<AtlasView />)
    await waitFor(() => expect(screen.getByText('No epics tracked yet')).toBeInTheDocument())

    fireEvent.change(screen.getByLabelText('Epic number to track'), { target: { value: 'WOSMVP-100' } })
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
      notes: null,
      notesText: '',
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

  it('shows an overview row per epic with progress, status pills, date range, and a Jira link; both start collapsed until clicked', async () => {
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

    // Both epics start collapsed - neither's accordion row shows its tasks
    // yet (scoped to the "Tracked epics" group since AtlasTaskBoard already
    // shows every leaf task's key unconditionally, above this list).
    expect(epicsRegion().queryByText('WOSMVP-100')).not.toBeInTheDocument()
    expect(epicsRegion().queryByText('WOSMVP-200')).not.toBeInTheDocument()

    // Progress = 1 done / 2 total = 50%.
    expect(screen.getByText('50%')).toBeInTheDocument()
    // Date range rolled up across the epic's tasks, right-aligned label.
    expect(screen.getByText('Jul 1 – Jul 20')).toBeInTheDocument()
    // "Open in Jira" icon-link per row - scoped to "Tracked epics" since
    // AtlasTaskBoard's own leaf-task cards each carry the same title too.
    expect(epicsRegion().getAllByTitle('Open in Jira')).toHaveLength(2)

    // Clicking the first epic's row expands its tree ...
    fireEvent.click(screen.getByText('First Epic'))
    expect(epicsRegion().getByText('WOSMVP-100')).toBeInTheDocument()
    expect(epicsRegion().queryByText('WOSMVP-200')).not.toBeInTheDocument()

    // ... and clicking the second expands its tree too (accordion, not
    // exclusive-enforced - the first stays open).
    fireEvent.click(screen.getByText('Second Epic'))
    expect(epicsRegion().getByText('WOSMVP-200')).toBeInTheDocument()
    expect(epicsRegion().getByText('WOSMVP-100')).toBeInTheDocument()
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
    // The per-task "at risk" badge only renders once the epic's accordion is
    // open.
    fireEvent.click(screen.getByText('First Epic'))
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
    // The notes indicator only renders once the epic's accordion is open.
    fireEvent.click(screen.getByText('First Epic'))
    expect(screen.getAllByText('notes')).toHaveLength(1)
  })

  it('renders epic-level notes once, above the task rows, and nothing when notes are empty', async () => {
    listData = [epic({ jiraKey: 'WOSMVP-1', notesText: 'Vendor delay is the long pole here.', tasks: [task()] })]
    stubFetch()
    render(<AtlasView />)
    await waitFor(() => expect(screen.getByText('First Epic')).toBeInTheDocument())
    // Epic notes render inside the accordion, below the epic row itself.
    fireEvent.click(screen.getByText('First Epic'))
    expect(screen.getByText('Vendor delay is the long pole here.')).toBeInTheDocument()
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
    await waitFor(() => expect(screen.getByText('First Epic')).toBeInTheDocument())
    // "Blocked by" only renders once the epic's accordion is open.
    fireEvent.click(screen.getByText('First Epic'))
    expect(screen.getByText('Blocked by')).toBeInTheDocument()

    // Same-epic blocker (WOSMVP-100, in the same epic): key appears twice
    // within the accordion - once as its own task row, once as the chip -
    // but never epic-suffixed. Scoped to "Tracked epics" since
    // AtlasTaskBoard's own leaf-task card is a third, unrelated match.
    expect(epicsRegion().getAllByText('WOSMVP-100')).toHaveLength(2)
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
      notes: null,
      notesText: '',
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
    // The accordion row (needed for "No dates set" and the Edit affordance
    // below) is collapsed until clicked.
    await waitFor(() => expect(screen.getByText('First Epic')).toBeInTheDocument())
    fireEvent.click(screen.getByText('First Epic'))
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
    await waitFor(() => expect(screen.getByText('First Epic')).toBeInTheDocument())
    expect(screen.queryByText('notes')).not.toBeInTheDocument()

    // Open the epic's accordion to reach the Edit affordance.
    fireEvent.click(screen.getByText('First Epic'))
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
    await waitFor(() => expect(screen.getByText('First Epic')).toBeInTheDocument())

    fireEvent.click(screen.getByText('First Epic'))
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
    await waitFor(() => expect(screen.getByText('First Epic')).toBeInTheDocument())

    fireEvent.click(screen.getByText('First Epic'))
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
    await waitFor(() => expect(epicsRegion().getByText('WOSMVP-1')).toBeInTheDocument())

    // Both epics default their title to "First Epic" here (unoverridden) -
    // target e1's own jiraKey to expand just it.
    fireEvent.click(epicsRegion().getByText('WOSMVP-1'))
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
    await waitFor(() => expect(screen.getByText('First Epic')).toBeInTheDocument())
    // Open the epic's accordion - "Blocked by" only renders there.
    fireEvent.click(screen.getByText('First Epic'))
    // WOSMVP-101 already blocked by WOSMVP-100, so WOSMVP-100's key already
    // appears twice within the accordion (its own row + the existing chip)
    // before any edit.
    expect(epicsRegion().getAllByText('WOSMVP-100')).toHaveLength(2)
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

describe('AtlasView epic lifecycle (ticket 10)', () => {
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
      notes: null,
      notesText: '',
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

  it("editing an epic's notes persists and shows on its Dashboard row", async () => {
    listData = [epic({ jiraKey: 'WOSMVP-1', title: 'First Epic' })]
    stubFetch()
    render(<AtlasView />)
    await waitFor(() => expect(screen.getByText('First Epic')).toBeInTheDocument())
    // EpicNotesEditor only renders once the epic's accordion is open.
    fireEvent.click(screen.getByText('First Epic'))
    expect(screen.getByText('No epic notes yet.')).toBeInTheDocument()

    fireEvent.click(screen.getByLabelText('Edit WOSMVP-1 notes'))
    const editable = document.querySelector('[contenteditable]')
    if (!editable) throw new Error('expected a contenteditable notes editor to be rendered')
    pasteText(editable, 'Vendor delay is the long pole here.')
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))

    await waitFor(() => expect(screen.getByText('Vendor delay is the long pole here.')).toBeInTheDocument())
  })

  it("'Sync now' on a single epic hits its own resync endpoint and refreshes the list, without touching other epics", async () => {
    listData = [
      epic({ _id: 'e1', jiraKey: 'WOSMVP-1', title: 'First Epic' }),
      epic({ _id: 'e2', jiraKey: 'WOSMVP-2', title: 'Second Epic' }),
    ]
    const syncedEpicIds: string[] = []
    stubFetch(undefined, (epicId) => {
      syncedEpicIds.push(epicId)
      const found = listData.find((e) => e._id === epicId)
      if (found) found.title = `${found.title} (synced)`
    })
    render(<AtlasView />)
    await waitFor(() => expect(screen.getByText('First Epic')).toBeInTheDocument())

    fireEvent.click(screen.getByLabelText('Sync WOSMVP-1 now'))

    await waitFor(() => expect(screen.getByText('First Epic (synced)')).toBeInTheDocument())
    expect(syncedEpicIds).toEqual(['e1'])
    expect(screen.getByText('Second Epic')).toBeInTheDocument()
  })

  it("a global 'Sync all' resyncs every tracked epic", async () => {
    listData = [
      epic({ _id: 'e1', jiraKey: 'WOSMVP-1', title: 'First Epic' }),
      epic({ _id: 'e2', jiraKey: 'WOSMVP-2', title: 'Second Epic' }),
    ]
    const syncedEpicIds: string[] = []
    stubFetch(undefined, (epicId) => syncedEpicIds.push(epicId))
    render(<AtlasView />)
    await waitFor(() => expect(screen.getByText('First Epic')).toBeInTheDocument())

    fireEvent.click(screen.getByRole('button', { name: 'Sync all' }))

    await waitFor(() => expect(syncedEpicIds.sort()).toEqual(['e1', 'e2']))
  })

  it('un-tracking an epic hides it from the main list but it remains visible (and restorable) via the archived toggle', async () => {
    listData = [epic({ _id: 'e1', jiraKey: 'WOSMVP-1', title: 'First Epic' })]
    stubFetch()
    render(<AtlasView />)
    await waitFor(() => expect(screen.getByText('First Epic')).toBeInTheDocument())

    fireEvent.click(screen.getByLabelText('Un-track WOSMVP-1'))

    await waitFor(() => expect(screen.getByText('Show 1 archived epic')).toBeInTheDocument())
    expect(screen.queryByText('First Epic')).not.toBeInTheDocument()

    fireEvent.click(screen.getByText('Show 1 archived epic'))
    expect(screen.getByText('First Epic')).toBeInTheDocument()
  })

  it('restoring an archived epic returns it to the main list', async () => {
    listData = [epic({ _id: 'e1', jiraKey: 'WOSMVP-1', title: 'First Epic', archived: true })]
    stubFetch()
    render(<AtlasView />)
    await waitFor(() => expect(screen.getByText('Show 1 archived epic')).toBeInTheDocument())
    fireEvent.click(screen.getByText('Show 1 archived epic'))
    await waitFor(() => expect(screen.getByText('First Epic')).toBeInTheDocument())

    fireEvent.click(screen.getByLabelText('Restore WOSMVP-1'))

    await waitFor(() => expect(screen.queryByText(/archived epic/)).not.toBeInTheDocument())
    expect(screen.getByText('First Epic')).toBeInTheDocument()
  })

  it('does not offer a "Sync now" action on an archived (read-only) epic row', async () => {
    listData = [epic({ _id: 'e1', jiraKey: 'WOSMVP-1', title: 'First Epic', archived: true })]
    stubFetch()
    render(<AtlasView />)
    await waitFor(() => expect(screen.getByText('Show 1 archived epic')).toBeInTheDocument())
    fireEvent.click(screen.getByText('Show 1 archived epic'))

    await waitFor(() => expect(screen.getByText('First Epic')).toBeInTheDocument())
    expect(screen.queryByLabelText('Sync WOSMVP-1 now')).not.toBeInTheDocument()
    expect(screen.queryByLabelText('Edit WOSMVP-1 notes')).not.toBeInTheDocument()
  })

  it('does not offer a delete action on an active (non-archived) epic row', async () => {
    listData = [epic({ _id: 'e1', jiraKey: 'WOSMVP-1', title: 'First Epic' })]
    stubFetch()
    render(<AtlasView />)
    await waitFor(() => expect(screen.getByText('First Epic')).toBeInTheDocument())

    expect(screen.queryByLabelText('Delete WOSMVP-1')).not.toBeInTheDocument()
  })

  it('deleting an archived epic asks for confirmation before removing it', async () => {
    listData = [epic({ _id: 'e1', jiraKey: 'WOSMVP-1', title: 'First Epic', archived: true })]
    stubFetch()
    render(<AtlasView />)
    await waitFor(() => expect(screen.getByText('Show 1 archived epic')).toBeInTheDocument())
    fireEvent.click(screen.getByText('Show 1 archived epic'))
    await waitFor(() => expect(screen.getByText('First Epic')).toBeInTheDocument())

    fireEvent.click(screen.getByLabelText('Delete WOSMVP-1'))

    expect(screen.getByText(/Permanently delete WOSMVP-1/)).toBeInTheDocument()
    expect(screen.getByText('First Epic')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Delete' }))

    await waitFor(() => expect(screen.queryByText('First Epic')).not.toBeInTheDocument())
    expect(fetchMock).toHaveBeenCalledWith('http://localhost:4100/api/atlas/epics/e1', { method: 'DELETE' })
  })

  it('cancelling the delete confirmation leaves the epic untouched', async () => {
    listData = [epic({ _id: 'e1', jiraKey: 'WOSMVP-1', title: 'First Epic', archived: true })]
    stubFetch()
    render(<AtlasView />)
    await waitFor(() => expect(screen.getByText('Show 1 archived epic')).toBeInTheDocument())
    fireEvent.click(screen.getByText('Show 1 archived epic'))
    await waitFor(() => expect(screen.getByText('First Epic')).toBeInTheDocument())

    fireEvent.click(screen.getByLabelText('Delete WOSMVP-1'))
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))

    expect(screen.queryByText(/Permanently delete WOSMVP-1/)).not.toBeInTheDocument()
    expect(screen.getByText('First Epic')).toBeInTheDocument()
    expect(fetchMock).not.toHaveBeenCalledWith('http://localhost:4100/api/atlas/epics/e1', { method: 'DELETE' })
  })

  it('excludes an archived task from the drill-down tree while preserving it in storage (not asserted here beyond visibility)', async () => {
    listData = [
      epic({
        _id: 'e1',
        jiraKey: 'WOSMVP-1',
        title: 'First Epic',
        tasks: [task({ _id: 't1', jiraKey: 'WOSMVP-100' }), task({ _id: 't2', jiraKey: 'WOSMVP-101', archived: true })],
      }),
    ]
    stubFetch()
    render(<AtlasView />)
    await waitFor(() => expect(screen.getByText('First Epic')).toBeInTheDocument())
    fireEvent.click(screen.getByText('First Epic'))
    expect(screen.getByText('WOSMVP-100')).toBeInTheDocument()
    expect(screen.queryByText('WOSMVP-101')).not.toBeInTheDocument()
  })
})
