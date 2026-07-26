import { useEffect, useState } from 'react'
import { AgendaGroups } from './components/AgendaGroups'
import { CategoryChip } from './components/CategoryChip'
import { CategoryForm } from './components/CategoryForm'
import { MiniCalendar } from './components/MiniCalendar'
import { Scratchpad } from './components/Scratchpad'
import { TodoDetail } from './components/TodoDetail'
import { TodoQuickAdd } from './components/TodoQuickAdd'
import { getId } from './utils/getId'

const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:4100'

async function parseErrorMessage(res) {
  try {
    const data = await res.json()
    return data?.error ?? `Request failed with status ${res.status}`
  } catch {
    return `Request failed with status ${res.status}`
  }
}

function App() {
  const [categories, setCategories] = useState([])
  const [todos, setTodos] = useState([])
  const [scratchNotes, setScratchNotes] = useState([])
  const [availableTags, setAvailableTags] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [showCreateForm, setShowCreateForm] = useState(false)
  const [editingCategory, setEditingCategory] = useState(null)
  const [selectedTodo, setSelectedTodo] = useState(null)
  const [sortByPriority, setSortByPriority] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState(null)

  async function loadCategories() {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`${API_URL}/api/categories`)
      if (!res.ok) throw new Error(await parseErrorMessage(res))
      const data = await res.json()
      setCategories(data)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  async function loadTodos() {
    setError(null)
    try {
      const res = await fetch(`${API_URL}/api/todos`)
      if (!res.ok) throw new Error(await parseErrorMessage(res))
      const data = await res.json()
      setTodos(data)
    } catch (err) {
      setError(err.message)
    }
  }

  async function loadTags() {
    try {
      const res = await fetch(`${API_URL}/api/todos/tags`)
      if (!res.ok) return
      const data = await res.json()
      setAvailableTags(data)
    } catch {
      // Autocomplete is a nice-to-have; a failed fetch just leaves it empty.
    }
  }

  async function loadScratchNotes() {
    setError(null)
    try {
      const res = await fetch(`${API_URL}/api/scratch-notes`)
      if (!res.ok) throw new Error(await parseErrorMessage(res))
      const data = await res.json()
      setScratchNotes(data)
    } catch (err) {
      setError(err.message)
    }
  }

  useEffect(() => {
    loadCategories()
    loadTodos()
    loadTags()
    loadScratchNotes()
  }, [])

  // Hits the real backend search endpoint (GET /api/todos/search) as the
  // user types, per ticket 11 — deliberately not client-side filtering of
  // the already-loaded `todos`, so the endpoint is exercised end-to-end. An
  // empty query clears searchResults, which makes the agenda fall back to
  // the normal unfiltered `todos` list. `ignore` guards against an in-flight
  // request from a stale keystroke resolving after a newer one.
  useEffect(() => {
    const trimmed = searchQuery.trim()
    if (!trimmed) {
      setSearchResults(null)
      return
    }

    let ignore = false
    async function runSearch() {
      try {
        const res = await fetch(`${API_URL}/api/todos/search?q=${encodeURIComponent(trimmed)}`)
        if (!res.ok) throw new Error(await parseErrorMessage(res))
        const data = await res.json()
        if (!ignore) setSearchResults(data)
      } catch (err) {
        if (!ignore) setError(err.message)
      }
    }
    runSearch()

    return () => {
      ignore = true
    }
  }, [searchQuery])

  async function handleCreate({ name, color }) {
    setError(null)
    try {
      const res = await fetch(`${API_URL}/api/categories`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, color }),
      })
      if (!res.ok) throw new Error(await parseErrorMessage(res))
      setShowCreateForm(false)
      await loadCategories()
    } catch (err) {
      setError(err.message)
    }
  }

  async function handleRename(id, { name, color }) {
    setError(null)
    try {
      const res = await fetch(`${API_URL}/api/categories/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, color }),
      })
      if (!res.ok) throw new Error(await parseErrorMessage(res))
      setEditingCategory(null)
      await loadCategories()
    } catch (err) {
      setError(err.message)
    }
  }

  async function handleDelete(category) {
    setError(null)
    try {
      const res = await fetch(`${API_URL}/api/categories/${getId(category)}`, {
        method: 'DELETE',
      })
      if (!res.ok) throw new Error(await parseErrorMessage(res))
      await loadCategories()
    } catch (err) {
      setError(err.message)
    }
  }

  // Todo mutations refresh both todos and categories, since category chip
  // remaining/completed counts are computed server-side from real todos.
  async function handleQuickAddTodo(title) {
    setError(null)
    try {
      const res = await fetch(`${API_URL}/api/todos`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title }),
      })
      if (!res.ok) throw new Error(await parseErrorMessage(res))
      await Promise.all([loadTodos(), loadCategories()])
    } catch (err) {
      setError(err.message)
    }
  }

  async function handleToggleTodo(id) {
    setError(null)
    try {
      const res = await fetch(`${API_URL}/api/todos/${id}/toggle`, { method: 'PATCH' })
      if (!res.ok) throw new Error(await parseErrorMessage(res))
      await Promise.all([loadTodos(), loadCategories()])
    } catch (err) {
      setError(err.message)
    }
  }

  async function handleDeleteTodo(id) {
    setError(null)
    try {
      const res = await fetch(`${API_URL}/api/todos/${id}`, { method: 'DELETE' })
      if (!res.ok) throw new Error(await parseErrorMessage(res))
      await Promise.all([loadTodos(), loadCategories()])
    } catch (err) {
      setError(err.message)
    }
  }

  async function handleUpdateTodo(id, patch) {
    setError(null)
    try {
      const res = await fetch(`${API_URL}/api/todos/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(patch),
      })
      if (!res.ok) throw new Error(await parseErrorMessage(res))
      setSelectedTodo(null)
      await Promise.all([loadTodos(), loadCategories(), loadTags()])
    } catch (err) {
      setError(err.message)
    }
  }

  // Scratch note mutations only refresh scratch notes, except promotion,
  // which also creates a Todo and so needs the same todos/categories refresh
  // as the other todo-affecting mutations above.
  //
  // Quick capture creates a new session (ScratchNote) pre-seeded with the
  // captured line in one request, rather than creating an empty note and
  // PATCHing a line onto it - the backend already accepts seeded `body` on
  // create, so there's no need to round-trip and find the new note's id.
  async function handleCreateScratchNote(content) {
    setError(null)
    try {
      const res = await fetch(`${API_URL}/api/scratch-notes`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ body: [{ content }] }),
      })
      if (!res.ok) throw new Error(await parseErrorMessage(res))
      await loadScratchNotes()
    } catch (err) {
      setError(err.message)
    }
  }

  async function handleUpdateScratchNoteLines(id, lines) {
    setError(null)
    try {
      const res = await fetch(`${API_URL}/api/scratch-notes/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ body: lines }),
      })
      if (!res.ok) throw new Error(await parseErrorMessage(res))
      await loadScratchNotes()
    } catch (err) {
      setError(err.message)
    }
  }

  async function handlePromoteScratchLine(noteId, lineId, options) {
    setError(null)
    try {
      const res = await fetch(`${API_URL}/api/scratch-notes/${noteId}/promote`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ lineId, ...options }),
      })
      if (!res.ok) throw new Error(await parseErrorMessage(res))
      await Promise.all([loadScratchNotes(), loadTodos(), loadCategories()])
    } catch (err) {
      setError(err.message)
    }
  }

  async function handleArchiveScratchNote(id) {
    setError(null)
    try {
      const res = await fetch(`${API_URL}/api/scratch-notes/${id}/archive`, { method: 'PATCH' })
      if (!res.ok) throw new Error(await parseErrorMessage(res))
      await loadScratchNotes()
    } catch (err) {
      setError(err.message)
    }
  }

  async function handleDeleteScratchNote(id) {
    setError(null)
    try {
      const res = await fetch(`${API_URL}/api/scratch-notes/${id}`, { method: 'DELETE' })
      if (!res.ok) throw new Error(await parseErrorMessage(res))
      await loadScratchNotes()
    } catch (err) {
      setError(err.message)
    }
  }

  const categoriesById = Object.fromEntries(
    categories.map((category) => [getId(category), category]),
  )

  // While a search query is active, the agenda shows the backend search
  // results instead of the unfiltered `todos` — `todos` itself stays
  // unfiltered so MiniCalendar and category counts are unaffected by search.
  const visibleTodos = searchQuery.trim() ? (searchResults ?? []) : todos

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_20%_0%,#241a3a_0%,#0f0f18_55%)] px-6 py-9 text-slate-100 sm:px-10">
      <header className="mb-7">
        <h1 className="bg-gradient-to-r from-violet-400 via-fuchsia-400 to-cyan-300 bg-clip-text text-3xl font-extrabold text-transparent">
          My Planner
        </h1>
        <p className="mt-1 text-sm text-slate-400">Here's what's glowing today.</p>
      </header>

      {error && (
        <p className="mb-4 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-300">
          Error: {error}
        </p>
      )}

      <section aria-label="Categories" className="mb-6">
        <div className="flex flex-wrap items-center gap-3">
          {loading && <p className="text-sm text-slate-400">Loading categories...</p>}
          {!loading &&
            categories.map((category) => (
              <CategoryChip
                key={getId(category)}
                category={category}
                onEdit={setEditingCategory}
                onDelete={handleDelete}
              />
            ))}
          <button
            type="button"
            onClick={() => {
              setEditingCategory(null)
              setShowCreateForm((v) => !v)
            }}
            className="rounded-full border border-dashed border-white/20 px-4 py-2 text-sm text-slate-300 hover:bg-white/5"
          >
            + Add category
          </button>
        </div>

        {showCreateForm && (
          <div className="mt-3 max-w-sm">
            <CategoryForm
              submitLabel="Add category"
              onSubmit={handleCreate}
              onCancel={() => setShowCreateForm(false)}
            />
          </div>
        )}

        {editingCategory && (
          <div className="mt-3 max-w-sm">
            <CategoryForm
              initialName={editingCategory.name}
              initialColor={editingCategory.color}
              submitLabel="Save"
              onSubmit={(values) => handleRename(getId(editingCategory), values)}
              onCancel={() => setEditingCategory(null)}
            />
          </div>
        )}
      </section>

      <section aria-label="Agenda" className="flex flex-col gap-4 sm:flex-row">
        <MiniCalendar todos={todos} />
        <div className="flex-1 rounded-2xl border border-white/10 bg-white/5 p-6 backdrop-blur-md">
          <TodoQuickAdd onAdd={handleQuickAddTodo} />
          <input
            type="search"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search todos by title or body..."
            aria-label="Search todos"
            className="mb-4 w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:border-fuchsia-400/60 focus:outline-none"
          />
          <label className="mb-4 flex items-center gap-2 text-xs font-medium text-slate-300">
            <input
              type="checkbox"
              checked={sortByPriority}
              onChange={(e) => setSortByPriority(e.target.checked)}
              className="h-3.5 w-3.5 accent-fuchsia-500"
            />
            Sort by priority
          </label>
          <AgendaGroups
            todos={visibleTodos}
            categoriesById={categoriesById}
            onToggle={handleToggleTodo}
            onDelete={handleDeleteTodo}
            onOpen={setSelectedTodo}
            sortByPriority={sortByPriority}
          />
        </div>
      </section>

      <Scratchpad
        notes={scratchNotes}
        categories={categories}
        onCreateNote={handleCreateScratchNote}
        onUpdateLines={handleUpdateScratchNoteLines}
        onPromote={handlePromoteScratchLine}
        onArchive={handleArchiveScratchNote}
        onDelete={handleDeleteScratchNote}
      />

      {selectedTodo && (
        <TodoDetail
          key={getId(selectedTodo)}
          todo={selectedTodo}
          categories={categories}
          availableTags={availableTags}
          onClose={() => setSelectedTodo(null)}
          onSave={handleUpdateTodo}
        />
      )}
    </main>
  )
}

export default App
