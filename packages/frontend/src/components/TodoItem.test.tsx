import { fireEvent, render, screen, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { BoardQuickAddState, Todo } from '../types'
import { TodoItem } from './TodoItem'

const todo: Todo = {
  _id: 'todo-1',
  title: 'Buy milk',
  completed: false,
}

function makeQuickAdd(overrides: Partial<BoardQuickAddState> = {}): BoardQuickAddState {
  return {
    activeItemKeys: new Set<string>(),
    onAdd: vi.fn(),
    onRemove: vi.fn(),
    ...overrides,
  }
}

// TodoItem is the one shared quick-add insertion point for the main agenda,
// CompletedTodos, and todo search results (all render through this
// component) - see ticket 14 (.scratch/boards/issues/14-quick-add-icon-and-badge.md).
// AgendaGroups/CompletedTodos just thread the `boardQuickAdd` prop straight
// through, so the icon's own render/click behavior is fully covered here
// rather than duplicated at each call site.
describe('TodoItem quick-add icon', () => {
  it('renders no icon when boardQuickAdd is omitted', () => {
    render(<TodoItem todo={todo} onToggle={() => {}} onDelete={() => {}} />)

    expect(screen.queryByLabelText(/the active board/)).not.toBeInTheDocument()
  })

  it('renders the outline pin at rest when the todo is not on the active board', () => {
    const quickAdd = makeQuickAdd()
    render(<TodoItem todo={todo} onToggle={() => {}} onDelete={() => {}} boardQuickAdd={quickAdd} />)

    const icon = screen.getByLabelText('Add "Buy milk" to the active board')
    expect(icon).toHaveAttribute('aria-pressed', 'false')
    expect(icon).toHaveTextContent('📍')
  })

  it('renders the filled pin when the todo is on the active board', () => {
    const quickAdd = makeQuickAdd({ activeItemKeys: new Set(['Todo:todo-1']) })
    render(<TodoItem todo={todo} onToggle={() => {}} onDelete={() => {}} boardQuickAdd={quickAdd} />)

    const icon = screen.getByLabelText('Remove "Buy milk" from the active board')
    expect(icon).toHaveAttribute('aria-pressed', 'true')
    expect(icon).toHaveTextContent('📌')
  })

  it('clicking the outline icon calls onAdd with the todo, its label, and the icon element itself - and does not open the row', () => {
    const quickAdd = makeQuickAdd()
    const onOpen = vi.fn()
    render(<TodoItem todo={todo} onToggle={() => {}} onDelete={() => {}} onOpen={onOpen} boardQuickAdd={quickAdd} />)

    fireEvent.click(screen.getByLabelText('Add "Buy milk" to the active board'))

    expect(quickAdd.onAdd).toHaveBeenCalledWith('Todo', 'todo-1', 'Buy milk', expect.any(HTMLElement))
    expect(quickAdd.onRemove).not.toHaveBeenCalled()
    // The row's own onClick (onOpen) must never fire from a click aimed at
    // the icon - QuickAddIcon stops propagation, same as the delete button.
    expect(onOpen).not.toHaveBeenCalled()
  })

  it('clicking the filled icon calls onRemove, not onAdd', () => {
    const quickAdd = makeQuickAdd({ activeItemKeys: new Set(['Todo:todo-1']) })
    render(<TodoItem todo={todo} onToggle={() => {}} onDelete={() => {}} boardQuickAdd={quickAdd} />)

    fireEvent.click(screen.getByLabelText('Remove "Buy milk" from the active board'))

    expect(quickAdd.onRemove).toHaveBeenCalledWith('Todo', 'todo-1')
    expect(quickAdd.onAdd).not.toHaveBeenCalled()
  })
})

describe('TodoItem tags', () => {
  it('renders no tag list when the todo has no tags', () => {
    render(<TodoItem todo={todo} onToggle={() => {}} onDelete={() => {}} />)

    expect(screen.queryByRole('list', { name: 'Tags' })).not.toBeInTheDocument()
  })

  it('renders a small iconed badge per tag', () => {
    const tagged: Todo = { ...todo, tags: ['work', 'urgent'] }
    render(<TodoItem todo={tagged} onToggle={() => {}} onDelete={() => {}} />)

    const badges = within(screen.getByRole('list', { name: 'Tags' })).getAllByRole('listitem')
    expect(badges).toHaveLength(2)
    expect(badges[0]).toHaveTextContent('work')
    expect(badges[1]).toHaveTextContent('urgent')
  })

  it('places tag badges before the priority badge', () => {
    const tagged: Todo = { ...todo, tags: ['work'], priority: 'High' }
    render(<TodoItem todo={tagged} onToggle={() => {}} onDelete={() => {}} />)

    const tagList = screen.getByRole('list', { name: 'Tags' })
    const priorityBadge = screen.getByText('High')
    expect(tagList.compareDocumentPosition(priorityBadge) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })

  it('places tag badges before the office badge', () => {
    const tagged: Todo = { ...todo, tags: ['work'], officeLinked: true }
    render(<TodoItem todo={tagged} onToggle={() => {}} onDelete={() => {}} />)

    const tagList = screen.getByRole('list', { name: 'Tags' })
    const officeBadge = screen.getByText('Office')
    expect(tagList.compareDocumentPosition(officeBadge) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })
})
