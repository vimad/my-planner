import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import App from './App'

function jsonResponse(body, ok = true) {
  return Promise.resolve({
    ok,
    status: ok ? 200 : 500,
    json: () => Promise.resolve(body),
  })
}

const uncategorized = {
  _id: 'uncategorized-id',
  name: 'Uncategorized',
  color: '#94a3b8',
  system: true,
  remaining: 1,
  completed: 0,
}

const work = {
  _id: 'work-id',
  name: 'Work',
  color: '#4361ee',
  system: false,
  remaining: 3,
  completed: 2,
}

// Mutable per-test fixtures read live by the default fetch mock below, so
// individual tests can seed what the initial GET /api/todos returns just by
// reassigning `todosData` before render().
let categoriesData
let todosData

describe('App', () => {
  beforeEach(() => {
    categoriesData = [uncategorized, work]
    todosData = []
    vi.stubGlobal(
      'fetch',
      vi.fn((url) => {
        const href = String(url)
        if (href.includes('/api/todos')) return jsonResponse(todosData)
        if (href.includes('/api/categories')) return jsonResponse(categoriesData)
        return jsonResponse([])
      }),
    )
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('renders the dashboard heading', async () => {
    render(<App />)
    expect(screen.getByRole('heading', { name: 'My Planner' })).toBeInTheDocument()
  })

  it('renders category chips with remaining/completed counts', async () => {
    render(<App />)

    await waitFor(() => {
      expect(screen.getByText('Work')).toBeInTheDocument()
    })

    expect(screen.getByText('Uncategorized')).toBeInTheDocument()
    expect(screen.getByText('3 remaining · 2 completed')).toBeInTheDocument()
    expect(screen.getByText('1 remaining · 0 completed')).toBeInTheDocument()
  })

  it('does not show edit/delete controls for the system Uncategorized category', async () => {
    render(<App />)

    await waitFor(() => {
      expect(screen.getByText('Uncategorized')).toBeInTheDocument()
    })

    expect(screen.queryByLabelText('Delete Uncategorized')).not.toBeInTheDocument()
    expect(screen.getByLabelText('Delete Work')).toBeInTheDocument()
  })

  it('creates a new category', async () => {
    render(<App />)

    await waitFor(() => {
      expect(screen.getByText('Work')).toBeInTheDocument()
    })

    const personal = {
      _id: 'personal-id',
      name: 'Personal',
      color: '#e85d75',
      system: false,
      remaining: 0,
      completed: 0,
    }

    fetch.mockImplementationOnce(() => jsonResponse({}, true)) // POST
    fetch.mockImplementationOnce(() => jsonResponse([uncategorized, work, personal])) // refetch GET

    fireEvent.click(screen.getByRole('button', { name: '+ Add category' }))

    fireEvent.change(screen.getByLabelText('Category name'), {
      target: { value: 'Personal' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Rose' }))
    fireEvent.click(screen.getByRole('button', { name: 'Add category' }))

    await waitFor(() => {
      expect(screen.getByText('Personal')).toBeInTheDocument()
    })

    const postCall = fetch.mock.calls.find(([, opts]) => opts?.method === 'POST')
    expect(postCall).toBeDefined()
    expect(JSON.parse(postCall[1].body)).toEqual({ name: 'Personal', color: '#e85d75' })
  })

  it('renames a category', async () => {
    render(<App />)

    await waitFor(() => {
      expect(screen.getByText('Work')).toBeInTheDocument()
    })

    const renamed = { ...work, name: 'Deep Work' }

    fetch.mockImplementationOnce(() => jsonResponse({}, true)) // PATCH
    fetch.mockImplementationOnce(() => jsonResponse([uncategorized, renamed])) // refetch GET

    fireEvent.click(screen.getByLabelText('Edit Work'))
    fireEvent.change(screen.getByLabelText('Category name'), {
      target: { value: 'Deep Work' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))

    await waitFor(() => {
      expect(screen.getByText('Deep Work')).toBeInTheDocument()
    })

    const patchCall = fetch.mock.calls.find(([, opts]) => opts?.method === 'PATCH')
    expect(patchCall).toBeDefined()
    expect(patchCall[0]).toContain('/api/categories/work-id')
    expect(JSON.parse(patchCall[1].body)).toEqual({ name: 'Deep Work', color: '#4361ee' })
  })

  it('deletes a category', async () => {
    render(<App />)

    await waitFor(() => {
      expect(screen.getByText('Work')).toBeInTheDocument()
    })

    fetch.mockImplementationOnce(() => jsonResponse({}, true)) // DELETE
    fetch.mockImplementationOnce(() => jsonResponse([uncategorized])) // refetch GET

    fireEvent.click(screen.getByLabelText('Delete Work'))

    await waitFor(() => {
      expect(screen.queryByText('Work')).not.toBeInTheDocument()
    })

    const deleteCall = fetch.mock.calls.find(([, opts]) => opts?.method === 'DELETE')
    expect(deleteCall).toBeDefined()
    expect(deleteCall[0]).toContain('/api/categories/work-id')
  })

  it('shows an error message when loading categories fails', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => jsonResponse({ error: 'boom' }, false)),
    )

    render(<App />)

    await waitFor(() => {
      expect(screen.getByText(/Error:/)).toBeInTheDocument()
    })
  })

  describe('Todos', () => {
    it('quick-adds a todo and shows it in the agenda, refreshing category counts', async () => {
      render(<App />)
      await waitFor(() => {
        expect(screen.getByText('Work')).toBeInTheDocument()
      })

      const newTodo = {
        _id: 'todo-1',
        title: 'Buy milk',
        categoryId: 'uncategorized-id',
        completed: false,
        dueDate: null,
      }

      fetch.mockImplementationOnce(() => jsonResponse(newTodo, true)) // POST /api/todos
      fetch.mockImplementationOnce(() => jsonResponse([newTodo])) // refetch GET /api/todos
      fetch.mockImplementationOnce(() =>
        jsonResponse([{ ...uncategorized, remaining: 2 }, work]),
      ) // refetch GET /api/categories

      fireEvent.change(screen.getByLabelText('New todo title'), {
        target: { value: 'Buy milk' },
      })
      fireEvent.click(screen.getByRole('button', { name: 'Add' }))

      await waitFor(() => {
        expect(screen.getByText('Buy milk')).toBeInTheDocument()
      })

      const postCall = fetch.mock.calls.find(([, opts]) => opts?.method === 'POST')
      expect(postCall).toBeDefined()
      expect(postCall[0]).toContain('/api/todos')
      expect(JSON.parse(postCall[1].body)).toEqual({ title: 'Buy milk' })

      // Category chip counts reflect the follow-up GET /api/categories refetch.
      expect(screen.getByText('2 remaining · 0 completed')).toBeInTheDocument()
    })

    it('toggles a todo complete and it drops out of the open agenda', async () => {
      todosData = [
        {
          _id: 'todo-1',
          title: 'Buy milk',
          categoryId: 'uncategorized-id',
          completed: false,
          dueDate: null,
        },
      ]

      render(<App />)
      await waitFor(() => {
        expect(screen.getByText('Buy milk')).toBeInTheDocument()
      })

      fetch.mockImplementationOnce(() =>
        jsonResponse({ ...todosData[0], completed: true }, true),
      ) // PATCH toggle
      fetch.mockImplementationOnce(() => jsonResponse([{ ...todosData[0], completed: true }])) // refetch GET /api/todos
      fetch.mockImplementationOnce(() => jsonResponse([uncategorized, work])) // refetch GET /api/categories

      fireEvent.click(screen.getByLabelText('Complete Buy milk'))

      await waitFor(() => {
        expect(screen.queryByText('Buy milk')).not.toBeInTheDocument()
      })

      const patchCall = fetch.mock.calls.find(([, opts]) => opts?.method === 'PATCH')
      expect(patchCall).toBeDefined()
      expect(patchCall[0]).toContain('/api/todos/todo-1/toggle')
    })

    it('deletes a todo', async () => {
      todosData = [
        {
          _id: 'todo-1',
          title: 'Buy milk',
          categoryId: 'uncategorized-id',
          completed: false,
          dueDate: null,
        },
      ]

      render(<App />)
      await waitFor(() => {
        expect(screen.getByText('Buy milk')).toBeInTheDocument()
      })

      fetch.mockImplementationOnce(() => jsonResponse({}, true)) // DELETE
      fetch.mockImplementationOnce(() => jsonResponse([])) // refetch GET /api/todos
      fetch.mockImplementationOnce(() => jsonResponse([uncategorized, work])) // refetch GET /api/categories

      fireEvent.click(screen.getByLabelText('Delete Buy milk'))

      await waitFor(() => {
        expect(screen.queryByText('Buy milk')).not.toBeInTheDocument()
      })

      const deleteCall = fetch.mock.calls.find(([, opts]) => opts?.method === 'DELETE')
      expect(deleteCall).toBeDefined()
      expect(deleteCall[0]).toContain('/api/todos/todo-1')
    })

    it('shows a friendly message when there is nothing on the agenda', async () => {
      render(<App />)

      await waitFor(() => {
        expect(screen.getByText("Nothing on your agenda — you're all caught up.")).toBeInTheDocument()
      })
    })
  })
})
