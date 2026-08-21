import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { AtlasTaskBoard } from './AtlasTaskBoard'
import type { AtlasEpic, Person } from '../types'

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

// AtlasTaskBoard resolves assignee names against Atlas's own roster
// (GET /api/atlas/roster, Person populated) - not the global /api/people
// directory - so the stub returns roster entries wrapping each Person.
function stubRoster(people: Person[]) {
  vi.stubGlobal(
    'fetch',
    vi.fn(() =>
      Promise.resolve({
        ok: true,
        json: () => Promise.resolve(people.map((p, i) => ({ _id: `m${i}`, personId: p }))),
      }),
    ),
  )
}

describe('AtlasTaskBoard', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('renders nothing when there are no leaf tasks', () => {
    stubRoster([])
    const { container } = render(<AtlasTaskBoard epics={[epic({ tasks: [] })]} />)
    expect(container).toBeEmptyDOMElement()
  })

  it('collapses the board by default, revealing columns only after the header is clicked', async () => {
    stubRoster([])
    render(<AtlasTaskBoard epics={[epic({ tasks: [task({ _id: 't1', jiraKey: 'A', status: 'To Do' })] })]} />)
    await waitFor(() => expect(screen.getByText('Task board')).toBeInTheDocument())
    expect(screen.queryByText('A')).not.toBeInTheDocument()
    fireEvent.click(screen.getByText('Task board'))
    await waitFor(() => expect(screen.getByText('A')).toBeInTheDocument())
  })

  it('shows a leaf task in its status column, excluding a task that has visible sub-tasks', async () => {
    stubRoster([])
    render(
      <AtlasTaskBoard
        epics={[
          epic({
            tasks: [
              task({ _id: 't1', jiraKey: 'A', status: 'In Progress', subtasks: [task({ _id: 't1a', jiraKey: 'A1', status: 'Done' })] }),
              task({ _id: 't2', jiraKey: 'B', status: 'To Do' }),
            ],
          }),
        ]}
      />,
    )
    fireEvent.click(screen.getByText('Task board'))
    // 'A' has a visible sub-task, so it's skipped in favor of 'A1'.
    await waitFor(() => expect(screen.getByText('A1')).toBeInTheDocument())
    expect(screen.queryByText('A')).not.toBeInTheDocument()
    expect(screen.getByText('B')).toBeInTheDocument()
  })

  it("resolves an assignee's name from the Atlas roster, and falls back to Unmapped/Unassigned", async () => {
    stubRoster([{ _id: 'p1', name: 'Ada Lovelace', email: 'ada@example.com', jiraAccountId: 'acc-1' }])
    render(
      <AtlasTaskBoard
        epics={[
          epic({
            tasks: [
              task({ _id: 't1', jiraKey: 'A', assigneeAccountId: 'acc-1' }),
              task({ _id: 't2', jiraKey: 'B', assigneeAccountId: 'acc-unknown' }),
              task({ _id: 't3', jiraKey: 'C', assigneeAccountId: null }),
            ],
          }),
        ]}
      />,
    )
    fireEvent.click(screen.getByText('Task board'))
    await waitFor(() => expect(screen.getByText('Ada Lovelace')).toBeInTheDocument())
    expect(screen.getByText('Unmapped assignee')).toBeInTheDocument()
    expect(screen.getByText('Unassigned')).toBeInTheDocument()
  })

  it('hides a whole column when its status pill is toggled off', async () => {
    stubRoster([])
    render(
      <AtlasTaskBoard
        epics={[
          epic({
            tasks: [
              task({ _id: 't1', jiraKey: 'A', status: 'To Do' }),
              task({ _id: 't2', jiraKey: 'B', status: 'Done' }),
            ],
          }),
        ]}
      />,
    )
    fireEvent.click(screen.getByText('Task board'))
    await waitFor(() => expect(screen.getByText('A')).toBeInTheDocument())
    fireEvent.click(screen.getByTitle('Hide To Do column'))
    expect(screen.queryByText('A')).not.toBeInTheDocument()
    expect(screen.getByText('B')).toBeInTheDocument()
  })

  it('filters tasks to selected people via the assignee combobox', async () => {
    stubRoster([
      { _id: 'p1', name: 'Ada Lovelace', email: 'ada@example.com', jiraAccountId: 'acc-1' },
      { _id: 'p2', name: 'Bo Diaz', email: 'bo@example.com', jiraAccountId: 'acc-2' },
    ])
    render(
      <AtlasTaskBoard
        epics={[
          epic({
            tasks: [
              task({ _id: 't1', jiraKey: 'A', assigneeAccountId: 'acc-1' }),
              task({ _id: 't2', jiraKey: 'B', assigneeAccountId: 'acc-2' }),
            ],
          }),
        ]}
      />,
    )
    fireEvent.click(screen.getByText('Task board'))
    await waitFor(() => expect(screen.getByText('A')).toBeInTheDocument())
    fireEvent.click(screen.getByText('All people'))
    // The combobox's own option row and the (still-mounted, just visually
    // covered) status table both render "Ada Lovelace" - the combobox row
    // comes first in DOM order.
    fireEvent.click(screen.getAllByText('Ada Lovelace')[0])
    expect(screen.getByText('A')).toBeInTheDocument()
    expect(screen.queryByText('B')).not.toBeInTheDocument()
  })

  it('drops unassigned tasks when "Hide unassigned" is checked', async () => {
    stubRoster([{ _id: 'p1', name: 'Ada Lovelace', email: 'ada@example.com', jiraAccountId: 'acc-1' }])
    render(
      <AtlasTaskBoard
        epics={[
          epic({
            tasks: [
              task({ _id: 't1', jiraKey: 'A', assigneeAccountId: 'acc-1' }),
              task({ _id: 't2', jiraKey: 'B', assigneeAccountId: null }),
            ],
          }),
        ]}
      />,
    )
    fireEvent.click(screen.getByText('Task board'))
    await waitFor(() => expect(screen.getByText('A')).toBeInTheDocument())
    fireEvent.click(screen.getByText('Hide unassigned'))
    expect(screen.getByText('A')).toBeInTheDocument()
    expect(screen.queryByText('B')).not.toBeInTheDocument()
  })

  it('switches to person swimlanes when grouped by assignee', async () => {
    stubRoster([{ _id: 'p1', name: 'Ada Lovelace', email: 'ada@example.com', jiraAccountId: 'acc-1' }])
    render(
      <AtlasTaskBoard
        epics={[epic({ tasks: [task({ _id: 't1', jiraKey: 'A', assigneeAccountId: 'acc-1' })] })]}
      />,
    )
    fireEvent.click(screen.getByText('Task board'))
    await waitFor(() => expect(screen.getByText('A')).toBeInTheDocument())
    fireEvent.change(screen.getByLabelText('Group tasks by'), { target: { value: 'assignee' } })
    // The jump-nav pill and the lane header both carry "Jump to Ada Lovelace"/
    // "Ada Lovelace" text - either confirms the swimlane layout rendered.
    expect(screen.getByTitle('Jump to Ada Lovelace')).toBeInTheDocument()
    expect(screen.getByText('A')).toBeInTheDocument()
  })

  it('switches to collapsed epic cards when grouped by epic, expanding on click', async () => {
    stubRoster([])
    render(
      <AtlasTaskBoard
        epics={[epic({ jiraKey: 'WOSMVP-1', title: 'First Epic', tasks: [task({ _id: 't1', jiraKey: 'A' })] })]}
      />,
    )
    fireEvent.click(screen.getByText('Task board'))
    await waitFor(() => expect(screen.getByText('A')).toBeInTheDocument())
    fireEvent.change(screen.getByLabelText('Group tasks by'), { target: { value: 'epic' } })
    expect(screen.getByText('First Epic')).toBeInTheDocument()
    expect(screen.queryByText('A')).not.toBeInTheDocument()
    fireEvent.click(screen.getByText('First Epic'))
    expect(screen.getByText('A')).toBeInTheDocument()
  })
})
