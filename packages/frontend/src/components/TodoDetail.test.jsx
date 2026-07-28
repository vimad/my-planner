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

  it('does not show the Todos tab when no `todos` list is supplied (e.g. the new-todo popup)', () => {
    render(
      <TodoDetail
        todo={todo}
        categories={categories}
        availableTags={[]}
        onClose={() => {}}
        onSave={vi.fn()}
      />,
    )

    expect(screen.queryByRole('tab', { name: /Todos/ })).not.toBeInTheDocument()
  })

  describe('linking other todos', () => {
    const linkableTodo = {
      _id: 'todo-2',
      title: 'Get filled EPF form',
      categoryId: 'work-id',
      priority: 'Low',
      dueDate: null,
      tags: [],
      completed: false,
      body: null,
    }
    const otherTodo = {
      _id: 'todo-3',
      title: 'Chase approval from finance',
      categoryId: 'work-id',
      priority: 'Medium',
      dueDate: null,
      tags: [],
      completed: false,
      body: {
        type: 'doc',
        content: [{ type: 'paragraph', content: [{ type: 'text', text: 'waiting on finance' }] }],
      },
    }
    const allTodos = [todo, linkableTodo, otherTodo]

    it('collapses to a read-only header (title/priority/due date/category) on the Todos tab', () => {
      render(
        <TodoDetail
          todo={todo}
          categories={categories}
          availableTags={[]}
          todos={allTodos}
          onClose={() => {}}
          onSave={vi.fn()}
          onSaveLinkedTodo={vi.fn()}
        />,
      )

      fireEvent.click(screen.getByRole('tab', { name: 'Todos' }))

      expect(screen.queryByLabelText('Todo title')).not.toBeInTheDocument()
      expect(screen.getByRole('heading', { name: 'Ship feature' })).toBeInTheDocument()
      expect(screen.getByText('Medium')).toBeInTheDocument()
      expect(screen.getByText('Due 2026-07-25')).toBeInTheDocument()
    })

    it('searches candidates excluding the parent and already-linked todos, and links a result', () => {
      render(
        <TodoDetail
          todo={todo}
          categories={categories}
          availableTags={[]}
          todos={allTodos}
          onClose={() => {}}
          onSave={vi.fn()}
          onSaveLinkedTodo={vi.fn()}
        />,
      )

      fireEvent.click(screen.getByRole('tab', { name: 'Todos' }))
      fireEvent.change(screen.getByLabelText('Search todos to link'), { target: { value: 'EPF' } })

      expect(screen.getByRole('button', { name: /Get filled EPF form/ })).toBeInTheDocument()
      expect(screen.queryByText('Ship feature', { selector: 'button *' })).not.toBeInTheDocument()

      fireEvent.click(screen.getByRole('button', { name: /Get filled EPF form/ }))

      expect(screen.getByRole('tab', { name: 'Todos (1)' })).toBeInTheDocument()
      expect(screen.getByLabelText('Unlink Get filled EPF form')).toBeInTheDocument()
    })

    it('unlinks a linked todo via its × control', () => {
      render(
        <TodoDetail
          todo={todo}
          categories={categories}
          availableTags={[]}
          todos={allTodos}
          onClose={() => {}}
          onSave={vi.fn()}
          onSaveLinkedTodo={vi.fn()}
        />,
      )

      fireEvent.click(screen.getByRole('tab', { name: 'Todos' }))
      fireEvent.change(screen.getByLabelText('Search todos to link'), { target: { value: 'EPF' } })
      fireEvent.click(screen.getByRole('button', { name: /Get filled EPF form/ }))

      fireEvent.click(screen.getByLabelText('Unlink Get filled EPF form'))

      expect(screen.queryByLabelText('Unlink Get filled EPF form')).not.toBeInTheDocument()
      expect(screen.getByRole('tab', { name: 'Todos' })).toBeInTheDocument()
    })

    it('saves a selected linked todo\'s notes via its own Save button, independent of the parent Save', async () => {
      const onSave = vi.fn().mockResolvedValue()
      const onSaveLinkedTodo = vi.fn().mockResolvedValue()
      render(
        <TodoDetail
          todo={{ ...todo, linkedTodoIds: ['todo-3'] }}
          categories={categories}
          availableTags={[]}
          todos={allTodos}
          onClose={() => {}}
          onSave={onSave}
          onSaveLinkedTodo={onSaveLinkedTodo}
        />,
      )

      fireEvent.click(screen.getByRole('tab', { name: 'Todos (1)' }))
      fireEvent.click(screen.getByText('Chase approval from finance'))

      expect(screen.getByText('waiting on finance')).toBeInTheDocument()

      fireEvent.click(screen.getByLabelText('Save notes for Chase approval from finance'))

      await waitFor(() => expect(onSaveLinkedTodo).toHaveBeenCalled())
      const [id, patch] = onSaveLinkedTodo.mock.calls[0]
      expect(id).toBe('todo-3')
      expect(patch.body).toEqual(otherTodo.body)
      expect(onSave).not.toHaveBeenCalled()
    })

    it('applies list-style CSS (list-disc/list-decimal) to the linked-todo notes panel, not just the parent notes panel', () => {
      const { container } = render(
        <TodoDetail
          todo={{ ...todo, linkedTodoIds: ['todo-3'] }}
          categories={categories}
          availableTags={[]}
          todos={allTodos}
          onClose={() => {}}
          onSave={vi.fn()}
          onSaveLinkedTodo={vi.fn()}
        />,
      )

      fireEvent.click(screen.getByRole('tab', { name: 'Todos (1)' }))
      fireEvent.click(screen.getByText('Chase approval from finance'))

      // Tailwind resets <ul>/<ol> to list-style: none by default - without
      // this class on the wrapper, toggling a bullet/numbered list produces
      // correct HTML but renders no visible bullets or numbers at all.
      const hasListStyling = Array.from(container.querySelectorAll('*')).some((el) =>
        el.className?.includes?.('list-disc'),
      )
      expect(hasListStyling).toBe(true)
    })

    it('preserves unsaved edits to the parent\'s own title when switching to the Todos tab and back', () => {
      render(
        <TodoDetail
          todo={todo}
          categories={categories}
          availableTags={[]}
          todos={allTodos}
          onClose={() => {}}
          onSave={vi.fn()}
          onSaveLinkedTodo={vi.fn()}
        />,
      )

      fireEvent.change(screen.getByLabelText('Todo title'), { target: { value: 'Ship feature v2' } })
      fireEvent.click(screen.getByRole('tab', { name: 'Todos' }))
      fireEvent.click(screen.getByRole('tab', { name: 'Notes' }))

      expect(screen.getByLabelText('Todo title')).toHaveValue('Ship feature v2')
    })
  })

  it('acts as a "new todo" popup when given a todo with no id: prefills the title, defaults the category, and shows Add', async () => {
    const onSave = vi.fn().mockResolvedValue()
    render(
      <TodoDetail
        todo={{ title: 'Plan launch' }}
        categories={categories}
        availableTags={[]}
        onClose={() => {}}
        onSave={onSave}
      />,
    )

    expect(screen.getByRole('dialog', { name: 'New todo' })).toBeInTheDocument()
    expect(screen.getByLabelText('Todo title')).toHaveValue('Plan launch')
    expect(screen.getByLabelText('Category')).toHaveValue('uncategorized-id')
    expect(screen.getByRole('button', { name: 'Add' })).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Add' }))

    await waitFor(() => expect(onSave).toHaveBeenCalled())
    const [id, patch] = onSave.mock.calls[0]
    expect(id).toBeUndefined()
    expect(patch.title).toBe('Plan launch')
    expect(patch.categoryId).toBe('uncategorized-id')
  })
})
