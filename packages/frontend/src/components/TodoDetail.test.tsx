import type { DragEndEvent } from '@dnd-kit/core'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { describe, expect, it, vi } from 'vitest'
import type { Category, Todo } from '../types'
import { TodoDetail } from './TodoDetail'

// dnd-kit's real drag gesture recognition needs real layout (getBoundingClientRect)
// that jsdom can't provide, so pointer/keyboard drag physics aren't ours to
// re-test here - dnd-kit owns that contract. Instead, DndContext is stubbed to
// hand back its onDragEnd callback directly, letting tests drive our own
// reorder/rollback logic (the part this codebase owns) with a plain
// {active, over} event, the same shape dnd-kit itself would produce.

// Simulates typing into a Tiptap/ProseMirror editor. jsdom doesn't implement
// real contenteditable text insertion, so `fireEvent.paste` (which
// ProseMirror's paste handler reads `clipboardData` from directly, applying
// a transaction rather than relying on a DOM mutation to appear) is the
// reliable way to actually change the live document in these tests - see
// RichTextEditor.test.tsx, which establishes this same pattern.
function pasteText(node: Element, text: string) {
  fireEvent.paste(node, {
    clipboardData: { getData: (type: string) => (type === 'text/plain' ? text : '') },
  })
}

let capturedDragEnd: ((event: DragEndEvent) => void | Promise<void>) | undefined
vi.mock('@dnd-kit/core', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@dnd-kit/core')>()
  return {
    ...actual,
    DndContext: ({
      children,
      onDragEnd,
    }: {
      children: ReactNode
      onDragEnd: (event: DragEndEvent) => void | Promise<void>
    }) => {
      capturedDragEnd = onDragEnd
      return children
    },
  }
})
vi.mock('@dnd-kit/sortable', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@dnd-kit/sortable')>()
  return {
    ...actual,
    SortableContext: ({ children }: { children: ReactNode }) => children,
    useSortable: () => ({
      attributes: {},
      listeners: {},
      setNodeRef: () => {},
      transform: null,
      transition: null,
      isDragging: false,
    }),
  }
})

const categories: Category[] = [
  { _id: 'uncategorized-id', name: 'Uncategorized', color: '#94a3b8' },
  { _id: 'work-id', name: 'Work', color: '#f472b6' },
]

const todo: Todo = {
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
  it('renders the todo fields, including the rich-text body already editable by default', () => {
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
    expect(document.querySelector('[contenteditable]')).toHaveAttribute('contenteditable', 'true')
  })

  it('is editable immediately on open, with no Edit toggle anywhere in the popup', () => {
    render(
      <TodoDetail
        todo={todo}
        categories={categories}
        availableTags={[]}
        onClose={() => {}}
        onSave={vi.fn()}
      />,
    )

    expect(document.querySelector('[contenteditable]')).toHaveAttribute('contenteditable', 'true')
    expect(screen.queryByRole('button', { name: 'Edit' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Done editing' })).not.toBeInTheDocument()
  })

  it('shows no border accent or Save button for the parent notes box when nothing has changed', () => {
    render(
      <TodoDetail
        todo={todo}
        categories={categories}
        availableTags={[]}
        onClose={() => {}}
        onSave={vi.fn()}
        onSaveNotes={vi.fn()}
      />,
    )

    expect(screen.queryByRole('button', { name: 'Save notes' })).not.toBeInTheDocument()
    const editorBox = document.querySelector('[contenteditable]')?.closest('.min-h-\\[120px\\]')
    expect(editorBox?.className).toContain('border-slate-200')
    expect(editorBox?.className).not.toContain('border-fuchsia-400/60')
  })

  it('shows a border accent and Save button for the parent notes box once its content changes, and a successful save clears both', async () => {
    const onSaveNotes = vi.fn().mockResolvedValue(undefined)
    render(
      <TodoDetail
        todo={todo}
        categories={categories}
        availableTags={[]}
        onClose={() => {}}
        onSave={vi.fn()}
        onSaveNotes={onSaveNotes}
      />,
    )

    const editable = document.querySelector('[contenteditable]') as HTMLElement
    pasteText(editable, 'X')

    const saveButton = await screen.findByRole('button', { name: 'Save notes' })
    const editorBox = editable.closest('.min-h-\\[120px\\]')
    expect(editorBox?.className).toContain('border-fuchsia-400/60')

    fireEvent.click(saveButton)

    await waitFor(() => expect(onSaveNotes).toHaveBeenCalled())
    const [id, patch] = onSaveNotes.mock.calls[0]
    expect(id).toBe('todo-1')
    expect(patch.body).toBeTruthy()

    await waitFor(() => expect(screen.queryByRole('button', { name: 'Save notes' })).not.toBeInTheDocument())
    expect(editorBox?.className).not.toContain('border-fuchsia-400/60')
  })

  it('still shows the parent notes box as dirty after switching the Notes tab away and back with an unsaved edit', async () => {
    const linkableTodo: Todo = {
      _id: 'todo-2',
      title: 'Get filled EPF form',
      categoryId: 'work-id',
      priority: 'Low',
      dueDate: null,
      tags: [],
      completed: false,
      body: null,
    }
    render(
      <TodoDetail
        todo={todo}
        categories={categories}
        availableTags={[]}
        todos={[todo, linkableTodo]}
        onClose={() => {}}
        onSave={vi.fn()}
        onSaveNotes={vi.fn()}
      />,
    )

    const editable = document.querySelector('[contenteditable]') as HTMLElement
    pasteText(editable, 'X')
    expect(await screen.findByRole('button', { name: 'Save notes' })).toBeInTheDocument()

    fireEvent.click(screen.getByRole('tab', { name: 'Todos' }))
    fireEvent.click(screen.getByRole('tab', { name: 'Notes' }))

    expect(screen.getByRole('button', { name: 'Save notes' })).toBeInTheDocument()
  })

  it('saves edited priority, due date, category, and tags', async () => {
    const onSave = vi.fn().mockResolvedValue(undefined)
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
    const onSave = vi.fn().mockResolvedValue(undefined)
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
    const onSave = vi.fn().mockResolvedValue(undefined)
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
    const onSave = vi.fn().mockResolvedValue(undefined)
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
    const recurringTodo: Todo = { ...todo, recurrence: { pattern: 'weekly' } }
    const onSave = vi.fn().mockResolvedValue(undefined)
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
    const linkableTodo: Todo = {
      _id: 'todo-2',
      title: 'Get filled EPF form',
      categoryId: 'work-id',
      priority: 'Low',
      dueDate: null,
      tags: [],
      completed: false,
      body: null,
    }
    const otherTodo: Todo = {
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
    const allTodos: Todo[] = [todo, linkableTodo, otherTodo]

    it('collapses to a read-only header (title/priority/due date/category) on the Todos tab', () => {
      render(
        <TodoDetail
          todo={todo}
          categories={categories}
          availableTags={[]}
          todos={allTodos}
          onClose={() => {}}
          onSave={vi.fn()}
          onSaveNotes={vi.fn()}
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
          onSaveNotes={vi.fn()}
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
          onSaveNotes={vi.fn()}
        />,
      )

      fireEvent.click(screen.getByRole('tab', { name: 'Todos' }))
      fireEvent.change(screen.getByLabelText('Search todos to link'), { target: { value: 'EPF' } })
      fireEvent.click(screen.getByRole('button', { name: /Get filled EPF form/ }))

      fireEvent.click(screen.getByLabelText('Unlink Get filled EPF form'))

      expect(screen.queryByLabelText('Unlink Get filled EPF form')).not.toBeInTheDocument()
      expect(screen.getByRole('tab', { name: 'Todos' })).toBeInTheDocument()
    })

    it('renders the linked list in linkedTodoIds order, not the app-wide todos list order', () => {
      // allTodos is [todo, linkableTodo("todo-2"), otherTodo("todo-3")], but
      // linkedTodoIds deliberately lists todo-3 before todo-2 - the rendered
      // list must follow linkedTodoIds's own order, not allTodos's.
      render(
        <TodoDetail
          todo={{ ...todo, linkedTodoIds: ['todo-3', 'todo-2'] }}
          categories={categories}
          availableTags={[]}
          todos={allTodos}
          onClose={() => {}}
          onSave={vi.fn()}
          onSaveNotes={vi.fn()}
          onReorderLinkedTodos={vi.fn()}
        />,
      )

      fireEvent.click(screen.getByRole('tab', { name: 'Todos (2)' }))

      const unlinkButtons = screen.getAllByLabelText(/^Unlink /)
      expect(unlinkButtons.map((btn) => btn.getAttribute('aria-label'))).toEqual([
        'Unlink Chase approval from finance',
        'Unlink Get filled EPF form',
      ])
    })

    describe('reordering linked todos', () => {
      async function dragEnd(activeId: string, overId: string) {
        await act(async () => {
          // The mocked DndContext only ever hands back a minimal
          // {active, over} pair (see the vi.mock above) - not a full
          // DragEndEvent (activatorEvent/collisions/delta), which
          // handleDragEnd never reads - hence the cast.
          await capturedDragEnd?.({ active: { id: activeId }, over: { id: overId } } as DragEndEvent)
        })
      }

      it('persists the new order immediately via onReorderLinkedTodos, in linkedTodoIds order', async () => {
        const onReorderLinkedTodos = vi.fn().mockResolvedValue(true)
        render(
          <TodoDetail
            todo={{ ...todo, linkedTodoIds: ['todo-2', 'todo-3'] }}
            categories={categories}
            availableTags={[]}
            todos={allTodos}
            onClose={() => {}}
            onSave={vi.fn()}
            onSaveNotes={vi.fn()}
            onReorderLinkedTodos={onReorderLinkedTodos}
          />,
        )

        fireEvent.click(screen.getByRole('tab', { name: 'Todos (2)' }))
        await dragEnd('todo-2', 'todo-3')

        await waitFor(() => expect(onReorderLinkedTodos).toHaveBeenCalled())
        expect(onReorderLinkedTodos).toHaveBeenCalledWith('todo-1', { linkedTodoIds: ['todo-3', 'todo-2'] })

        const unlinkButtons = screen.getAllByLabelText(/^Unlink /)
        expect(unlinkButtons.map((btn) => btn.getAttribute('aria-label'))).toEqual([
          'Unlink Chase approval from finance',
          'Unlink Get filled EPF form',
        ])
      })

      it('does not call onSave or onSaveNotes when reordering', async () => {
        const onSave = vi.fn()
        const onSaveNotes = vi.fn()
        const onReorderLinkedTodos = vi.fn().mockResolvedValue(true)
        render(
          <TodoDetail
            todo={{ ...todo, linkedTodoIds: ['todo-2', 'todo-3'] }}
            categories={categories}
            availableTags={[]}
            todos={allTodos}
            onClose={() => {}}
            onSave={onSave}
            onSaveNotes={onSaveNotes}
            onReorderLinkedTodos={onReorderLinkedTodos}
          />,
        )

        fireEvent.click(screen.getByRole('tab', { name: 'Todos (2)' }))
        await dragEnd('todo-2', 'todo-3')

        await waitFor(() => expect(onReorderLinkedTodos).toHaveBeenCalled())
        expect(onSave).not.toHaveBeenCalled()
        expect(onSaveNotes).not.toHaveBeenCalled()
      })

      it('does not change which linked todo is selected', async () => {
        const onReorderLinkedTodos = vi.fn().mockResolvedValue(true)
        render(
          <TodoDetail
            todo={{ ...todo, linkedTodoIds: ['todo-2', 'todo-3'] }}
            categories={categories}
            availableTags={[]}
            todos={allTodos}
            onClose={() => {}}
            onSave={vi.fn()}
            onSaveNotes={vi.fn()}
            onReorderLinkedTodos={onReorderLinkedTodos}
          />,
        )

        fireEvent.click(screen.getByRole('tab', { name: 'Todos (2)' }))
        fireEvent.click(screen.getByText('Chase approval from finance'))
        expect(screen.getByText('waiting on finance')).toBeInTheDocument()

        await dragEnd('todo-2', 'todo-3')

        await waitFor(() => expect(onReorderLinkedTodos).toHaveBeenCalled())
        expect(screen.getByText('waiting on finance')).toBeInTheDocument()
      })

      it('reverts to the pre-drag order and leaves the failed save to the app-wide error banner when the save fails', async () => {
        const onReorderLinkedTodos = vi.fn().mockResolvedValue(false)
        render(
          <TodoDetail
            todo={{ ...todo, linkedTodoIds: ['todo-2', 'todo-3'] }}
            categories={categories}
            availableTags={[]}
            todos={allTodos}
            onClose={() => {}}
            onSave={vi.fn()}
            onSaveNotes={vi.fn()}
            onReorderLinkedTodos={onReorderLinkedTodos}
          />,
        )

        fireEvent.click(screen.getByRole('tab', { name: 'Todos (2)' }))
        await dragEnd('todo-2', 'todo-3')

        await waitFor(() => expect(onReorderLinkedTodos).toHaveBeenCalled())
        await waitFor(() => {
          const unlinkButtons = screen.getAllByLabelText(/^Unlink /)
          expect(unlinkButtons.map((btn) => btn.getAttribute('aria-label'))).toEqual([
            'Unlink Get filled EPF form',
            'Unlink Chase approval from finance',
          ])
        })
      })

      it('preserves a dangling linkedTodoIds entry in place when reordering the visible items around it', async () => {
        const onReorderLinkedTodos = vi.fn().mockResolvedValue(true)
        render(
          <TodoDetail
            todo={{ ...todo, linkedTodoIds: ['todo-2', 'missing-todo', 'todo-3'] }}
            categories={categories}
            availableTags={[]}
            todos={allTodos}
            onClose={() => {}}
            onSave={vi.fn()}
            onSaveNotes={vi.fn()}
            onReorderLinkedTodos={onReorderLinkedTodos}
          />,
        )

        fireEvent.click(screen.getByRole('tab', { name: 'Todos (2)' }))
        await dragEnd('todo-2', 'todo-3')

        await waitFor(() => expect(onReorderLinkedTodos).toHaveBeenCalled())
        expect(onReorderLinkedTodos).toHaveBeenCalledWith('todo-1', {
          linkedTodoIds: ['todo-3', 'missing-todo', 'todo-2'],
        })
      })
    })

    it('saves a selected linked todo\'s notes via its own Save button, independent of the parent Save', async () => {
      const onSave = vi.fn().mockResolvedValue(undefined)
      const onSaveNotes = vi.fn().mockResolvedValue(undefined)
      render(
        <TodoDetail
          todo={{ ...todo, linkedTodoIds: ['todo-3'] }}
          categories={categories}
          availableTags={[]}
          todos={allTodos}
          onClose={() => {}}
          onSave={onSave}
          onSaveNotes={onSaveNotes}
        />,
      )

      fireEvent.click(screen.getByRole('tab', { name: 'Todos (1)' }))
      fireEvent.click(screen.getByText('Chase approval from finance'))

      expect(screen.getByText('waiting on finance')).toBeInTheDocument()

      const editable = document.querySelector('[contenteditable]') as HTMLElement
      pasteText(editable, 'X')

      const saveButton = await screen.findByLabelText('Save notes for Chase approval from finance')
      fireEvent.click(saveButton)

      await waitFor(() => expect(onSaveNotes).toHaveBeenCalled())
      const [id, patch] = onSaveNotes.mock.calls[0]
      expect(id).toBe('todo-3')
      expect(patch.body).toBeTruthy()
      expect(onSave).not.toHaveBeenCalled()
    })

    describe('linked-notes panel dirty indicator', () => {
      it('shows no Save button or border for a freshly-selected linked todo with unmodified notes', () => {
        render(
          <TodoDetail
            todo={{ ...todo, linkedTodoIds: ['todo-3'] }}
            categories={categories}
            availableTags={[]}
            todos={allTodos}
            onClose={() => {}}
            onSave={vi.fn()}
            onSaveNotes={vi.fn()}
          />,
        )

        fireEvent.click(screen.getByRole('tab', { name: 'Todos (1)' }))
        fireEvent.click(screen.getByText('Chase approval from finance'))

        expect(
          screen.queryByLabelText('Save notes for Chase approval from finance'),
        ).not.toBeInTheDocument()
        const editable = document.querySelector('[contenteditable]') as HTMLElement
        const editorBox = editable.closest('.flex-1.overflow-hidden')
        expect(editorBox?.className).toContain('border-slate-200')
        expect(editorBox?.className).not.toContain('border-fuchsia-400/60')
      })

      it('shows a border accent and Save button once the linked todo\'s notes change, and a successful save clears both', async () => {
        const onSaveNotes = vi.fn().mockResolvedValue(undefined)
        render(
          <TodoDetail
            todo={{ ...todo, linkedTodoIds: ['todo-3'] }}
            categories={categories}
            availableTags={[]}
            todos={allTodos}
            onClose={() => {}}
            onSave={vi.fn()}
            onSaveNotes={onSaveNotes}
          />,
        )

        fireEvent.click(screen.getByRole('tab', { name: 'Todos (1)' }))
        fireEvent.click(screen.getByText('Chase approval from finance'))

        const editable = document.querySelector('[contenteditable]') as HTMLElement
        pasteText(editable, 'X')

        const saveButton = await screen.findByLabelText('Save notes for Chase approval from finance')
        const editorBox = editable.closest('.flex-1.overflow-hidden')
        expect(editorBox?.className).toContain('border-fuchsia-400/60')

        fireEvent.click(saveButton)

        await waitFor(() => expect(onSaveNotes).toHaveBeenCalled())

        await waitFor(() =>
          expect(
            screen.queryByLabelText('Save notes for Chase approval from finance'),
          ).not.toBeInTheDocument(),
        )
        expect(editorBox?.className).not.toContain('border-fuchsia-400/60')
      })

      it('tracks each linked todo\'s dirty state independently, and never marks the parent\'s own notes as dirty', async () => {
        render(
          <TodoDetail
            todo={{ ...todo, linkedTodoIds: ['todo-2', 'todo-3'] }}
            categories={categories}
            availableTags={[]}
            todos={allTodos}
            onClose={() => {}}
            onSave={vi.fn()}
            onSaveNotes={vi.fn()}
          />,
        )

        fireEvent.click(screen.getByRole('tab', { name: 'Todos (2)' }))
        fireEvent.click(screen.getByText('Chase approval from finance'))

        const editable = document.querySelector('[contenteditable]') as HTMLElement
        pasteText(editable, 'X')
        expect(
          await screen.findByLabelText('Save notes for Chase approval from finance'),
        ).toBeInTheDocument()

        // Switching to the other linked todo shows it as clean - editing
        // "Chase approval from finance" must not have marked it dirty too.
        fireEvent.click(screen.getByText('Get filled EPF form'))
        expect(
          screen.queryByLabelText('Save notes for Get filled EPF form'),
        ).not.toBeInTheDocument()

        // Switching back reflects "Chase approval from finance"'s own
        // still-pending unsaved edit, captured via linkedNotesOverrides.
        fireEvent.click(screen.getByText('Chase approval from finance'))
        expect(
          await screen.findByLabelText('Save notes for Chase approval from finance'),
        ).toBeInTheDocument()

        // The parent todo's own Notes tab was never touched by any of this.
        fireEvent.click(screen.getByRole('tab', { name: 'Notes' }))
        expect(screen.queryByRole('button', { name: 'Save notes' })).not.toBeInTheDocument()
      })
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
          onSaveNotes={vi.fn()}
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

    describe('enlarging notes editors', () => {
      it('renders an enlarge icon for both the parent notes editor and the selected linked todo\'s notes editor', () => {
        render(
          <TodoDetail
            todo={{ ...todo, linkedTodoIds: ['todo-3'] }}
            categories={categories}
            availableTags={[]}
            todos={allTodos}
            onClose={() => {}}
            onSave={vi.fn()}
            onSaveNotes={vi.fn()}
          />,
        )

        // Parent's own notes editor is on the Notes tab (the default tab).
        expect(screen.getByRole('button', { name: 'Enlarge notes editor' })).toBeInTheDocument()

        fireEvent.click(screen.getByRole('tab', { name: 'Todos (1)' }))
        fireEvent.click(screen.getByText('Chase approval from finance'))

        // Now on the Todos tab, only the linked-notes editor's enlarge icon
        // is rendered (the parent notes editor isn't mounted on this tab).
        expect(screen.getAllByRole('button', { name: 'Enlarge notes editor' })).toHaveLength(1)
      })

      it('enlarging the linked todo\'s notes editor does not enlarge the parent notes editor, and vice versa', () => {
        render(
          <TodoDetail
            todo={{ ...todo, linkedTodoIds: ['todo-3'] }}
            categories={categories}
            availableTags={[]}
            todos={allTodos}
            onClose={() => {}}
            onSave={vi.fn()}
            onSaveNotes={vi.fn()}
          />,
        )

        fireEvent.click(screen.getByRole('tab', { name: 'Todos (1)' }))
        fireEvent.click(screen.getByText('Chase approval from finance'))

        fireEvent.click(screen.getByRole('button', { name: 'Enlarge notes editor' }))
        expect(screen.getByRole('dialog', { name: 'Enlarged notes editor' })).toBeInTheDocument()

        // Switching back to the Notes tab shows the parent's own notes
        // editor, still collapsed (its own enlarge state is independent).
        fireEvent.click(screen.getByRole('tab', { name: 'Notes' }))
        expect(screen.getByRole('button', { name: 'Enlarge notes editor' })).toBeInTheDocument()
        expect(screen.queryByRole('dialog', { name: 'Enlarged notes editor' })).not.toBeInTheDocument()
      })

      it('resets the linked-notes editor\'s enlarge state to collapsed when a different linked todo is selected', () => {
        render(
          <TodoDetail
            todo={{ ...todo, linkedTodoIds: ['todo-2', 'todo-3'] }}
            categories={categories}
            availableTags={[]}
            todos={allTodos}
            onClose={() => {}}
            onSave={vi.fn()}
            onSaveNotes={vi.fn()}
          />,
        )

        fireEvent.click(screen.getByRole('tab', { name: 'Todos (2)' }))
        fireEvent.click(screen.getByText('Chase approval from finance'))
        fireEvent.click(screen.getByRole('button', { name: 'Enlarge notes editor' }))
        expect(screen.getByRole('dialog', { name: 'Enlarged notes editor' })).toBeInTheDocument()

        fireEvent.click(screen.getByText('Get filled EPF form'))

        expect(screen.queryByRole('dialog', { name: 'Enlarged notes editor' })).not.toBeInTheDocument()
        expect(screen.getByRole('button', { name: 'Enlarge notes editor' })).toBeInTheDocument()
      })
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
          onSaveNotes={vi.fn()}
        />,
      )

      fireEvent.change(screen.getByLabelText('Todo title'), { target: { value: 'Ship feature v2' } })
      fireEvent.click(screen.getByRole('tab', { name: 'Todos' }))
      fireEvent.click(screen.getByRole('tab', { name: 'Notes' }))

      expect(screen.getByLabelText('Todo title')).toHaveValue('Ship feature v2')
    })
  })

  it('acts as a "new todo" popup when given a todo with no id: prefills the title, defaults the category, and shows Add', async () => {
    const onSave = vi.fn().mockResolvedValue(undefined)
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
