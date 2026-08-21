import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from 'vitest'
import { AtlasPresentView } from './AtlasPresentView'
import type { AtlasEpic } from '../types'

// Component tests for the Present view (ticket 11, spec §7): the program
// strip, click/keyboard detail-pane swap, the needs-attention digest, and
// the "live epics only" rule. Wrapped in a MemoryRouter (unlike
// AtlasView.test.tsx) because this component renders a real react-router
// <Link> ("Back to Dashboard") - see SprintShell.tsx's AtlasDashboardSection
// comment for why that link was kept out of AtlasView.tsx instead.

interface FakeResponse {
  ok: boolean
  status: number
  json: () => Promise<unknown>
}

type FetchMock = Mock<(url: string) => Promise<FakeResponse>>

function jsonResponse(body: unknown, status = 200): Promise<FakeResponse> {
  return Promise.resolve({ ok: status < 400, status, json: () => Promise.resolve(body) })
}

let listData: AtlasEpic[]
let fetchMock: FetchMock

function stubFetch(): FetchMock {
  const mock: FetchMock = vi.fn((url) => {
    const href = String(url)
    if (href.endsWith('/api/atlas/epics')) return jsonResponse(structuredClone(listData))
    return jsonResponse([])
  })
  fetchMock = mock
  vi.stubGlobal('fetch', mock)
  return mock
}

function renderPresent() {
  return render(
    <MemoryRouter initialEntries={['/sprint/atlas/present']}>
      <AtlasPresentView />
    </MemoryRouter>,
  )
}

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
    isOutsideProgram: false,
    ...overrides,
  }
}

describe('AtlasPresentView', () => {
  beforeEach(() => {
    listData = []
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('shows an empty-state message when there are no live tracked epics', async () => {
    stubFetch()
    renderPresent()
    await waitFor(() => {
      expect(screen.getByText('No live epics tracked yet. Track one from the Dashboard first.')).toBeInTheDocument()
    })
    expect(fetchMock).toHaveBeenCalledWith(expect.stringContaining('/api/atlas/epics'))
  })

  it('lists every live epic in the program strip with title, key, and an at-risk badge when >0', async () => {
    listData = [
      epic({ _id: 'e1', jiraKey: 'WOSMVP-1', title: 'First Epic', tasks: [task({ _id: 't1', atRisk: true })] }),
      epic({ _id: 'e2', jiraKey: 'WOSMVP-2', title: 'Second Epic', tasks: [task({ _id: 't2', atRisk: false })] }),
    ]
    stubFetch()
    renderPresent()

    await waitFor(() => expect(screen.getByRole('heading', { name: 'First Epic' })).toBeInTheDocument())
    expect(screen.getByText('Second Epic')).toBeInTheDocument()
    // Only First Epic (1 at-risk task) shows a badge with its count.
    const options = screen.getAllByRole('option')
    expect(options).toHaveLength(2)
    expect(options[0]).toHaveTextContent('WOSMVP-1')
    expect(options[0]).toHaveTextContent('1')
    expect(options[1]).toHaveTextContent('WOSMVP-2')
  })

  it('never shows an archived epic, in the strip or as the selected detail', async () => {
    listData = [
      epic({ _id: 'e1', jiraKey: 'WOSMVP-1', title: 'Live Epic' }),
      epic({ _id: 'e2', jiraKey: 'WOSMVP-2', title: 'Archived Epic', archived: true }),
    ]
    stubFetch()
    renderPresent()

    await waitFor(() => expect(screen.getByRole('heading', { name: 'Live Epic' })).toBeInTheDocument())
    expect(screen.queryByText('Archived Epic')).not.toBeInTheDocument()
  })

  it('defaults to the first live epic selected, showing its key, status counts, and Jira link', async () => {
    listData = [
      epic({
        _id: 'e1',
        jiraKey: 'WOSMVP-1',
        title: 'First Epic',
        tasks: [task({ _id: 't1', status: 'Done' }), task({ _id: 't2', status: 'In Progress' })],
      }),
    ]
    stubFetch()
    renderPresent()

    await waitFor(() => expect(screen.getByRole('heading', { name: 'First Epic' })).toBeInTheDocument())
    expect(screen.getByText('1 Done')).toBeInTheDocument()
    expect(screen.getByText('1 In Progress')).toBeInTheDocument()
    expect(screen.getByText('0 To Do')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /WOSMVP-1/ })).toHaveAttribute('href', 'https://wealthos.atlassian.net/browse/WOSMVP-1')
  })

  it('clicking a different strip row swaps the detail pane instantly', async () => {
    listData = [
      epic({ _id: 'e1', jiraKey: 'WOSMVP-1', title: 'First Epic' }),
      epic({ _id: 'e2', jiraKey: 'WOSMVP-2', title: 'Second Epic' }),
    ]
    stubFetch()
    renderPresent()

    await waitFor(() => expect(screen.getByRole('heading', { name: 'First Epic' })).toBeInTheDocument())
    fireEvent.click(screen.getByText('Second Epic'))
    expect(screen.getByRole('heading', { name: 'Second Epic' })).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'First Epic' })).not.toBeInTheDocument()
  })

  it('ArrowDown/ArrowUp moves the selection through the strip, wrapping at the ends', async () => {
    listData = [
      epic({ _id: 'e1', jiraKey: 'WOSMVP-1', title: 'First Epic' }),
      epic({ _id: 'e2', jiraKey: 'WOSMVP-2', title: 'Second Epic' }),
      epic({ _id: 'e3', jiraKey: 'WOSMVP-3', title: 'Third Epic' }),
    ]
    stubFetch()
    renderPresent()

    await waitFor(() => expect(screen.getByRole('heading', { name: 'First Epic' })).toBeInTheDocument())

    fireEvent.keyDown(window, { key: 'ArrowDown' })
    expect(screen.getByRole('heading', { name: 'Second Epic' })).toBeInTheDocument()

    fireEvent.keyDown(window, { key: 'ArrowDown' })
    expect(screen.getByRole('heading', { name: 'Third Epic' })).toBeInTheDocument()

    // Wraps back to the first epic past the end.
    fireEvent.keyDown(window, { key: 'ArrowDown' })
    expect(screen.getByRole('heading', { name: 'First Epic' })).toBeInTheDocument()

    // Wraps the other direction too.
    fireEvent.keyDown(window, { key: 'ArrowUp' })
    expect(screen.getByRole('heading', { name: 'Third Epic' })).toBeInTheDocument()
  })

  it('shows an explicit "on track" line for a clean epic instead of an empty digest', async () => {
    listData = [epic({ jiraKey: 'WOSMVP-1', title: 'First Epic', tasks: [task({ status: 'To Do' })] })]
    stubFetch()
    renderPresent()

    await waitFor(() => expect(screen.getByRole('heading', { name: 'First Epic' })).toBeInTheDocument())
    expect(screen.getByText('On track — nothing at risk or blocked right now.')).toBeInTheDocument()
  })

  it('digest lists an at-risk task with a reason and its inline notes when present', async () => {
    listData = [
      epic({
        jiraKey: 'WOSMVP-1',
        title: 'First Epic',
        tasks: [task({ jiraKey: 'WOSMVP-100', title: 'Do the thing', atRisk: true, notesText: 'Waiting on vendor.' })],
      }),
    ]
    stubFetch()
    renderPresent()

    await waitFor(() => expect(screen.getByRole('heading', { name: 'First Epic' })).toBeInTheDocument())
    expect(screen.getByText('WOSMVP-100')).toBeInTheDocument()
    expect(screen.getByText('(at risk)')).toBeInTheDocument()
    expect(screen.getByText('Waiting on vendor.')).toBeInTheDocument()
  })

  it('digest lists a non-Done blocked task with its cross-epic blocker key inline, no epic suffix', async () => {
    listData = [
      epic({
        _id: 'e1',
        jiraKey: 'WOSMVP-1',
        title: 'First Epic',
        tasks: [task({ jiraKey: 'WOSMVP-100', title: 'Blocked task', status: 'In Progress', blockedBy: ['t-other'] })],
      }),
      epic({ _id: 'e2', jiraKey: 'WOSMVP-2', title: 'Second Epic', tasks: [task({ _id: 't-other', jiraKey: 'WOSMVP-200' })] }),
    ]
    stubFetch()
    renderPresent()

    await waitFor(() => expect(screen.getByRole('heading', { name: 'First Epic' })).toBeInTheDocument())
    expect(screen.getByText('(blocked by WOSMVP-200)')).toBeInTheDocument()
    expect(screen.queryByText('· WOSMVP-2')).not.toBeInTheDocument()
  })

  it('excludes a Done blocked task from the digest', async () => {
    listData = [
      epic({
        jiraKey: 'WOSMVP-1',
        title: 'First Epic',
        tasks: [task({ jiraKey: 'WOSMVP-100', status: 'Done', blockedBy: ['t-other'] })],
      }),
    ]
    stubFetch()
    renderPresent()

    await waitFor(() => expect(screen.getByRole('heading', { name: 'First Epic' })).toBeInTheDocument())
    expect(screen.getByText('On track — nothing at risk or blocked right now.')).toBeInTheDocument()
  })

  it('renders epic notes as a blockquote', async () => {
    listData = [epic({ jiraKey: 'WOSMVP-1', title: 'First Epic', notesText: 'Vendor delay is the long pole here.' })]
    stubFetch()
    renderPresent()

    await waitFor(() => expect(screen.getByRole('heading', { name: 'First Epic' })).toBeInTheDocument())
    const quote = screen.getByText('Vendor delay is the long pole here.')
    expect(quote.tagName).toBe('BLOCKQUOTE')
  })

  it('renders no edit affordances anywhere - the only controls are navigation and the outbound Jira link', async () => {
    listData = [epic({ jiraKey: 'WOSMVP-1', title: 'First Epic', tasks: [task({ atRisk: true, notesText: 'x' })] })]
    stubFetch()
    renderPresent()

    await waitFor(() => expect(screen.getByRole('heading', { name: 'First Epic' })).toBeInTheDocument())
    expect(screen.queryByRole('button', { name: /edit/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument()
    expect(screen.queryByLabelText(/edit/i)).not.toBeInTheDocument()
  })

  it('offers a "Back to Dashboard" link to /sprint/atlas', async () => {
    listData = [epic({ jiraKey: 'WOSMVP-1', title: 'First Epic' })]
    stubFetch()
    renderPresent()

    await waitFor(() => expect(screen.getByRole('heading', { name: 'First Epic' })).toBeInTheDocument())
    expect(screen.getByRole('link', { name: 'Back to Dashboard' })).toHaveAttribute('href', '/sprint/atlas')
  })
})
