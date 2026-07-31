import { useEffect, useState } from 'react'
import { AgendaGroups } from './components/AgendaGroups'
import { CategoryChip } from './components/CategoryChip'
import { CategoryForm, type CategoryFormValues } from './components/CategoryForm'
import { CompletedTodos } from './components/CompletedTodos'
import { ConfirmDialog } from './components/ConfirmDialog'
import { MiniCalendar } from './components/MiniCalendar'
import { NotesView } from './components/NotesView'
import { ProfileSwitcher } from './components/ProfileSwitcher'
import { Scratchpad, type DraftScratchLine } from './components/Scratchpad'
import type { PromoteOptions } from './components/ScratchNoteCard'
import { ThemeToggle } from './components/ThemeToggle'
import { TodoDetail, type TodoSavePatch } from './components/TodoDetail'
import { TodoQuickAdd } from './components/TodoQuickAdd'
import { useActiveProfile } from './hooks/useActiveProfile'
import { effectiveDueDate, localTodayISO, matchesDateRange, type DateRange } from './utils/dateAgenda'
import { getId } from './utils/getId'
import { applyTheme, getInitialTheme } from './utils/theme'
import type { Category, Profile, ScratchLine, ScratchNote, Todo } from './types'

const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:4100'

async function parseErrorMessage(res: Response): Promise<string> {
  try {
    const data = await res.json()
    return data?.error ?? `Request failed with status ${res.status}`
  } catch {
    return `Request failed with status ${res.status}`
  }
}

interface PendingConfirm {
  message: string
  run: () => void
}

function App() {
  const {
    profiles,
    activeProfileId,
    loading: profilesLoading,
    error: profileError,
    setActiveProfileId,
    createProfile,
    renameProfile,
    deleteProfile,
  } = useActiveProfile()
  const [categories, setCategories] = useState<Category[]>([])
  const [todos, setTodos] = useState<Todo[]>([])
  const [scratchNotes, setScratchNotes] = useState<ScratchNote[]>([])
  const [availableTags, setAvailableTags] = useState<string[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [showCreateForm, setShowCreateForm] = useState(false)
  const [editingCategory, setEditingCategory] = useState<Category | null>(null)
  const [selectedTodo, setSelectedTodo] = useState<Todo | null>(null)
  const [draftTodo, setDraftTodo] = useState<Todo | null>(null)
  const [sortByPriority, setSortByPriority] = useState(true)
  const [showCompletedOnly, setShowCompletedOnly] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState<Todo[] | null>(null)
  const [pendingConfirm, setPendingConfirm] = useState<PendingConfirm | null>(null)
  const [selectedCategoryIds, setSelectedCategoryIds] = useState<string[]>([])
  const [selectedDateRange, setSelectedDateRange] = useState<DateRange | null>(null)
  const [theme, setTheme] = useState(getInitialTheme)
  const [nextOfficeDay, setNextOfficeDay] = useState<string | null>(null)
  // Swaps the Categories+Agenda section for the Notes view - see the header
  // tab below. Nothing else on the page (header chrome, the fixed-bottom
  // Scratchpad bar) is affected by which tab is active, per the Notes spec.
  const [activeTab, setActiveTab] = useState<'todos' | 'notes'>('todos')

  useEffect(() => {
    applyTheme(theme)
  }, [theme])

  // Gates a destructive/hard-to-undo action (delete, mark complete) behind
  // an explicit confirm click. `run` fires only if the user confirms.
  function requestConfirm(message: string, run: () => void) {
    setPendingConfirm({ message, run })
  }

  // Category chips double as a multi-select filter: clicking one toggles it
  // in/out of the active set, clicking a second adds it (OR filter, not a
  // replace), clicking a selected one again clears it.
  function toggleCategoryFilter(category: Category) {
    const cid = String(getId(category))
    setSelectedCategoryIds((prev) =>
      prev.includes(cid) ? prev.filter((id) => id !== cid) : [...prev, cid],
    )
  }

  async function loadCategories(profileId: string) {
    setError(null)
    try {
      const res = await fetch(`${API_URL}/api/categories?profileId=${encodeURIComponent(profileId)}`)
      if (!res.ok) throw new Error(await parseErrorMessage(res))
      const data = await res.json()
      setCategories(data)
    } catch (err) {
      setError((err as Error).message)
    }
  }

  // Every category mutation/refresh in this file goes through this wrapper
  // rather than calling loadCategories directly, so call sites don't each
  // have to guard against activeProfileId still being null (e.g. while the
  // profile list itself is still loading).
  function refreshCategories() {
    return activeProfileId ? loadCategories(activeProfileId) : Promise.resolve()
  }

  async function loadTodos(profileId: string) {
    setError(null)
    try {
      const res = await fetch(`${API_URL}/api/todos?profileId=${encodeURIComponent(profileId)}`)
      if (!res.ok) throw new Error(await parseErrorMessage(res))
      const data = await res.json()
      setTodos(data)
    } catch (err) {
      setError((err as Error).message)
    }
  }

  // Mirrors refreshCategories below: every todo mutation/refresh in this
  // file goes through this wrapper so call sites don't each have to guard
  // against activeProfileId still being null.
  function refreshTodos() {
    return activeProfileId ? loadTodos(activeProfileId) : Promise.resolve()
  }

  async function loadTags(profileId: string) {
    try {
      const res = await fetch(`${API_URL}/api/todos/tags?profileId=${encodeURIComponent(profileId)}`)
      if (!res.ok) return
      const data = await res.json()
      setAvailableTags(data)
    } catch {
      // Autocomplete is a nice-to-have; a failed fetch just leaves it empty.
    }
  }

  function refreshTags() {
    return activeProfileId ? loadTags(activeProfileId) : Promise.resolve()
  }

  async function loadScratchNotes(profileId: string) {
    setError(null)
    try {
      const res = await fetch(`${API_URL}/api/scratch-notes?profileId=${encodeURIComponent(profileId)}`)
      if (!res.ok) throw new Error(await parseErrorMessage(res))
      const data = await res.json()
      setScratchNotes(data)
    } catch (err) {
      setError((err as Error).message)
    }
  }

  // Mirrors refreshCategories/refreshTodos above: every scratch-note
  // mutation/refresh in this file goes through this wrapper so call sites
  // don't each have to guard against activeProfileId still being null.
  function refreshScratchNotes() {
    return activeProfileId ? loadScratchNotes(activeProfileId) : Promise.resolve()
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

  // `loading` only gates this initial bootstrap fetch, not the refetches
  // that follow every todo/category mutation - toggling it on every mutation
  // made the category chip row flash back to "Loading categories..." on
  // every add/toggle/delete. The category chip row also waits on
  // `profilesLoading` (see useActiveProfile) since categories can't load
  // until the active profile has resolved. Todos/tags/scratchNotes are all
  // profile-scoped so they're loaded by the activeProfileId-keyed effect
  // below instead of here - settings are deliberately global, so they still
  // load unconditionally on mount.
  useEffect(() => {
    async function bootstrap() {
      setLoading(true)
      try {
        await loadSettings()
      } finally {
        setLoading(false)
      }
    }
    bootstrap()
  }, [])

  // Categories, todos, tags, and scratch notes are all scoped to the active
  // profile, which itself resolves asynchronously (useActiveProfile fetches
  // GET /api/profiles and restores the saved choice from localStorage) - so
  // the initial load and every subsequent profile switch both flow through
  // this one effect rather than the bootstrap effect above. Re-running all
  // four together on every profile switch is what keeps the dashboard, mini
  // calendar, category summary strip, tag autocomplete, and the scratchpad
  // inbox all in sync with no stale cross-profile data.
  useEffect(() => {
    if (!activeProfileId) return
    loadCategories(activeProfileId)
    loadTodos(activeProfileId)
    loadTags(activeProfileId)
    loadScratchNotes(activeProfileId)
    // A date filter set up in one profile shouldn't silently carry over and
    // hide todos after switching to another.
    setSelectedDateRange(null)
  }, [activeProfileId])

  // Hits the real backend search endpoint (GET /api/todos/search) as the
  // user types, per ticket 11 — deliberately not client-side filtering of
  // the already-loaded `todos`, so the endpoint is exercised end-to-end. An
  // empty query clears searchResults, which makes the agenda fall back to
  // the normal unfiltered `todos` list. `ignore` guards against an in-flight
  // request from a stale keystroke resolving after a newer one. Also keyed
  // on activeProfileId so switching profiles while a search is active
  // immediately re-runs it scoped to the newly-active profile instead of
  // leaving the previous profile's stale results on screen.
  useEffect(() => {
    const trimmed = searchQuery.trim()
    if (!trimmed || !activeProfileId) {
      setSearchResults(null)
      return
    }

    let ignore = false
    async function runSearch() {
      try {
        const res = await fetch(
          `${API_URL}/api/todos/search?profileId=${encodeURIComponent(activeProfileId as string)}&q=${encodeURIComponent(trimmed)}`,
        )
        if (!res.ok) throw new Error(await parseErrorMessage(res))
        const data = await res.json()
        if (!ignore) setSearchResults(data)
      } catch (err) {
        if (!ignore) setError((err as Error).message)
      }
    }
    runSearch()

    return () => {
      ignore = true
    }
  }, [searchQuery, activeProfileId])

  // New categories always attach to whichever profile is currently active -
  // there's no manual profile picker on CategoryForm (see the Profiles spec:
  // a category's profile is fixed at creation, and is inferred from context
  // rather than chosen explicitly).
  async function handleCreate({ name, color }: CategoryFormValues) {
    if (!activeProfileId) return
    setError(null)
    try {
      const res = await fetch(`${API_URL}/api/categories`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, color, profileId: activeProfileId }),
      })
      if (!res.ok) throw new Error(await parseErrorMessage(res))
      setShowCreateForm(false)
      await refreshCategories()
    } catch (err) {
      setError((err as Error).message)
    }
  }

  async function handleRename(id: string | undefined, { name, color }: CategoryFormValues) {
    setError(null)
    try {
      const res = await fetch(
        `${API_URL}/api/categories/${id}?profileId=${encodeURIComponent(activeProfileId ?? '')}`,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name, color }),
        },
      )
      if (!res.ok) throw new Error(await parseErrorMessage(res))
      setEditingCategory(null)
      await refreshCategories()
    } catch (err) {
      setError((err as Error).message)
    }
  }

  async function handleDelete(category: Category) {
    setError(null)
    try {
      const res = await fetch(
        `${API_URL}/api/categories/${getId(category)}?profileId=${encodeURIComponent(activeProfileId ?? '')}`,
        { method: 'DELETE' },
      )
      if (!res.ok) throw new Error(await parseErrorMessage(res))
      await refreshCategories()
    } catch (err) {
      setError((err as Error).message)
    }
  }

  async function handleRenameProfile(id: string, name: string) {
    try {
      await renameProfile(id, name)
    } catch {
      // renameProfile already recorded the failure in profileError, which
      // the header's error banner renders - nothing further to do here.
    }
  }

  // Fetches the profile's own categories (already profile-scoped via
  // GET /api/categories?profileId=) to build a confirmation message with a
  // real category count and a real todo count (summed from each category's
  // remaining+completed, the same counts the category chips already show) -
  // the smallest way to give the user genuine numbers instead of a vague
  // "this will also delete everything in it", without adding a new backend
  // endpoint. Scratch notes have no equivalent count available anywhere in
  // the API today, so the message names them without a number rather than
  // over-claiming precision. If the count fetch itself fails, falls back to
  // a still-explicit (if less precise) warning rather than blocking the
  // delete entirely.
  async function handleDeleteProfileRequest(profile: Profile) {
    const id = getId(profile)
    if (!id) return

    let message = `Delete "${profile.name}"? This will also delete everything inside it — its categories, todos, and scratch notes. This cannot be undone.`
    try {
      const res = await fetch(`${API_URL}/api/categories?profileId=${encodeURIComponent(id)}`)
      if (res.ok) {
        const cats: Category[] = await res.json()
        const categoryCount = cats.length
        const todoCount = cats.reduce((sum, cat) => sum + (cat.remaining ?? 0) + (cat.completed ?? 0), 0)
        const categoryLabel = categoryCount === 1 ? 'category' : 'categories'
        const todoLabel = todoCount === 1 ? 'todo' : 'todos'
        message = `Delete "${profile.name}"? This will also delete its ${categoryCount} ${categoryLabel} and ${todoCount} ${todoLabel}, plus any scratch notes in it. This cannot be undone.`
      }
    } catch {
      // Keep the generic fallback message above.
    }

    requestConfirm(message, () => handleDeleteProfile(id))
  }

  async function handleDeleteProfile(id: string) {
    try {
      await deleteProfile(id)
    } catch {
      // deleteProfile already recorded the failure in profileError, which
      // the header's error banner renders - nothing further to do here.
    }
  }

  // Todo mutations refresh both todos and categories, since category chip
  // remaining/completed counts are computed server-side from real todos.
  //
  // Quick-add never lets the user pick a category, so profileId is always
  // sent - the backend uses it to resolve the active profile's own
  // Uncategorized category (see resolveDefaultCategoryId in
  // utils/defaultCategory.ts), never some other profile's.
  async function handleQuickAddTodo(title: string) {
    if (!activeProfileId) return
    setError(null)
    try {
      const res = await fetch(`${API_URL}/api/todos`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title, profileId: activeProfileId }),
      })
      if (!res.ok) throw new Error(await parseErrorMessage(res))
      await Promise.all([refreshTodos(), refreshCategories()])
    } catch (err) {
      setError((err as Error).message)
    }
  }

  // Shift+Enter in the quick-add box hands the typed (possibly empty) title
  // off to the full TodoDetail popup instead of creating the todo right
  // away, so priority/tags/due date/etc. can be set before anything exists.
  function handleOpenFullTodo(title: string) {
    setDraftTodo({ title })
  }

  async function handleCreateTodoDetailed(_id: string | undefined, patch: TodoSavePatch) {
    setError(null)
    try {
      const res = await fetch(`${API_URL}/api/todos`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(patch),
      })
      if (!res.ok) throw new Error(await parseErrorMessage(res))
      setDraftTodo(null)
      await Promise.all([refreshTodos(), refreshCategories(), refreshTags()])
    } catch (err) {
      setError((err as Error).message)
    }
  }

  async function handleToggleTodo(id: string) {
    setError(null)
    try {
      const res = await fetch(`${API_URL}/api/todos/${id}/toggle`, { method: 'PATCH' })
      if (!res.ok) throw new Error(await parseErrorMessage(res))
      await Promise.all([refreshTodos(), refreshCategories()])
    } catch (err) {
      setError((err as Error).message)
    }
  }

  async function handleDeleteTodo(id: string) {
    setError(null)
    try {
      const res = await fetch(`${API_URL}/api/todos/${id}`, { method: 'DELETE' })
      if (!res.ok) throw new Error(await parseErrorMessage(res))
      await Promise.all([refreshTodos(), refreshCategories()])
    } catch (err) {
      setError((err as Error).message)
    }
  }

  // Shared PATCH core for both handleUpdateTodo and handleSaveNotes below -
  // they differ only in whether the currently-open detail popup gets closed
  // afterwards. Typed against `Partial<TodoSavePatch>` so it covers every
  // shape callers pass through it: a full TodoSavePatch (handleUpdateTodo),
  // a body-only patch (handleSaveNotes), and a linkedTodoIds-only patch
  // (passed directly as TodoDetail's onReorderLinkedTodos prop).
  async function patchTodo(id: string | undefined, patch: Partial<TodoSavePatch>): Promise<boolean> {
    setError(null)
    try {
      const res = await fetch(`${API_URL}/api/todos/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(patch),
      })
      if (!res.ok) throw new Error(await parseErrorMessage(res))
      await Promise.all([refreshTodos(), refreshCategories(), refreshTags()])
      return true
    } catch (err) {
      setError((err as Error).message)
      return false
    }
  }

  async function handleUpdateTodo(id: string | undefined, patch: TodoSavePatch) {
    if (await patchTodo(id, patch)) setSelectedTodo(null)
  }

  // Saves a single todo's notes body by id - the parent todo's own notes or
  // a linked todo's notes, both from within TodoDetail's independent
  // per-notes Save buttons - without closing whatever detail popup is
  // currently open, unlike handleUpdateTodo above which always clears
  // selectedTodo on success.
  async function handleSaveNotes(id: string, patch: { body: TodoSavePatch['body'] }) {
    await patchTodo(id, patch)
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
  // The new note always attaches to the active profile - a scratch note has
  // no categoryId to derive a profile from (see the Profiles spec), so
  // profileId is sent directly, same as quick-add's todo creation above.
  async function handleCreateScratchNote(lines: DraftScratchLine[]) {
    if (!activeProfileId) return
    setError(null)
    try {
      const res = await fetch(`${API_URL}/api/scratch-notes`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ body: lines, profileId: activeProfileId }),
      })
      if (!res.ok) throw new Error(await parseErrorMessage(res))
      await refreshScratchNotes()
    } catch (err) {
      setError((err as Error).message)
    }
  }

  async function handleUpdateScratchNoteLines(id: string, lines: ScratchLine[]) {
    setError(null)
    try {
      const res = await fetch(
        `${API_URL}/api/scratch-notes/${id}?profileId=${encodeURIComponent(activeProfileId ?? '')}`,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ body: lines }),
        },
      )
      if (!res.ok) throw new Error(await parseErrorMessage(res))
      await refreshScratchNotes()
    } catch (err) {
      setError((err as Error).message)
    }
  }

  async function handlePromoteScratchLine(noteId: string, lineId: string, options: PromoteOptions) {
    setError(null)
    try {
      const res = await fetch(`${API_URL}/api/scratch-notes/${noteId}/promote`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ lineId, ...options }),
      })
      if (!res.ok) throw new Error(await parseErrorMessage(res))
      await Promise.all([refreshScratchNotes(), refreshTodos(), refreshCategories()])
    } catch (err) {
      setError((err as Error).message)
    }
  }

  async function handleArchiveScratchNote(id: string) {
    setError(null)
    try {
      const res = await fetch(
        `${API_URL}/api/scratch-notes/${id}/archive?profileId=${encodeURIComponent(activeProfileId ?? '')}`,
        { method: 'PATCH' },
      )
      if (!res.ok) throw new Error(await parseErrorMessage(res))
      await refreshScratchNotes()
    } catch (err) {
      setError((err as Error).message)
    }
  }

  async function handleDeleteScratchNote(id: string) {
    setError(null)
    try {
      const res = await fetch(
        `${API_URL}/api/scratch-notes/${id}?profileId=${encodeURIComponent(activeProfileId ?? '')}`,
        { method: 'DELETE' },
      )
      if (!res.ok) throw new Error(await parseErrorMessage(res))
      await refreshScratchNotes()
    } catch (err) {
      setError((err as Error).message)
    }
  }

  async function handleSetOfficeDay(date: string | null) {
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
      setError((err as Error).message)
    }
  }

  const categoriesById: Record<string, Category> = Object.fromEntries(
    categories.map((category) => [String(getId(category)), category]),
  )

  // While a search query is active, the agenda shows the backend search
  // results instead of the unfiltered `todos` — `todos` itself stays
  // unfiltered so MiniCalendar and category counts are unaffected by search.
  const searchedTodos = searchQuery.trim() ? (searchResults ?? []) : todos

  // Category chip filter is an OR across the selected categories, applied on
  // top of search; empty selection means "no filter, show everything".
  const categoryFiltered =
    selectedCategoryIds.length > 0
      ? searchedTodos.filter((t) => selectedCategoryIds.includes(String(t.categoryId)))
      : searchedTodos

  // MiniCalendar's date/range filter narrows on top of search + category,
  // matched against each todo's effective due date (its real dueDate, or the
  // shared next office day when office-linked) so office-linked todos
  // participate the same as any other. A null selectedDateRange means "no
  // filter, show everything" (matchesDateRange's null-range behavior).
  const todayISO = localTodayISO()
  const visibleTodos = categoryFiltered.filter((t) =>
    matchesDateRange(effectiveDueDate(t, nextOfficeDay, todayISO), selectedDateRange),
  )

  function handleTodoToggle(id: string) {
    const todo = visibleTodos.find((t) => getId(t) === id)
    if (todo?.completed) {
      handleToggleTodo(id)
    } else {
      requestConfirm(`Mark "${todo?.title ?? 'this todo'}" as completed?`, () => handleToggleTodo(id))
    }
  }

  function handleTodoDelete(id: string) {
    const todo = visibleTodos.find((t) => getId(t) === id)
    requestConfirm(`Delete "${todo?.title ?? 'this todo'}"? This cannot be undone.`, () =>
      handleDeleteTodo(id),
    )
  }

  return (
    <main className="min-h-screen bg-[#f2f1f5] px-6 py-9 text-slate-900 dark:bg-[radial-gradient(circle_at_20%_0%,#241a3a_0%,#0f0f18_55%)] dark:text-slate-100 sm:px-10">
      <header className="mb-7 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="bg-gradient-to-r from-violet-500 via-fuchsia-500 to-cyan-500 bg-clip-text text-3xl font-extrabold text-transparent dark:from-violet-400 dark:via-fuchsia-400 dark:to-cyan-300">
            My Planner
          </h1>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Here's what's glowing today.</p>
        </div>
        <div className="flex items-center gap-3">
          <div
            role="tablist"
            aria-label="View"
            className="flex items-center gap-1 rounded-full border border-slate-200 bg-white p-1 dark:border-white/10 dark:bg-white/5"
          >
            {(
              [
                { key: 'todos', label: 'Todos' },
                { key: 'notes', label: 'Notes' },
              ] as const
            ).map((tab) => (
              <button
                key={tab.key}
                type="button"
                role="tab"
                aria-selected={activeTab === tab.key}
                onClick={() => setActiveTab(tab.key)}
                className={`rounded-full px-3 py-1.5 text-sm font-semibold transition ${
                  activeTab === tab.key
                    ? 'bg-gradient-to-r from-violet-500 to-fuchsia-500 text-white'
                    : 'text-slate-500 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-white/10'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
          {!profilesLoading && profiles.length > 0 && (
            <ProfileSwitcher
              profiles={profiles}
              activeProfileId={activeProfileId}
              onSelect={setActiveProfileId}
              onCreate={createProfile}
              onRename={handleRenameProfile}
              onDeleteRequest={handleDeleteProfileRequest}
            />
          )}
          <ThemeToggle theme={theme} onToggle={() => setTheme((t) => (t === 'dark' ? 'light' : 'dark'))} />
        </div>
      </header>

      {(error || profileError) && (
        <p className="mb-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-300">
          Error: {error ?? profileError}
        </p>
      )}

      {activeTab === 'notes' ? (
        <NotesView activeProfileId={activeProfileId} />
      ) : (
        <>
          <section aria-label="Categories" className="mb-6">
            <div className="flex flex-wrap items-center gap-3">
              {(loading || profilesLoading) && (
                <p className="text-sm text-slate-500 dark:text-slate-400">Loading categories...</p>
              )}
              {!loading &&
                !profilesLoading &&
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
            <MiniCalendar
              todos={todos}
              nextOfficeDay={nextOfficeDay}
              onSetOfficeDay={handleSetOfficeDay}
              selectedRange={selectedDateRange}
              onSelectRange={setSelectedDateRange}
            />
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
        </>
      )}

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
          todos={todos}
          onClose={() => setSelectedTodo(null)}
          onSave={handleUpdateTodo}
          onSaveNotes={handleSaveNotes}
          onReorderLinkedTodos={patchTodo}
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
