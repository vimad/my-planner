import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { TodoDetail } from './TodoDetail'

const categories = [
  { _id: 'uncategorized-id', name: 'Uncategorized' },
  { _id: 'work-id', name: 'Work' },
]

const todo = {
  _id: 'todo-1',
  title: 'Ship feature',
  categoryId: 'uncategorized-id',
  priority: 'Medium',
  dueDate: '2026-07-25',
  tags: ['launch'],
  completed: false,
  body: {
    type: 'doc',
    content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Some notes' }] }],
  },
}

describe('TodoDetail', () => {
  it('renders the todo fields, including the rich-text body in read-only view mode by default', () => {
    render(
      <TodoDetail
        todo={todo}
        categories={categories}
        availableTags={['launch', 'urgent']}
        onClose={() => {}}
        onSave={vi.fn()}
      />,
    )

    expect(screen.getByLabelText('Todo title')).toHaveValue('Ship feature')
    expect(screen.getByRole('button', { name: 'Medium' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByLabelText('Due date')).toHaveValue('2026-07-25')
    expect(screen.getByLabelText('Category')).toHaveValue('uncategorized-id')
    expect(screen.getByText('launch')).toBeInTheDocument()
    expect(screen.getByText('Some notes')).toBeInTheDocument()
    expect(document.querySelector('[contenteditable]')).toHaveAttribute('contenteditable', 'false')
  })

  it('flips the rich-text body into an editable state via the Edit toggle', () => {
    render(
      <TodoDetail
        todo={todo}
        categories={categories}
        availableTags={[]}
        onClose={() => {}}
        onSave={vi.fn()}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Edit' }))

    expect(document.querySelector('[contenteditable]')).toHaveAttribute('contenteditable', 'true')
    expect(screen.getByRole('button', { name: 'Done editing' })).toBeInTheDocument()
  })

  it('saves edited priority, due date, category, and tags', async () => {
    const onSave = vi.fn().mockResolvedValue()
    render(
      <TodoDetail
        todo={todo}
        categories={categories}
        availableTags={[]}
        onClose={() => {}}
        onSave={onSave}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: 'High' }))
    fireEvent.change(screen.getByLabelText('Due date'), { target: { value: '2026-08-01' } })
    fireEvent.change(screen.getByLabelText('Category'), { target: { value: 'work-id' } })
    fireEvent.change(screen.getByLabelText('Add tag'), { target: { value: 'urgent' } })
    fireEvent.keyDown(screen.getByLabelText('Add tag'), { key: 'Enter' })

    fireEvent.click(screen.getByRole('button', { name: 'Save' }))

    await waitFor(() => expect(onSave).toHaveBeenCalled())

    const [id, patch] = onSave.mock.calls[0]
    expect(id).toBe('todo-1')
    expect(patch.priority).toBe('High')
    expect(patch.dueDate).toBe('2026-08-01')
    expect(patch.categoryId).toBe('work-id')
    expect(patch.tags).toEqual(['launch', 'urgent'])
  })

  it('defaults officeLinked to false and includes it unchanged in the save patch', async () => {
    const onSave = vi.fn().mockResolvedValue()
    render(
      <TodoDetail
        todo={todo}
        categories={categories}
        availableTags={[]}
        onClose={() => {}}
        onSave={onSave}
      />,
    )

    expect(screen.getByLabelText('Link to next office day')).not.toBeChecked()

    fireEvent.click(screen.getByRole('button', { name: 'Save' }))

    await waitFor(() => expect(onSave).toHaveBeenCalled())
    expect(onSave.mock.calls[0][1].officeLinked).toBe(false)
  })

  it('toggles officeLinked on and includes it in the save patch', async () => {
    const onSave = vi.fn().mockResolvedValue()
    render(
      <TodoDetail
        todo={todo}
        categories={categories}
        availableTags={[]}
        onClose={() => {}}
        onSave={onSave}
      />,
    )

    fireEvent.click(screen.getByLabelText('Link to next office day'))
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))

    await waitFor(() => expect(onSave).toHaveBeenCalled())
    expect(onSave.mock.calls[0][1].officeLinked).toBe(true)
  })

  it('defaults the recurrence picker to None when the todo has no recurrence', () => {
    render(
      <TodoDetail
        todo={todo}
        categories={categories}
        availableTags={[]}
        onClose={() => {}}
        onSave={vi.fn()}
      />,
    )

    expect(screen.getByRole('button', { name: 'None' })).toHaveAttribute('aria-pressed', 'true')
  })

  it('sets recurrence to Daily and includes it in the save patch', async () => {
    const onSave = vi.fn().mockResolvedValue()
    render(
      <TodoDetail
        todo={todo}
        categories={categories}
        availableTags={[]}
        onClose={() => {}}
        onSave={onSave}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Daily' }))
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))

    await waitFor(() => expect(onSave).toHaveBeenCalled())

    const [, patch] = onSave.mock.calls[0]
    expect(patch.recurrence).toEqual({ pattern: 'daily' })
  })

  it('preselects the existing recurrence pattern and can turn it off (None -> recurrence: null)', async () => {
    const recurringTodo = { ...todo, recurrence: { pattern: 'weekly' } }
    const onSave = vi.fn().mockResolvedValue()
    render(
      <TodoDetail
        todo={recurringTodo}
        categories={categories}
        availableTags={[]}
        onClose={() => {}}
        onSave={onSave}
      />,
    )

    expect(screen.getByRole('button', { name: 'Weekly' })).toHaveAttribute('aria-pressed', 'true')

    fireEvent.click(screen.getByRole('button', { name: 'None' }))
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))

    await waitFor(() => expect(onSave).toHaveBeenCalled())

    const [, patch] = onSave.mock.calls[0]
    expect(patch.recurrence).toBeNull()
  })

  it('calls onClose when Cancel is clicked', () => {
    const onClose = vi.fn()
    render(
      <TodoDetail
        todo={todo}
        categories={categories}
        availableTags={[]}
        onClose={onClose}
        onSave={vi.fn()}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))

    expect(onClose).toHaveBeenCalled()
  })
})
