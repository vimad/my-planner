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
    isOutsideProgram: false,
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

  it('renders columns immediately, with no collapse toggle', async () => {
    stubRoster([])
    render(<AtlasTaskBoard epics={[epic({ tasks: [task({ _id: 't1', jiraKey: 'A', status: 'To Do' })] })]} />)
    await waitFor(() => expect(screen.getByText('Task board')).toBeInTheDocument())
    expect(screen.getByText('A')).toBeInTheDocument()
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
    // 'A' has a visible sub-task, so it's skipped in favor of 'A1' - but 'A'
    // still surfaces once, as the sub-task group's own fieldset legend.
    await waitFor(() => expect(screen.getByText('A1')).toBeInTheDocument())
    expect(screen.getAllByText('A')).toHaveLength(1)
    expect(screen.getByText('B')).toBeInTheDocument()
  })

  it("groups a task's visible sub-tasks into a bordered fieldset labeled with the parent task's own key and title", async () => {
    stubRoster([])
    render(
      <AtlasTaskBoard
        epics={[
          epic({
            tasks: [
              task({
                _id: 't1',
                jiraKey: 'A',
                title: 'Parent task',
                jiraUrl: 'https://wealthos.atlassian.net/browse/A',
                status: 'In Progress',
                subtasks: [
                  task({ _id: 't1a', jiraKey: 'A1', status: 'In Progress' }),
                  task({ _id: 't1b', jiraKey: 'A2', status: 'In Progress' }),
                ],
              }),
            ],
          }),
        ]}
      />,
    )
    await waitFor(() => expect(screen.getByText('A1')).toBeInTheDocument())
    expect(screen.getByText('A2')).toBeInTheDocument()
    expect(screen.getByText('Parent task')).toBeInTheDocument()
    expect(screen.getByText('2 sub-tasks')).toBeInTheDocument()
    const legend = screen.getByText('Parent task').closest('legend')
    expect(legend?.closest('fieldset')).toBeInTheDocument()
  })

  it('renders a status column with sub-task groups first, then standalone tasks - decluttering even when a standalone task is listed before the grouped one', async () => {
    stubRoster([])
    render(
      <AtlasTaskBoard
        epics={[
          epic({
            tasks: [
              task({ _id: 't1', jiraKey: 'Z', status: 'To Do' }),
              task({
                _id: 't2',
                jiraKey: 'A',
                status: 'To Do',
                subtasks: [task({ _id: 't2a', jiraKey: 'A1', status: 'To Do' })],
              }),
            ],
          }),
        ]}
      />,
    )
    await waitFor(() => expect(screen.getByText('A1')).toBeInTheDocument())
    const zIndex = document.body.innerHTML.indexOf('>Z<')
    const a1Index = document.body.innerHTML.indexOf('>A1<')
    expect(a1Index).toBeLessThan(zIndex)
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
    await waitFor(() => expect(screen.getByText('A')).toBeInTheDocument())
    fireEvent.change(screen.getByLabelText('Group tasks by'), { target: { value: 'assignee' } })
    // The jump-nav pill and the lane header both carry "Jump to Ada Lovelace"/
    // "Ada Lovelace" text - either confirms the swimlane layout rendered.
    expect(screen.getByTitle('Jump to Ada Lovelace')).toBeInTheDocument()
    expect(screen.getByText('A')).toBeInTheDocument()
  })

  it("groups a task's visible sub-tasks into a fieldset within a person's swimlane, when grouped by assignee", async () => {
    stubRoster([{ _id: 'p1', name: 'Ada Lovelace', email: 'ada@example.com', jiraAccountId: 'acc-1' }])
    render(
      <AtlasTaskBoard
        epics={[
          epic({
            tasks: [
              task({
                _id: 't1',
                jiraKey: 'A',
                title: 'Parent task',
                assigneeAccountId: 'acc-1',
                subtasks: [
                  task({ _id: 't1a', jiraKey: 'A1', assigneeAccountId: 'acc-1' }),
                  task({ _id: 't1b', jiraKey: 'A2', assigneeAccountId: 'acc-1' }),
                ],
              }),
            ],
          }),
        ]}
      />,
    )
    await waitFor(() => expect(screen.getByText('A1')).toBeInTheDocument())
    fireEvent.change(screen.getByLabelText('Group tasks by'), { target: { value: 'assignee' } })
    await waitFor(() => expect(screen.getByText('A2')).toBeInTheDocument())
    const legend = screen.getByText('Parent task').closest('legend')
    expect(legend?.closest('fieldset')).toBeInTheDocument()
  })

  it('switches to collapsed epic cards when grouped by epic, expanding on click', async () => {
    stubRoster([])
    render(
      <AtlasTaskBoard
        epics={[epic({ jiraKey: 'WOSMVP-1', title: 'First Epic', tasks: [task({ _id: 't1', jiraKey: 'A' })] })]}
      />,
    )
    await waitFor(() => expect(screen.getByText('A')).toBeInTheDocument())
    fireEvent.change(screen.getByLabelText('Group tasks by'), { target: { value: 'epic' } })
    expect(screen.getByText('First Epic')).toBeInTheDocument()
    expect(screen.queryByText('A')).not.toBeInTheDocument()
    fireEvent.click(screen.getByText('First Epic'))
    expect(screen.getByText('A')).toBeInTheDocument()
  })

  it("groups a task's visible sub-tasks into a fieldset within its epic's card grid, when grouped by epic", async () => {
    stubRoster([])
    render(
      <AtlasTaskBoard
        epics={[
          epic({
            jiraKey: 'WOSMVP-1',
            title: 'First Epic',
            tasks: [
              task({
                _id: 't1',
                jiraKey: 'A',
                title: 'Parent task',
                subtasks: [task({ _id: 't1a', jiraKey: 'A1' }), task({ _id: 't1b', jiraKey: 'A2' })],
              }),
            ],
          }),
        ]}
      />,
    )
    await waitFor(() => expect(screen.getByText('A1')).toBeInTheDocument())
    fireEvent.change(screen.getByLabelText('Group tasks by'), { target: { value: 'epic' } })
    fireEvent.click(screen.getByText('First Epic'))
    await waitFor(() => expect(screen.getByText('A1')).toBeInTheDocument())
    expect(screen.getByText('A2')).toBeInTheDocument()
    const legend = screen.getByText('Parent task').closest('legend')
    expect(legend?.closest('fieldset')).toBeInTheDocument()
  })

  it('highlights a directly-tracked "Outside the program" ticket with an indigo border, in the default status-table view', async () => {
    stubRoster([])
    render(
      <AtlasTaskBoard
        epics={[
          epic({ jiraKey: 'WOSMVP-1', isOutsideProgram: false, tasks: [task({ _id: 't1', jiraKey: 'A' })] }),
          epic({
            _id: 'outside-epic',
            jiraKey: '__outside-program__',
            title: 'Outside the program',
            isOutsideProgram: true,
            tasks: [task({ _id: 't2', jiraKey: 'B', epicId: 'outside-epic' })],
          }),
        ]}
      />,
    )
    await waitFor(() => expect(screen.getByText('A')).toBeInTheDocument())
    const rowA = screen.getByText('A').closest('tr')
    const rowB = screen.getByText('B').closest('tr')
    expect(rowA?.className).not.toContain('border-indigo-400')
    expect(rowB?.className).toEqual(expect.stringContaining('border-l-2'))
    expect(rowB?.className).toEqual(expect.stringContaining('border-indigo-400'))
    // The status table shows "Outside" rather than the sentinel jiraKey in
    // the epic column.
    expect(screen.getByText('Outside')).toBeInTheDocument()
  })

  it('hides "Outside the program" tickets when "Hide outside the program" is checked', async () => {
    stubRoster([])
    render(
      <AtlasTaskBoard
        epics={[
          epic({ jiraKey: 'WOSMVP-1', tasks: [task({ _id: 't1', jiraKey: 'A' })] }),
          epic({
            _id: 'outside-epic',
            jiraKey: '__outside-program__',
            isOutsideProgram: true,
            tasks: [task({ _id: 't2', jiraKey: 'B', epicId: 'outside-epic' })],
          }),
        ]}
      />,
    )
    await waitFor(() => expect(screen.getByText('A')).toBeInTheDocument())
    expect(screen.getByText('B')).toBeInTheDocument()
    fireEvent.click(screen.getByText('Hide outside the program'))
    expect(screen.getByText('A')).toBeInTheDocument()
    expect(screen.queryByText('B')).not.toBeInTheDocument()
  })

  it('hides the sentinel jiraKey/Jira link for the "Outside the program" epic card, when grouped by epic', async () => {
    stubRoster([])
    render(
      <AtlasTaskBoard
        epics={[
          epic({
            _id: 'outside-epic',
            jiraKey: '__outside-program__',
            title: 'Outside the program',
            isOutsideProgram: true,
            tasks: [task({ _id: 't1', jiraKey: 'B', epicId: 'outside-epic' })],
          }),
        ]}
      />,
    )
    await waitFor(() => expect(screen.getByText('B')).toBeInTheDocument())
    fireEvent.change(screen.getByLabelText('Group tasks by'), { target: { value: 'epic' } })
    expect(screen.getByText('Outside the program')).toBeInTheDocument()
    expect(screen.queryByText('__outside-program__')).not.toBeInTheDocument()
    expect(screen.queryByTitle('Open epic in Jira')).not.toBeInTheDocument()
  })
})
