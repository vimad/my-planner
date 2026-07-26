import { fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AgendaGroups } from './AgendaGroups'

describe('AgendaGroups', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(2026, 6, 25, 9, 0))
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  const todos = [
    { _id: '1', title: 'Overdue task', dueDate: '2026-07-20', completed: false, categoryId: 'c1' },
    { _id: '2', title: 'Today task', dueDate: '2026-07-25', completed: false, categoryId: 'c1' },
    { _id: '3', title: 'Tomorrow task', dueDate: '2026-07-26', completed: false, categoryId: 'c1' },
    { _id: '4', title: 'This week task', dueDate: '2026-07-29', completed: false, categoryId: 'c1' },
    { _id: '5', title: 'Later task', dueDate: '2026-08-20', completed: false, categoryId: 'c1' },
    { _id: '6', title: 'No date task', dueDate: null, completed: false, categoryId: 'c1' },
    { _id: '7', title: 'Done task', dueDate: '2026-07-25', completed: true, categoryId: 'c1' },
  ]

  it('renders every non-empty group in Overdue/Today/Tomorrow/This week/Later/No date order, excluding completed todos', () => {
    render(
      <AgendaGroups todos={todos} categoriesById={{}} onToggle={() => {}} onDelete={() => {}} />,
    )

    const groupTitles = screen
      .getAllByText(/^(Overdue|Today|Tomorrow|This week|Later|No date)$/)
      .map((el) => el.textContent)
    expect(groupTitles).toEqual(['Overdue', 'Today', 'Tomorrow', 'This week', 'Later', 'No date'])

    expect(screen.getByText('Overdue task')).toBeInTheDocument()
    expect(screen.getByText('Today task')).toBeInTheDocument()
    expect(screen.queryByText('Done task')).not.toBeInTheDocument()
  })

  it('skips empty groups', () => {
    render(
      <AgendaGroups
        todos={[{ _id: '1', title: 'Only today', dueDate: '2026-07-25', completed: false }]}
        categoriesById={{}}
        onToggle={() => {}}
        onDelete={() => {}}
      />,
    )

    expect(screen.getByText('Today')).toBeInTheDocument()
    expect(screen.queryByText('Overdue')).not.toBeInTheDocument()
    expect(screen.queryByText('Tomorrow')).not.toBeInTheDocument()
    expect(screen.queryByText('No date')).not.toBeInTheDocument()
  })

  it('shows a caught-up message when there are no open todos', () => {
    render(<AgendaGroups todos={[]} categoriesById={{}} onToggle={() => {}} onDelete={() => {}} />)

    expect(screen.getByText(/all caught up/)).toBeInTheDocument()
  })

  it('highlights only the todo due today, computed live from the current date', () => {
    render(
      <AgendaGroups todos={todos} categoriesById={{}} onToggle={() => {}} onDelete={() => {}} />,
    )

    const todayItem = screen.getByText('Today task').closest('[class*="border-fuchsia"]')
    expect(todayItem).not.toBeNull()

    const overdueItem = screen.getByText('Overdue task').closest('[class*="border-fuchsia"]')
    expect(overdueItem).toBeNull()
  })

  it('calls onOpen with the todo when a row is clicked', () => {
    const onOpen = vi.fn()
    render(
      <AgendaGroups
        todos={todos}
        categoriesById={{}}
        onToggle={() => {}}
        onDelete={() => {}}
        onOpen={onOpen}
      />,
    )

    fireEvent.click(screen.getByText('Today task'))

    expect(onOpen).toHaveBeenCalledWith(expect.objectContaining({ _id: '2', title: 'Today task' }))
  })

  it('sorts each group High -> Medium -> Low when sortByPriority is on, without changing the grouping', () => {
    const mixedPriority = [
      { _id: 'a', title: 'Low one', dueDate: '2026-08-20', completed: false, priority: 'Low' },
      { _id: 'b', title: 'High one', dueDate: '2026-08-20', completed: false, priority: 'High' },
      { _id: 'c', title: 'Medium one', dueDate: '2026-08-20', completed: false, priority: 'Medium' },
    ]

    render(
      <AgendaGroups
        todos={mixedPriority}
        categoriesById={{}}
        onToggle={() => {}}
        onDelete={() => {}}
        sortByPriority
      />,
    )

    const titles = screen.getAllByText(/one$/).map((el) => el.textContent)
    expect(titles).toEqual(['High one', 'Medium one', 'Low one'])
    // Still a single "Later" group - grouping itself is untouched.
    expect(screen.getAllByText('Later')).toHaveLength(1)
  })

  it('groups and highlights an office-linked todo as Today when nextOfficeDay is today', () => {
    const officeTodos = [
      { _id: 'o1', title: 'Bring badge', dueDate: null, officeLinked: true, completed: false },
    ]

    render(
      <AgendaGroups
        todos={officeTodos}
        categoriesById={{}}
        onToggle={() => {}}
        onDelete={() => {}}
        nextOfficeDay="2026-07-25"
      />,
    )

    expect(screen.getByText('Today')).toBeInTheDocument()
    const item = screen.getByText('Bring badge').closest('[class*="border-fuchsia"]')
    expect(item).not.toBeNull()
  })

  it('falls back to No date for an office-linked todo once nextOfficeDay is stale, not Overdue', () => {
    const officeTodos = [
      { _id: 'o1', title: 'Bring badge', dueDate: null, officeLinked: true, completed: false },
    ]

    render(
      <AgendaGroups
        todos={officeTodos}
        categoriesById={{}}
        onToggle={() => {}}
        onDelete={() => {}}
        nextOfficeDay="2026-07-20"
      />,
    )

    expect(screen.getByText('No date')).toBeInTheDocument()
    expect(screen.queryByText('Overdue')).not.toBeInTheDocument()
  })

  it('lets a real dueDate win over an office link', () => {
    const officeTodos = [
      {
        _id: 'o1',
        title: 'Sign contract',
        dueDate: '2026-07-20',
        officeLinked: true,
        completed: false,
      },
    ]

    render(
      <AgendaGroups
        todos={officeTodos}
        categoriesById={{}}
        onToggle={() => {}}
        onDelete={() => {}}
        nextOfficeDay="2026-07-25"
      />,
    )

    expect(screen.getByText('Overdue')).toBeInTheDocument()
    expect(screen.queryByText('Today')).not.toBeInTheDocument()
  })

  it('preserves original order within a group when sortByPriority is off', () => {
    const mixedPriority = [
      { _id: 'a', title: 'Low one', dueDate: '2026-08-20', completed: false, priority: 'Low' },
      { _id: 'b', title: 'High one', dueDate: '2026-08-20', completed: false, priority: 'High' },
    ]

    render(
      <AgendaGroups todos={mixedPriority} categoriesById={{}} onToggle={() => {}} onDelete={() => {}} />,
    )

    const titles = screen.getAllByText(/one$/).map((el) => el.textContent)
    expect(titles).toEqual(['Low one', 'High one'])
  })
})
