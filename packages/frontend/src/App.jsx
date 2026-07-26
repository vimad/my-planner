import { useEffect, useState } from 'react'
import { AgendaGroups } from './components/AgendaGroups'
import { CategoryChip } from './components/CategoryChip'
import { CategoryForm } from './components/CategoryForm'
import { CompletedTodos } from './components/CompletedTodos'
import { ConfirmDialog } from './components/ConfirmDialog'
import { MiniCalendar } from './components/MiniCalendar'
import { Scratchpad } from './components/Scratchpad'
import { ThemeToggle } from './components/ThemeToggle'
import { TodoDetail } from './components/TodoDetail'
import { TodoQuickAdd } from './components/TodoQuickAdd'
import { getId } from './utils/getId'
import { applyTheme, getInitialTheme } from './utils/theme'

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
  const [draftTodo, setDraftTodo] = useState(null)
  const [sortByPriority, setSortByPriority] = useState(false)
  const [showCompletedOnly, setShowCompletedOnly] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState(null)
  const [pendingConfirm, setPendingConfirm] = useState(null)
  const [selectedCategoryIds, setSelectedCategoryIds] = useState([])
  const [theme, setTheme] = useState(getInitialTheme)
  const [nextOfficeDay, setNextOfficeDay] = useState(null)

  useEffect(() => {
    applyTheme(theme)
  }, [theme])

  // Gates a destructive/hard-to-undo action (delete, mark complete) behind
  // an explicit confirm click. `run` fires only if the user confirms.
  function requestConfirm(message, run) {
    setPendingConfirm({ message, run })
  }

  // Category chips double as a multi-select filter: clicking one toggles it
  // in/out of the active set, clicking a second adds it (OR filter, not a
  // replace), clicking a selected one again clears it.
  function toggleCategoryFilter(category) {
    const cid = String(getId(category))
    setSelectedCategoryIds((prev) =>
      prev.includes(cid) ? prev.filter((id) => id !== cid) : [...prev, cid],
    )
  }

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

  async function loadSettings() {
    try {
      const res = await fetch(`${API_URL}/api/settings`)
      if (!res.ok) return
      const data = await res.json()
      setNextOfficeDay(data.nextOfficeDay ?? null)
    } catch {
      // The office-day highlight is a nice-to-have; a failed fetch just
      // leaves it unset.
    }
  }

  useEffect(() => {
    loadCategories()
    loadTodos()
    loadTags()
    loadScratchNotes()
    loadSettings()
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

  // Shift+Enter in the quick-add box hands the typed (possibly empty) title
  // off to the full TodoDetail popup instead of creating the todo right
  // away, so priority/tags/due date/etc. can be set before anything exists.
  function handleOpenFullTodo(title) {
    setDraftTodo({ title })
  }

  async function handleCreateTodoDetailed(_id, patch) {
    setError(null)
    try {
      const res = await fetch(`${API_URL}/api/todos`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(patch),
      })
      if (!res.ok) throw new Error(await parseErrorMessage(res))
      setDraftTodo(null)
      await Promise.all([loadTodos(), loadCategories(), loadTags()])
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
  // captured lines in one request, rather than creating an empty note and
  // PATCHing lines onto it - the backend already accepts seeded `body` on
  // create, so there's no need to round-trip and find the new note's id.
  // `lines` is already split one-per-paragraph by Scratchpad's capture bar.
  async function handleCreateScratchNote(lines) {
    setError(null)
    try {
      const res = await fetch(`${API_URL}/api/scratch-notes`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ body: lines }),
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

  async function handleSetOfficeDay(date) {
    setError(null)
    try {
      const res = await fetch(`${API_URL}/api/settings`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nextOfficeDay: date }),
      })
      if (!res.ok) throw new Error(await parseErrorMessage(res))
      const data = await res.json()
      setNextOfficeDay(data.nextOfficeDay ?? null)
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
  const searchedTodos = searchQuery.trim() ? (searchResults ?? []) : todos

  // Category chip filter is an OR across the selected categories, applied on
  // top of search; empty selection means "no filter, show everything".
  const visibleTodos =
    selectedCategoryIds.length > 0
      ? searchedTodos.filter((t) => selectedCategoryIds.includes(String(t.categoryId)))
      : searchedTodos

  function handleTodoToggle(id) {
    const todo = visibleTodos.find((t) => getId(t) === id)
    if (todo?.completed) {
      handleToggleTodo(id)
    } else {
      requestConfirm(`Mark "${todo?.title ?? 'this todo'}" as completed?`, () => handleToggleTodo(id))
    }
  }

  function handleTodoDelete(id) {
    const todo = visibleTodos.find((t) => getId(t) === id)
    requestConfirm(`Delete "${todo?.title ?? 'this todo'}"? This cannot be undone.`, () =>
      handleDeleteTodo(id),
    )
  }

  return (
    <main className="min-h-screen bg-[#f2f1f5] px-6 py-9 text-slate-900 dark:bg-[radial-gradient(circle_at_20%_0%,#241a3a_0%,#0f0f18_55%)] dark:text-slate-100 sm:px-10">
      <header className="mb-7 flex items-start justify-between gap-4">
        <div>
          <h1 className="bg-gradient-to-r from-violet-500 via-fuchsia-500 to-cyan-500 bg-clip-text text-3xl font-extrabold text-transparent dark:from-violet-400 dark:via-fuchsia-400 dark:to-cyan-300">
            My Planner
          </h1>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Here's what's glowing today.</p>
        </div>
        <ThemeToggle theme={theme} onToggle={() => setTheme((t) => (t === 'dark' ? 'light' : 'dark'))} />
      </header>

      {error && (
        <p className="mb-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-300">
          Error: {error}
        </p>
      )}

      <section aria-label="Categories" className="mb-6">
        <div className="flex flex-wrap items-center gap-3">
          {loading && <p className="text-sm text-slate-500 dark:text-slate-400">Loading categories...</p>}
          {!loading &&
            categories.map((category) => (
              <CategoryChip
                key={getId(category)}
                category={category}
                selected={selectedCategoryIds.includes(String(getId(category)))}
                onToggleFilter={toggleCategoryFilter}
                onEdit={setEditingCategory}
                onDelete={(cat) =>
                  requestConfirm(`Delete category "${cat.name}"? This cannot be undone.`, () =>
                    handleDelete(cat),
                  )
                }
              />
            ))}
          <button
            type="button"
            onClick={() => {
              setEditingCategory(null)
              setShowCreateForm((v) => !v)
            }}
            className="rounded-full border border-dashed border-slate-300 px-4 py-2 text-sm text-slate-500 hover:bg-white dark:border-white/20 dark:text-slate-300 dark:hover:bg-white/5"
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
        <MiniCalendar todos={todos} nextOfficeDay={nextOfficeDay} onSetOfficeDay={handleSetOfficeDay} />
        <div className="flex-1 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm dark:border-white/10 dark:bg-white/5 dark:shadow-none dark:backdrop-blur-md">
          <TodoQuickAdd onAdd={handleQuickAddTodo} onOpenFull={handleOpenFullTodo} />
          <input
            type="search"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search todos by title or body..."
            aria-label="Search todos"
            className="mb-4 w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-fuchsia-400/60 focus:outline-none dark:border-white/10 dark:bg-white/5 dark:text-slate-100 dark:placeholder:text-slate-500"
          />
          <div className="mb-4 flex items-center gap-4">
            <label className="flex items-center gap-2 text-xs font-medium text-slate-600 dark:text-slate-300">
              <input
                type="checkbox"
                checked={sortByPriority}
                onChange={(e) => setSortByPriority(e.target.checked)}
                className="h-3.5 w-3.5 accent-fuchsia-500"
              />
              Sort by priority
            </label>
            <label className="flex items-center gap-2 text-xs font-medium text-slate-600 dark:text-slate-300">
              <input
                type="checkbox"
                checked={showCompletedOnly}
                onChange={(e) => setShowCompletedOnly(e.target.checked)}
                className="h-3.5 w-3.5 accent-fuchsia-500"
              />
              Show completed
            </label>
          </div>
          {showCompletedOnly ? (
            <CompletedTodos
              todos={visibleTodos}
              categoriesById={categoriesById}
              onToggle={handleTodoToggle}
              onDelete={handleTodoDelete}
              onOpen={setSelectedTodo}
            />
          ) : (
            <AgendaGroups
              todos={visibleTodos}
              categoriesById={categoriesById}
              onToggle={handleTodoToggle}
              onDelete={handleTodoDelete}
              onOpen={setSelectedTodo}
              sortByPriority={sortByPriority}
              nextOfficeDay={nextOfficeDay}
            />
          )}
        </div>
      </section>

      <Scratchpad
        notes={scratchNotes}
        categories={categories}
        onCreateNote={handleCreateScratchNote}
        onUpdateLines={handleUpdateScratchNoteLines}
        onPromote={handlePromoteScratchLine}
        onArchive={handleArchiveScratchNote}
        onDelete={(id) =>
          requestConfirm('Delete this scratch note? This cannot be undone.', () =>
            handleDeleteScratchNote(id),
          )
        }
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

      {draftTodo && (
        <TodoDetail
          todo={draftTodo}
          categories={categories}
          availableTags={availableTags}
          onClose={() => setDraftTodo(null)}
          onSave={handleCreateTodoDetailed}
        />
      )}

      {pendingConfirm && (
        <ConfirmDialog
          message={pendingConfirm.message}
          onCancel={() => setPendingConfirm(null)}
          onConfirm={() => {
            const { run } = pendingConfirm
            setPendingConfirm(null)
            run()
          }}
        />
      )}
    </main>
  )
}

export default App
