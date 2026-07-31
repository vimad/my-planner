import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from 'vitest'
import App from './App'
import type { Category, Profile, ScratchNote, Todo } from './types'
import type { JSONContent } from '@tiptap/core'

interface FakeResponse {
  ok: boolean
  status: number
  json: () => Promise<unknown>
}

// Loose stand-in for RequestInit - only the fields App.tsx's fetch calls
// ever pass (method/headers/a JSON-stringified body).
interface FetchCallInit {
  method?: string
  headers?: Record<string, string>
  body?: string
}

type FetchMock = Mock<(url: string, init?: FetchCallInit) => Promise<FakeResponse>>

function jsonResponse(body: unknown, ok = true): Promise<FakeResponse> {
  return Promise.resolve({
    ok,
    status: ok ? 200 : 500,
    json: () => Promise.resolve(body),
  })
}

// Stubs global fetch with a fake that dispatches on the request URL, and
// returns the underlying mock so individual tests can queue further one-off
// responses (mockImplementationOnce) or inspect calls afterward.
function stubFetch(handler: (url: string) => Promise<FakeResponse>): FetchMock {
  const mock: FetchMock = vi.fn((url) => handler(String(url)))
  vi.stubGlobal('fetch', mock)
  return mock
}

const uncategorized: Category = {
  _id: 'uncategorized-id',
  name: 'Uncategorized',
  color: '#94a3b8',
  system: true,
  remaining: 1,
  completed: 0,
}

const work: Category = {
  _id: 'work-id',
  name: 'Work',
  color: '#4361ee',
  system: false,
  remaining: 3,
  completed: 2,
}

// The one profile most tests in this file operate within - they don't
// exercise profile-switching themselves (that's the 'Profile switcher'
// describe block below), so a single fixed profile keeps the existing
// category/todo/scratchpad flows unaffected by this ticket's scoping change.
// Deliberately not named "Work" (or anything else used as a category/todo
// fixture name below) - the profile switcher renders this name as a tab in
// the header, and a name collision would make `screen.getByText(...)`
// ambiguous about whether it matched the profile tab or a category chip.
const workProfile: Profile = { _id: 'work-profile-id', name: 'Default Profile' }

// Mutable per-test fixtures read live by the default fetch mock below, so
// individual tests can seed what the initial GET /api/todos returns just by
// reassigning `todosData` before render().
let categoriesData: Category[]
let todosData: Todo[]
let searchData: Todo[]
let profilesData: Profile[]
let fetchMock: FetchMock

describe('App', () => {
  beforeEach(() => {
    categoriesData = [uncategorized, work]
    todosData = []
    searchData = []
    profilesData = [workProfile]
    localStorage.clear()
    fetchMock = stubFetch((href) => {
      // Checked before the generic '/api/todos' branch below, since
      // '/api/todos/search?...' also contains that substring.
      if (href.includes('/api/todos/search')) return jsonResponse(searchData)
      if (href.includes('/api/todos')) return jsonResponse(todosData)
      if (href.includes('/api/categories')) return jsonResponse(categoriesData)
      if (href.includes('/api/profiles')) return jsonResponse(profilesData)
      return jsonResponse([])
    })
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    localStorage.clear()
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

    const personal: Category = {
      _id: 'personal-id',
      name: 'Personal',
      color: '#e85d75',
      system: false,
      remaining: 0,
      completed: 0,
    }

    fetchMock.mockImplementationOnce(() => jsonResponse({}, true)) // POST
    fetchMock.mockImplementationOnce(() => jsonResponse([uncategorized, work, personal])) // refetch GET

    fireEvent.click(screen.getByRole('button', { name: '+ Add category' }))

    fireEvent.change(screen.getByLabelText('Category name'), {
      target: { value: 'Personal' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Rose' }))
    fireEvent.click(screen.getByRole('button', { name: 'Add category' }))

    await waitFor(() => {
      expect(screen.getByText('Personal')).toBeInTheDocument()
    })

    const postCall = fetchMock.mock.calls.find(([, opts]) => opts?.method === 'POST')
    expect(postCall).toBeDefined()
    expect(JSON.parse(postCall![1]?.body ?? '{}')).toEqual({
      name: 'Personal',
      color: '#e85d75',
      profileId: 'work-profile-id',
    })
  })

  it('renames a category', async () => {
    render(<App />)

    await waitFor(() => {
      expect(screen.getByText('Work')).toBeInTheDocument()
    })

    const renamed = { ...work, name: 'Deep Work' }

    fetchMock.mockImplementationOnce(() => jsonResponse({}, true)) // PATCH
    fetchMock.mockImplementationOnce(() => jsonResponse([uncategorized, renamed])) // refetch GET

    fireEvent.click(screen.getByLabelText('Edit Work'))
    fireEvent.change(screen.getByLabelText('Category name'), {
      target: { value: 'Deep Work' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))

    await waitFor(() => {
      expect(screen.getByText('Deep Work')).toBeInTheDocument()
    })

    const patchCall = fetchMock.mock.calls.find(([, opts]) => opts?.method === 'PATCH')
    expect(patchCall).toBeDefined()
    expect(patchCall![0]).toContain('/api/categories/work-id')
    expect(JSON.parse(patchCall![1]?.body ?? '{}')).toEqual({ name: 'Deep Work', color: '#4361ee' })
  })

  it('deletes a category', async () => {
    render(<App />)

    await waitFor(() => {
      expect(screen.getByText('Work')).toBeInTheDocument()
    })

    fetchMock.mockImplementationOnce(() => jsonResponse({}, true)) // DELETE
    fetchMock.mockImplementationOnce(() => jsonResponse([uncategorized])) // refetch GET

    fireEvent.click(screen.getByLabelText('Delete Work'))
    fireEvent.click(screen.getByRole('button', { name: 'Confirm' }))

    await waitFor(() => {
      expect(screen.queryByText('Work')).not.toBeInTheDocument()
    })

    const deleteCall = fetchMock.mock.calls.find(([, opts]) => opts?.method === 'DELETE')
    expect(deleteCall).toBeDefined()
    expect(deleteCall![0]).toContain('/api/categories/work-id')
  })

  it('does not delete a category when the confirmation is cancelled', async () => {
    render(<App />)

    await waitFor(() => {
      expect(screen.getByText('Work')).toBeInTheDocument()
    })

    fireEvent.click(screen.getByLabelText('Delete Work'))
    expect(screen.getByText('Delete category "Work"? This cannot be undone.')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))

    expect(screen.getByText('Work')).toBeInTheDocument()
    expect(fetchMock.mock.calls.some(([, opts]) => opts?.method === 'DELETE')).toBe(false)
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

      const newTodo: Todo = {
        _id: 'todo-1',
        title: 'Buy milk',
        categoryId: 'uncategorized-id',
        completed: false,
        dueDate: null,
      }

      fetchMock.mockImplementationOnce(() => jsonResponse(newTodo, true)) // POST /api/todos
      fetchMock.mockImplementationOnce(() => jsonResponse([newTodo])) // refetch GET /api/todos
      fetchMock.mockImplementationOnce(() =>
        jsonResponse([{ ...uncategorized, remaining: 2 }, work]),
      ) // refetch GET /api/categories

      fireEvent.change(screen.getByLabelText('New todo title'), {
        target: { value: 'Buy milk' },
      })
      fireEvent.click(screen.getByRole('button', { name: 'Add' }))

      await waitFor(() => {
        expect(screen.getByText('Buy milk')).toBeInTheDocument()
      })

      const postCall = fetchMock.mock.calls.find(([, opts]) => opts?.method === 'POST')
      expect(postCall).toBeDefined()
      expect(postCall![0]).toContain('/api/todos')
      expect(JSON.parse(postCall![1]?.body ?? '{}')).toEqual({
        title: 'Buy milk',
        profileId: 'work-profile-id',
      })

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

      fetchMock.mockImplementationOnce(() =>
        jsonResponse({ ...todosData[0], completed: true }, true),
      ) // PATCH toggle
      fetchMock.mockImplementationOnce(() => jsonResponse([{ ...todosData[0], completed: true }])) // refetch GET /api/todos
      fetchMock.mockImplementationOnce(() => jsonResponse([uncategorized, work])) // refetch GET /api/categories

      fireEvent.click(screen.getByLabelText('Complete Buy milk'))
      fireEvent.click(screen.getByRole('button', { name: 'Confirm' }))

      await waitFor(() => {
        expect(screen.queryByText('Buy milk')).not.toBeInTheDocument()
      })

      const patchCall = fetchMock.mock.calls.find(([, opts]) => opts?.method === 'PATCH')
      expect(patchCall).toBeDefined()
      expect(patchCall![0]).toContain('/api/todos/todo-1/toggle')
    })

    it('does not mark a todo complete when the confirmation is cancelled', async () => {
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

      fireEvent.click(screen.getByLabelText('Complete Buy milk'))
      expect(screen.getByText('Mark "Buy milk" as completed?')).toBeInTheDocument()

      fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))

      expect(screen.getByText('Buy milk')).toBeInTheDocument()
      expect(fetchMock.mock.calls.some(([, opts]) => opts?.method === 'PATCH')).toBe(false)
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

      fetchMock.mockImplementationOnce(() => jsonResponse({}, true)) // DELETE
      fetchMock.mockImplementationOnce(() => jsonResponse([])) // refetch GET /api/todos
      fetchMock.mockImplementationOnce(() => jsonResponse([uncategorized, work])) // refetch GET /api/categories

      fireEvent.click(screen.getByLabelText('Delete Buy milk'))
      fireEvent.click(screen.getByRole('button', { name: 'Confirm' }))

      await waitFor(() => {
        expect(screen.queryByText('Buy milk')).not.toBeInTheDocument()
      })

      const deleteCall = fetchMock.mock.calls.find(([, opts]) => opts?.method === 'DELETE')
      expect(deleteCall).toBeDefined()
      expect(deleteCall![0]).toContain('/api/todos/todo-1')
    })

    it('shows a friendly message when there is nothing on the agenda', async () => {
      render(<App />)

      await waitFor(() => {
        expect(screen.getByText("Nothing on your agenda — you're all caught up.")).toBeInTheDocument()
      })
    })

    it('filters the agenda by category via chip toggles, supporting multi-select', async () => {
      todosData = [
        { _id: 'todo-1', title: 'Buy milk', categoryId: 'uncategorized-id', completed: false, dueDate: null },
        { _id: 'todo-2', title: 'Ship feature', categoryId: 'work-id', completed: false, dueDate: null },
      ]

      render(<App />)
      await waitFor(() => {
        expect(screen.getByText('Buy milk')).toBeInTheDocument()
        expect(screen.getByText('Ship feature')).toBeInTheDocument()
        // Category chips (the filter targets below) load via their own
        // effect, scoped to the active profile once it resolves - wait for
        // them explicitly rather than assuming they're ready alongside todos.
        expect(screen.getByLabelText('Filter by Uncategorized')).toBeInTheDocument()
      })

      fireEvent.click(screen.getByLabelText('Filter by Uncategorized'))

      expect(screen.getByText('Buy milk')).toBeInTheDocument()
      expect(screen.queryByText('Ship feature')).not.toBeInTheDocument()
      expect(screen.getByLabelText('Filter by Uncategorized')).toHaveAttribute('aria-pressed', 'true')

      // Selecting a second chip is additive (OR filter), not a replace.
      fireEvent.click(screen.getByLabelText('Filter by Work'))

      expect(screen.getByText('Buy milk')).toBeInTheDocument()
      expect(screen.getByText('Ship feature')).toBeInTheDocument()

      // Clicking the first chip again clears just that one.
      fireEvent.click(screen.getByLabelText('Filter by Uncategorized'))

      expect(screen.queryByText('Buy milk')).not.toBeInTheDocument()
      expect(screen.getByText('Ship feature')).toBeInTheDocument()
      expect(screen.getByLabelText('Filter by Uncategorized')).toHaveAttribute('aria-pressed', 'false')
    })

    it('shows only completed todos when "Show completed" is checked', async () => {
      todosData = [
        { _id: 'todo-1', title: 'Buy milk', categoryId: 'uncategorized-id', completed: false, dueDate: null },
        {
          _id: 'todo-2',
          title: 'Old finished task',
          categoryId: 'uncategorized-id',
          completed: true,
          dueDate: null,
          updatedAt: '2026-07-01T00:00:00.000Z',
        },
      ]

      render(<App />)
      await waitFor(() => {
        expect(screen.getByText('Buy milk')).toBeInTheDocument()
      })

      expect(screen.queryByText('Old finished task')).not.toBeInTheDocument()

      fireEvent.click(screen.getByLabelText('Show completed'))

      expect(screen.getByText('Old finished task')).toBeInTheDocument()
      expect(screen.queryByText('Buy milk')).not.toBeInTheDocument()
    })

    it('opens the todo detail view on click and saves an edited priority', async () => {
      todosData = [
        {
          _id: 'todo-1',
          title: 'Buy milk',
          categoryId: 'uncategorized-id',
          completed: false,
          dueDate: null,
          priority: 'Medium',
          tags: [],
          body: null,
        },
      ]

      render(<App />)
      await waitFor(() => {
        expect(screen.getByText('Buy milk')).toBeInTheDocument()
      })

      fireEvent.click(screen.getByText('Buy milk'))

      expect(screen.getByRole('dialog', { name: 'Edit Buy milk' })).toBeInTheDocument()

      fetchMock.mockImplementationOnce(() =>
        jsonResponse({ ...todosData[0], priority: 'High' }, true),
      ) // PATCH /api/todos/todo-1
      fetchMock.mockImplementationOnce(() =>
        jsonResponse([{ ...todosData[0], priority: 'High' }]),
      ) // refetch GET /api/todos
      fetchMock.mockImplementationOnce(() => jsonResponse([uncategorized, work])) // refetch GET /api/categories
      fetchMock.mockImplementationOnce(() => jsonResponse(['errand'])) // refetch GET /api/todos/tags

      fireEvent.click(screen.getByRole('button', { name: 'High' }))
      fireEvent.click(screen.getByRole('button', { name: 'Save' }))

      await waitFor(() => {
        expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
      })

      const patchCall = fetchMock.mock.calls.find(([, opts]) => opts?.method === 'PATCH')
      expect(patchCall).toBeDefined()
      expect(patchCall![0]).toContain('/api/todos/todo-1')
      expect(JSON.parse(patchCall![1]?.body ?? '{}')).toMatchObject({ priority: 'High' })
    })

    it('filters the agenda by hitting the search endpoint as the user types', async () => {
      todosData = [
        {
          _id: 'todo-1',
          title: 'Buy milk',
          categoryId: 'uncategorized-id',
          completed: false,
          dueDate: null,
        },
        {
          _id: 'todo-2',
          title: 'Ship feature',
          categoryId: 'work-id',
          completed: false,
          dueDate: null,
        },
      ]

      render(<App />)
      await waitFor(() => {
        expect(screen.getByText('Buy milk')).toBeInTheDocument()
        expect(screen.getByText('Ship feature')).toBeInTheDocument()
      })

      searchData = [todosData[0]]

      fireEvent.change(screen.getByLabelText('Search todos'), { target: { value: 'milk' } })

      await waitFor(() => {
        expect(screen.queryByText('Ship feature')).not.toBeInTheDocument()
      })
      expect(screen.getByText('Buy milk')).toBeInTheDocument()

      const searchCall = fetchMock.mock.calls.find(([url]) => url.includes('/api/todos/search'))
      expect(searchCall).toBeDefined()
      expect(searchCall![0]).toContain('q=milk')

      // Clearing the query falls back to the normal unfiltered agenda.
      fireEvent.change(screen.getByLabelText('Search todos'), { target: { value: '' } })

      await waitFor(() => {
        expect(screen.getByText('Ship feature')).toBeInTheDocument()
      })
    })
  })

  describe('Scratchpad', () => {
    it('captures a quick note from the persistent bottom bar', async () => {
      const newNote: ScratchNote = {
        _id: 'note-1',
        body: [{ id: 'line-1', content: null, promotedTodoId: null }],
        archived: false,
        createdAt: '2026-07-25T10:00:00.000Z',
      }

      render(<App />)
      await waitFor(() => {
        expect(screen.getByText('Work')).toBeInTheDocument()
      })

      fetchMock.mockImplementationOnce(() => jsonResponse(newNote, true)) // POST /api/scratch-notes
      fetchMock.mockImplementationOnce(() => jsonResponse([newNote])) // refetch GET /api/scratch-notes

      fireEvent.click(screen.getByRole('button', { name: 'Jot something down...' }))
      fireEvent.click(screen.getByRole('button', { name: 'Save' }))

      await waitFor(() => {
        expect(screen.getByLabelText('Open scratchpad sessions (1)')).toBeInTheDocument()
      })

      const postCall = fetchMock.mock.calls.find(
        ([url, opts]) => url.includes('/api/scratch-notes') && opts?.method === 'POST',
      )
      expect(postCall).toBeDefined()
      const body = JSON.parse(postCall![1]?.body ?? '{}')
      expect(body.body).toHaveLength(1)
      expect(body.body[0]).toHaveProperty('content')
    })

    it('promotes a scratch note line into a todo, from the sessions panel', async () => {
      const lineContent: JSONContent = {
        type: 'doc',
        content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Call the dentist' }] }],
      }
      const note: ScratchNote = {
        _id: 'note-1',
        createdAt: '2026-07-25T10:00:00.000Z',
        archived: false,
        body: [{ id: 'line-1', content: lineContent, promotedTodoId: null }],
      }

      fetchMock = stubFetch((href) => {
        if (href.includes('/api/scratch-notes')) return jsonResponse([note])
        if (href.includes('/api/todos')) return jsonResponse(todosData)
        if (href.includes('/api/categories')) return jsonResponse(categoriesData)
        if (href.includes('/api/profiles')) return jsonResponse(profilesData)
        return jsonResponse([])
      })

      render(<App />)
      await waitFor(() => {
        expect(screen.getByLabelText('Open scratchpad sessions (1)')).toBeInTheDocument()
      })

      fireEvent.click(screen.getByLabelText('Open scratchpad sessions (1)'))
      await waitFor(() => {
        expect(screen.getByText('Call the dentist')).toBeInTheDocument()
      })

      const promotedNote: ScratchNote = {
        ...note,
        body: [{ ...note.body[0], promotedTodoId: 'todo-99' }],
      }

      fetchMock.mockImplementationOnce(() =>
        jsonResponse({ todo: { _id: 'todo-99', title: 'Call the dentist' }, note: promotedNote }, true),
      ) // POST /api/scratch-notes/note-1/promote
      fetchMock.mockImplementationOnce(() => jsonResponse([promotedNote])) // refetch GET /api/scratch-notes
      fetchMock.mockImplementationOnce(() => jsonResponse(todosData)) // refetch GET /api/todos
      fetchMock.mockImplementationOnce(() => jsonResponse(categoriesData)) // refetch GET /api/categories

      fireEvent.click(screen.getByLabelText('Promote line-1'))
      fireEvent.click(screen.getByText('Promote 1 line'))
      fireEvent.click(screen.getByRole('button', { name: 'Confirm promote' }))

      await waitFor(() => {
        expect(screen.getByText('✓ linked to todo')).toBeInTheDocument()
      })

      const promoteCall = fetchMock.mock.calls.find(([url]) =>
        url.includes('/api/scratch-notes/note-1/promote'),
      )
      expect(promoteCall).toBeDefined()
      expect(JSON.parse(promoteCall![1]?.body ?? '{}')).toMatchObject({
        lineId: 'line-1',
        priority: 'Medium',
      })
    })

    it('deletes a scratch note only after the confirmation is accepted', async () => {
      const note: ScratchNote = {
        _id: 'note-1',
        createdAt: '2026-07-25T10:00:00.000Z',
        archived: false,
        body: [{ id: 'line-1', content: null, promotedTodoId: null }],
      }

      fetchMock = stubFetch((href) => {
        if (href.includes('/api/scratch-notes')) return jsonResponse([note])
        if (href.includes('/api/todos')) return jsonResponse(todosData)
        if (href.includes('/api/categories')) return jsonResponse(categoriesData)
        if (href.includes('/api/profiles')) return jsonResponse(profilesData)
        return jsonResponse([])
      })

      render(<App />)
      await waitFor(() => {
        expect(screen.getByLabelText('Open scratchpad sessions (1)')).toBeInTheDocument()
      })

      fireEvent.click(screen.getByLabelText('Open scratchpad sessions (1)'))
      await waitFor(() => {
        expect(screen.getByLabelText('Delete note')).toBeInTheDocument()
      })

      fireEvent.click(screen.getByLabelText('Delete note'))
      fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))

      expect(fetchMock.mock.calls.some(([, opts]) => opts?.method === 'DELETE')).toBe(false)

      fetchMock.mockImplementationOnce(() => jsonResponse({}, true)) // DELETE
      fetchMock.mockImplementationOnce(() => jsonResponse([])) // refetch GET /api/scratch-notes

      fireEvent.click(screen.getByLabelText('Delete note'))
      fireEvent.click(screen.getByRole('button', { name: 'Confirm' }))

      await waitFor(() => {
        const deleteCall = fetchMock.mock.calls.find(([, opts]) => opts?.method === 'DELETE')
        expect(deleteCall).toBeDefined()
        expect(deleteCall![0]).toContain('/api/scratch-notes/note-1')
      })
    })
  })

  describe('Profile switcher', () => {
    const personalProfile: Profile = { _id: 'personal-profile-id', name: 'Personal Profile' }

    const workOnlyCategory: Category = {
      _id: 'work-cat-id',
      name: 'Deep Work',
      color: '#4361ee',
      system: false,
      remaining: 1,
      completed: 0,
    }

    const personalOnlyCategory: Category = {
      _id: 'personal-cat-id',
      name: 'Errands',
      color: '#e85d75',
      system: false,
      remaining: 2,
      completed: 0,
    }

    // Dispatches GET /api/categories by the profileId query param it was
    // called with, so switching profiles is observably scoped rather than
    // just re-requesting the same fixed list.
    function stubProfileScopedFetch(profiles: Profile[]): FetchMock {
      return stubFetch((href) => {
        if (href.includes('/api/categories')) {
          const profileId = new URL(href, 'http://localhost').searchParams.get('profileId')
          return jsonResponse(profileId === 'personal-profile-id' ? [personalOnlyCategory] : [workOnlyCategory])
        }
        if (href.includes('/api/profiles')) return jsonResponse(profiles)
        if (href.includes('/api/todos')) return jsonResponse([])
        return jsonResponse([])
      })
    }

    it('renders every profile and lets the user pick the active one, re-scoping categories', async () => {
      fetchMock = stubProfileScopedFetch([workProfile, personalProfile])

      render(<App />)

      await waitFor(() => {
        expect(screen.getByText('Deep Work')).toBeInTheDocument()
      })
      expect(screen.queryByText('Errands')).not.toBeInTheDocument()

      expect(screen.getByRole('tab', { name: 'Default Profile' })).toHaveAttribute('aria-selected', 'true')
      expect(screen.getByRole('tab', { name: 'Personal Profile' })).toHaveAttribute('aria-selected', 'false')

      fireEvent.click(screen.getByRole('tab', { name: 'Personal Profile' }))

      await waitFor(() => {
        expect(screen.getByText('Errands')).toBeInTheDocument()
      })
      expect(screen.queryByText('Deep Work')).not.toBeInTheDocument()

      const categoryCalls = fetchMock.mock.calls
        .filter(([url]) => url.includes('/api/categories'))
        .map(([url]) => url)
      expect(categoryCalls.some((url) => url.includes('profileId=personal-profile-id'))).toBe(true)
      expect(categoryCalls.some((url) => url.includes('profileId=work-profile-id'))).toBe(true)
    })

    it('persists the active profile to localStorage and restores it on reload', async () => {
      fetchMock = stubProfileScopedFetch([workProfile, personalProfile])

      const { unmount } = render(<App />)
      await waitFor(() => {
        expect(screen.getByText('Deep Work')).toBeInTheDocument()
      })

      fireEvent.click(screen.getByRole('tab', { name: 'Personal Profile' }))
      await waitFor(() => {
        expect(screen.getByText('Errands')).toBeInTheDocument()
      })

      expect(localStorage.getItem('planner-active-profile-id')).toBe('personal-profile-id')

      unmount()
      fetchMock = stubProfileScopedFetch([workProfile, personalProfile])

      render(<App />)

      await waitFor(() => {
        expect(screen.getByText('Errands')).toBeInTheDocument()
      })
      expect(screen.queryByText('Deep Work')).not.toBeInTheDocument()
      expect(screen.getByRole('tab', { name: 'Personal Profile' })).toHaveAttribute('aria-selected', 'true')
    })

    it('falls back to the first profile when the stored profile id no longer exists', async () => {
      localStorage.setItem('planner-active-profile-id', 'a-deleted-profile-id')
      fetchMock = stubProfileScopedFetch([workProfile, personalProfile])

      render(<App />)

      await waitFor(() => {
        expect(screen.getByText('Deep Work')).toBeInTheDocument()
      })
      expect(screen.getByRole('tab', { name: 'Default Profile' })).toHaveAttribute('aria-selected', 'true')
    })

    it('creates a new profile inline and switches straight into it', async () => {
      fetchMock = stubProfileScopedFetch([workProfile])

      render(<App />)
      await waitFor(() => {
        expect(screen.getByText('Deep Work')).toBeInTheDocument()
      })

      const sideProject: Profile = { _id: 'side-project-id', name: 'Side Project' }
      fetchMock.mockImplementationOnce(() => jsonResponse(sideProject, true)) // POST /api/profiles
      fetchMock.mockImplementationOnce(() => jsonResponse([personalOnlyCategory])) // refetch GET /api/categories

      fireEvent.click(screen.getByLabelText('Create new profile'))
      fireEvent.change(screen.getByLabelText('New profile name'), {
        target: { value: 'Side Project' },
      })
      fireEvent.click(screen.getByRole('button', { name: 'Add profile' }))

      await waitFor(() => {
        expect(screen.getByRole('tab', { name: 'Side Project' })).toBeInTheDocument()
      })
      expect(screen.getByRole('tab', { name: 'Side Project' })).toHaveAttribute('aria-selected', 'true')

      const postCall = fetchMock.mock.calls.find(
        ([url, opts]) => url.includes('/api/profiles') && opts?.method === 'POST',
      )
      expect(postCall).toBeDefined()
      expect(JSON.parse(postCall![1]?.body ?? '{}')).toEqual({ name: 'Side Project' })
      expect(localStorage.getItem('planner-active-profile-id')).toBe('side-project-id')
    })

    it('renames a profile from the switcher', async () => {
      fetchMock = stubProfileScopedFetch([workProfile, personalProfile])

      render(<App />)
      await waitFor(() => {
        expect(screen.getByRole('tab', { name: 'Default Profile' })).toBeInTheDocument()
      })

      const renamedProfile = { ...workProfile, name: 'Renamed Profile' }
      fetchMock.mockImplementationOnce(() => jsonResponse(renamedProfile, true)) // PATCH

      fireEvent.click(screen.getByLabelText('Manage profiles'))
      fireEvent.click(screen.getByLabelText('Rename Default Profile'))
      fireEvent.change(screen.getByLabelText('Profile name'), {
        target: { value: 'Renamed Profile' },
      })
      fireEvent.click(screen.getByRole('button', { name: 'Save' }))

      await waitFor(() => {
        expect(screen.getByRole('tab', { name: 'Renamed Profile' })).toBeInTheDocument()
      })
      expect(screen.queryByRole('tab', { name: 'Default Profile' })).not.toBeInTheDocument()

      const patchCall = fetchMock.mock.calls.find(
        ([url, opts]) => url.includes('/api/profiles/') && opts?.method === 'PATCH',
      )
      expect(patchCall).toBeDefined()
      expect(patchCall![0]).toContain('/api/profiles/work-profile-id')
      expect(JSON.parse(patchCall![1]?.body ?? '{}')).toEqual({ name: 'Renamed Profile' })
    })

    it('shows real category/todo counts in the delete confirmation and deletes on confirm', async () => {
      fetchMock = stubProfileScopedFetch([workProfile, personalProfile])

      render(<App />)
      await waitFor(() => {
        expect(screen.getByText('Deep Work')).toBeInTheDocument()
      })

      // workOnlyCategory carries remaining:1/completed:0 - a single category
      // with a single todo - so the confirmation should name exactly that.
      fireEvent.click(screen.getByLabelText('Manage profiles'))
      fireEvent.click(screen.getByLabelText('Delete Default Profile'))

      await waitFor(() => {
        expect(
          screen.getByText(
            'Delete "Default Profile"? This will also delete its 1 category and 1 todo, plus any scratch notes in it. This cannot be undone.',
          ),
        ).toBeInTheDocument()
      })

      fetchMock.mockImplementationOnce(() => jsonResponse({}, true)) // DELETE

      fireEvent.click(screen.getByRole('button', { name: 'Confirm' }))

      await waitFor(() => {
        expect(screen.queryByRole('tab', { name: 'Default Profile' })).not.toBeInTheDocument()
      })

      const deleteCall = fetchMock.mock.calls.find(
        ([url, opts]) => url.includes('/api/profiles/') && opts?.method === 'DELETE',
      )
      expect(deleteCall).toBeDefined()
      expect(deleteCall![0]).toContain('/api/profiles/work-profile-id')
    })

    it('does not delete a profile when the confirmation is cancelled', async () => {
      fetchMock = stubProfileScopedFetch([workProfile, personalProfile])

      render(<App />)
      await waitFor(() => {
        expect(screen.getByText('Deep Work')).toBeInTheDocument()
      })

      fireEvent.click(screen.getByLabelText('Manage profiles'))
      fireEvent.click(screen.getByLabelText('Delete Default Profile'))
      await waitFor(() => {
        expect(screen.getByText(/^Delete "Default Profile"\?/)).toBeInTheDocument()
      })

      fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))

      expect(screen.getByRole('tab', { name: 'Default Profile' })).toBeInTheDocument()
      expect(fetchMock.mock.calls.some(([url, opts]) => url.includes('/api/profiles/') && opts?.method === 'DELETE')).toBe(
        false,
      )
    })

    it('falls back to a generic delete message when the count fetch fails', async () => {
      fetchMock = stubFetch((href) => {
        if (href.includes('/api/categories')) return jsonResponse({ error: 'boom' }, false)
        if (href.includes('/api/profiles')) return jsonResponse([workProfile, personalProfile])
        if (href.includes('/api/todos')) return jsonResponse([])
        return jsonResponse([])
      })

      render(<App />)
      await waitFor(() => {
        expect(screen.getByRole('tab', { name: 'Default Profile' })).toBeInTheDocument()
      })

      fireEvent.click(screen.getByLabelText('Manage profiles'))
      fireEvent.click(screen.getByLabelText('Delete Default Profile'))

      await waitFor(() => {
        expect(
          screen.getByText(
            'Delete "Default Profile"? This will also delete everything inside it — its categories, todos, and scratch notes. This cannot be undone.',
          ),
        ).toBeInTheDocument()
      })
    })

    it('disables delete when only one profile remains', async () => {
      fetchMock = stubProfileScopedFetch([workProfile])

      render(<App />)
      await waitFor(() => {
        expect(screen.getByRole('tab', { name: 'Default Profile' })).toBeInTheDocument()
      })

      fireEvent.click(screen.getByLabelText('Manage profiles'))
      expect(screen.getByLabelText('Delete Default Profile')).toBeDisabled()
    })

    it('reassigns the active profile and updates localStorage after deleting the active profile', async () => {
      fetchMock = stubProfileScopedFetch([workProfile, personalProfile])

      render(<App />)
      await waitFor(() => {
        expect(screen.getByRole('tab', { name: 'Default Profile' })).toHaveAttribute('aria-selected', 'true')
      })

      fireEvent.click(screen.getByLabelText('Manage profiles'))
      fireEvent.click(screen.getByLabelText('Delete Default Profile'))
      await waitFor(() => {
        expect(screen.getByText(/^Delete "Default Profile"\?/)).toBeInTheDocument()
      })

      fetchMock.mockImplementationOnce(() => jsonResponse({}, true)) // DELETE

      fireEvent.click(screen.getByRole('button', { name: 'Confirm' }))

      await waitFor(() => {
        expect(screen.getByRole('tab', { name: 'Personal Profile' })).toHaveAttribute('aria-selected', 'true')
      })
      expect(screen.queryByRole('tab', { name: 'Default Profile' })).not.toBeInTheDocument()
      expect(localStorage.getItem('planner-active-profile-id')).toBe('personal-profile-id')

      // The now-active profile's own categories load, proving the app is in
      // a fully valid state rather than just showing the right tab.
      await waitFor(() => {
        expect(screen.getByText('Errands')).toBeInTheDocument()
      })
    })
  })

  // Ticket 04: todos have no direct profileId (derived transitively via
  // categoryId -> Category.profileId), but every todo-driven view - the
  // agenda, the mini calendar's due-date markers, quick-add's default
  // category, and search - must still narrow to the active profile with no
  // stale cross-profile data left visible after a switch.
  describe('Todo/dashboard scoping across profiles', () => {
    const workTodo: Todo = {
      _id: 'work-todo-id',
      title: 'Ship feature',
      categoryId: 'work-cat-id',
      completed: false,
      dueDate: '2026-07-28',
    }

    const personalTodo: Todo = {
      _id: 'personal-todo-id',
      title: 'Buy groceries',
      categoryId: 'personal-cat-id',
      completed: false,
      dueDate: '2026-07-29',
    }

    const workOnlyCategory: Category = {
      _id: 'work-cat-id',
      name: 'Deep Work',
      color: '#4361ee',
      system: false,
      remaining: 1,
      completed: 0,
    }

    const personalOnlyCategory: Category = {
      _id: 'personal-cat-id',
      name: 'Errands',
      color: '#e85d75',
      system: false,
      remaining: 1,
      completed: 0,
    }

    const personalProfile: Profile = { _id: 'personal-profile-id', name: 'Personal Profile' }

    // Dispatches every todo-adjacent endpoint (list/search/tags) *and*
    // categories by the profileId query param it was called with, so a
    // profile switch is observably scoped end-to-end rather than just
    // re-requesting the same fixed data.
    function stubTodoScopedFetch(): FetchMock {
      return stubFetch((href) => {
        const profileId = new URL(href, 'http://localhost').searchParams.get('profileId')
        const isPersonal = profileId === 'personal-profile-id'
        if (href.includes('/api/todos/search')) return jsonResponse(isPersonal ? [personalTodo] : [workTodo])
        if (href.includes('/api/todos/tags')) return jsonResponse(isPersonal ? ['errand'] : ['urgent'])
        if (href.includes('/api/todos')) return jsonResponse(isPersonal ? [personalTodo] : [workTodo])
        if (href.includes('/api/categories')) {
          return jsonResponse(isPersonal ? [personalOnlyCategory] : [workOnlyCategory])
        }
        if (href.includes('/api/profiles')) return jsonResponse([workProfile, personalProfile])
        return jsonResponse([])
      })
    }

    beforeEach(() => {
      // Matches MiniCalendar.test.tsx's own convention - fixes "today" so
      // the mini calendar's due-date markers (asserted below) are
      // deterministic instead of depending on the real wall clock.
      // shouldAdvanceTime keeps real timers ticking underneath (needed for
      // RTL's waitFor, which polls on a real setInterval) while Date()
      // itself stays pinned.
      vi.useFakeTimers({ shouldAdvanceTime: true })
      vi.setSystemTime(new Date(2026, 6, 25, 9, 0)) // July 25, 2026
    })

    afterEach(() => {
      vi.useRealTimers()
    })

    it('shows only the active profile\'s todos in the agenda and mini calendar, re-scoping immediately on switch', async () => {
      fetchMock = stubTodoScopedFetch()

      render(<App />)

      await waitFor(() => {
        expect(screen.getByText('Ship feature')).toBeInTheDocument()
      })
      expect(screen.queryByText('Buy groceries')).not.toBeInTheDocument()
      // Mini calendar's due-date marker follows the same profile-scoped
      // `todos` state the agenda reads from.
      expect(screen.getByText('28').querySelector('span')).not.toBeNull()
      expect(screen.getByText('29').querySelector('span')).toBeNull()

      fireEvent.click(screen.getByRole('tab', { name: 'Personal Profile' }))

      await waitFor(() => {
        expect(screen.getByText('Buy groceries')).toBeInTheDocument()
      })
      expect(screen.queryByText('Ship feature')).not.toBeInTheDocument()
      expect(screen.getByText('29').querySelector('span')).not.toBeNull()
      expect(screen.getByText('28').querySelector('span')).toBeNull()

      const todoCalls = fetchMock.mock.calls
        .filter(([url]) => url.includes('/api/todos') && !url.includes('/search') && !url.includes('/tags'))
        .map(([url]) => url)
      expect(todoCalls.some((url) => url.includes('profileId=work-profile-id'))).toBe(true)
      expect(todoCalls.some((url) => url.includes('profileId=personal-profile-id'))).toBe(true)
    })

    it('defaults a quick-added todo to the active profile, re-targeting after switching profiles', async () => {
      fetchMock = stubTodoScopedFetch()

      render(<App />)
      await waitFor(() => {
        expect(screen.getByText('Ship feature')).toBeInTheDocument()
      })

      fireEvent.click(screen.getByRole('tab', { name: 'Personal Profile' }))
      await waitFor(() => {
        expect(screen.getByText('Buy groceries')).toBeInTheDocument()
      })

      const newTodo: Todo = {
        _id: 'new-todo-id',
        title: 'Call the vet',
        categoryId: 'personal-uncategorized-id',
        completed: false,
        dueDate: null,
      }
      fetchMock.mockImplementationOnce(() => jsonResponse(newTodo, true)) // POST /api/todos
      fetchMock.mockImplementationOnce(() => jsonResponse([personalTodo, newTodo])) // refetch GET /api/todos
      fetchMock.mockImplementationOnce(() => jsonResponse([personalOnlyCategory])) // refetch GET /api/categories

      fireEvent.change(screen.getByLabelText('New todo title'), { target: { value: 'Call the vet' } })
      fireEvent.click(screen.getByRole('button', { name: 'Add' }))

      await waitFor(() => {
        expect(screen.getByText('Call the vet')).toBeInTheDocument()
      })

      const postCall = fetchMock.mock.calls.find(([, opts]) => opts?.method === 'POST')
      expect(postCall).toBeDefined()
      expect(JSON.parse(postCall![1]?.body ?? '{}')).toEqual({
        title: 'Call the vet',
        profileId: 'personal-profile-id',
      })
    })

    it('re-scopes search results to the active profile, leaving no stale cross-profile results after switching', async () => {
      fetchMock = stubTodoScopedFetch()

      render(<App />)
      await waitFor(() => {
        expect(screen.getByText('Ship feature')).toBeInTheDocument()
      })

      fireEvent.change(screen.getByLabelText('Search todos'), { target: { value: 'feature' } })

      await waitFor(() => {
        const searchCall = fetchMock.mock.calls.find(([url]) => url.includes('/api/todos/search'))
        expect(searchCall).toBeDefined()
        expect(searchCall![0]).toContain('profileId=work-profile-id')
      })
      expect(screen.getByText('Ship feature')).toBeInTheDocument()
      expect(screen.queryByText('Buy groceries')).not.toBeInTheDocument()

      fireEvent.click(screen.getByRole('tab', { name: 'Personal Profile' }))

      await waitFor(() => {
        const searchCalls = fetchMock.mock.calls.filter(([url]) => url.includes('/api/todos/search'))
        expect(searchCalls.some(([url]) => url.includes('profileId=personal-profile-id'))).toBe(true)
      })
      // The search box still holds "feature", but the results it now shows
      // come from the newly-active profile, not a stale carry-over from Work.
      await waitFor(() => {
        expect(screen.getByText('Buy groceries')).toBeInTheDocument()
      })
      expect(screen.queryByText('Ship feature')).not.toBeInTheDocument()
    })
  })
})
