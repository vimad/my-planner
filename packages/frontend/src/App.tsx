import { useEffect, useMemo, useRef, useState } from 'react'
import { AgendaGroups } from './components/AgendaGroups'
import { BoardsTabBadge } from './components/BoardsTabBadge'
import { BoardsView } from './components/BoardsView'
import { BoardSwitcherModal } from './components/BoardSwitcherModal'
import { CategoryChip } from './components/CategoryChip'
import { CategoryForm, type CategoryFormValues } from './components/CategoryForm'
import { CompletedTodos } from './components/CompletedTodos'
import { ConfirmDialog } from './components/ConfirmDialog'
import { CreateBoardPrompt } from './components/CreateBoardPrompt'
import { FlyToBoardsBadge, type FlyEvent } from './components/FlyToBoardsBadge'
import { MiniCalendar } from './components/MiniCalendar'
import { NotesView } from './components/NotesView'
import { ProfileSwitcher } from './components/ProfileSwitcher'
import { Scratchpad, type DraftScratchLine } from './components/Scratchpad'
import type { PromoteOptions } from './components/ScratchNoteCard'
import { ThemeToggle } from './components/ThemeToggle'
import { TodoDetail, type TodoSavePatch } from './components/TodoDetail'
import { TodoQuickAdd } from './components/TodoQuickAdd'
import { WeeklyProgressPanel } from './components/WeeklyProgressPanel'
import { useActiveProfile } from './hooks/useActiveProfile'
import { useBoards } from './hooks/useBoards'
import { itemKey } from './utils/boardItemKey'
import { effectiveDueDate, localTodayISO, matchesDateRange, type DateRange } from './utils/dateAgenda'
import { getId } from './utils/getId'
import { applyTheme, getInitialTheme } from './utils/theme'
import type { BoardItemType, BoardQuickAddState, Category, Profile, ScratchLine, ScratchNote, Todo } from './types'

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
    setActiveBoardId,
    refreshProfiles,
  } = useActiveProfile()
  // Boards themselves are owned here (not by BoardsView) so the quick-add
  // icon (TodoItem/NotesView) and the Boards tab badge - both siblings of
  // BoardsView, needing the same active board's data regardless of which
  // tab is open - read/mutate the exact same state BoardsView itself does.
  // See ticket 14 (.scratch/boards/issues/14-quick-add-icon-and-badge.md).
  const {
    boards,
    loading: boardsLoading,
    error: boardsError,
    createBoard,
    renameBoard,
    deleteBoard,
    replaceItems,
    addItem,
    removeItem,
  } = useBoards(activeProfileId)
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
  // Swaps the Categories+Agenda section for the Notes/Boards view - see the
  // header tab below. Nothing else on the page (header chrome, the
  // fixed-bottom Scratchpad bar) is affected by which tab is active, per the
  // Notes spec (Boards follows the same mechanism - see .scratch/boards/spec.md).
  const [activeTab, setActiveTab] = useState<'todos' | 'notes' | 'boards'>('todos')
  // Quick-add icon state (ticket 14) - the zero-boards create-first-board
  // prompt, and the arcing fly-to-badge animation's in-flight event/target/
  // pop, all live here since they're triggered from anywhere in the app
  // (any todo/note row) and land on the Boards tab in the header, both
  // outside BoardsView itself.
  const [pendingQuickAdd, setPendingQuickAdd] = useState<{
    itemType: BoardItemType
    itemId: string
    label: string
  } | null>(null)
  const [flyEvent, setFlyEvent] = useState<FlyEvent | null>(null)
  // Global "switch active board" palette (Ctrl+A - see the window-level
  // keydown effect below), independent of `activeTab`: switching the active
  // board doesn't need the Boards tab open, the same way `activeBoardId`
  // itself is read/set from anywhere in the app already (quick-add icon,
  // BoardsTabBadge).
  const [showBoardSwitcher, setShowBoardSwitcher] = useState(false)
  const [badgeBumped, setBadgeBumped] = useState(false)
  const badgeRef = useRef<HTMLSpanElement>(null)
  const bumpTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    applyTheme(theme)
  }, [theme])

  // Global Ctrl+A shortcut for opening the board-switcher palette. Skipped
  // while focus is in a text field/editor (including tiptap's
  // contentEditable) so the browser's native "select all text" still works
  // everywhere it normally would - this shortcut only fires when nothing
  // editable has focus. Also skipped while any other modal is already open
  // (confirm dialog, the zero-boards create prompt, a todo detail panel) so
  // it never stacks on top of one of those.
  useEffect(() => {
    function isEditableTarget(target: EventTarget | null): boolean {
      if (!(target instanceof HTMLElement)) return false
      if (target.isContentEditable) return true
      return target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT'
    }

    function onKeyDown(e: KeyboardEvent) {
      if (e.key.toLowerCase() !== 'a' || !e.ctrlKey || e.metaKey || e.altKey) return
      if (isEditableTarget(e.target)) return
      if (pendingConfirm || pendingQuickAdd || selectedTodo || draftTodo) return
      e.preventDefault()
      setShowBoardSwitcher(true)
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [pendingConfirm, pendingQuickAdd, selectedTodo, draftTodo])

  // Selecting a board from the palette reuses the exact same mutation
  // BoardsView's own BoardSwitcher and the tab-embedded switcher use (see
  // handleSetActiveBoardId above) - there's still only one "set the active
  // board" code path, just another entry point into it.
  function handleSelectBoardFromSwitcher(id: string) {
    handleSetActiveBoardId(id)
    setShowBoardSwitcher(false)
  }

  // Creates a board from the palette, activates it, then closes - mirrors
  // BoardsView's own handleCreateBoard (a freshly created board has nothing
  // else that could be "active"), just triggered from the global palette
  // instead of the Boards tab's inline switcher.
  async function handleCreateBoardForSwitcher(name: string) {
    if (!activeProfileId) return
    try {
      const created = await createBoard(name)
      await setActiveBoardId(activeProfileId, String(getId(created)))
      setShowBoardSwitcher(false)
    } catch {
      // createBoard/setActiveBoardId already record their own failure in
      // boardsError/profileError.
    }
  }

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

  // Switches which board the Boards view shows for the active profile - see
  // .scratch/boards/spec.md's "active board" concept. A no-op if no profile
  // is active yet; errors are already recorded in profileError by
  // setActiveBoardId itself, so nothing further to do here either.
  async function handleSetActiveBoardId(boardId: string) {
    if (!activeProfileId) return
    try {
      await setActiveBoardId(activeProfileId, boardId)
    } catch {
      // setActiveBoardId already recorded the failure in profileError.
    }
  }

  // After BoardsView deletes a board, DELETE /api/boards/:id may have
  // fallen `Profile.activeBoardId` back to another board (or null)
  // server-side (see routes/boards.ts). Re-fetching profiles here - rather
  // than BoardsView guessing which board is now active - is what makes
  // `activeProfile?.activeBoardId` below reflect that fallback.
  async function handleBoardDeleted() {
    await refreshProfiles()
  }

  // Quick-add icon click (see ticket 14 / the Boards spec's "Quick-add icon"
  // section). Zero boards yet: opens the create-first-board prompt instead
  // of silently auto-creating one. Otherwise: fires the arcing fly-to-badge
  // animation from the clicked icon's own element and adds the item to the
  // active board directly - no picker. A no-op if boards exist but none is
  // active yet (there's nothing to add to); in practice this shouldn't
  // happen since creating a board always activates it (see BoardsView's
  // handleCreateBoard) and deleting the active board always falls back to
  // another board or null (see routes/boards.ts).
  function handleQuickAdd(itemType: BoardItemType, itemId: string, label: string, originEl: HTMLElement) {
    if (boards.length === 0) {
      setPendingQuickAdd({ itemType, itemId, label })
      return
    }
    const currentActiveBoardId = activeProfile?.activeBoardId ?? null
    if (!currentActiveBoardId) return
    setFlyEvent({ fromRect: originEl.getBoundingClientRect() })
    addItem(currentActiveBoardId, itemType, itemId).catch(() => {
      // addItem already recorded the failure in boardsError - just make sure
      // the in-flight ghost doesn't hang around with nowhere to land.
      setFlyEvent(null)
    })
  }

  // Removing is instant, no reverse animation, per spec.
  function handleQuickRemove(itemType: BoardItemType, itemId: string) {
    const currentActiveBoardId = activeProfile?.activeBoardId ?? null
    if (!currentActiveBoardId) return
    removeItem(currentActiveBoardId, itemType, itemId).catch(() => {
      // removeItem already recorded the failure in boardsError.
    })
  }

  // Creates the first board from the zero-boards quick-add prompt, activates
  // it, then adds the item that triggered the prompt in the first place -
  // the same createBoard mutation BoardsView's own BoardSwitcher uses, just
  // triggered from a modal instead of an inline dropdown form (see
  // CreateBoardPrompt's doc comment). No fly animation here - the prompt is
  // a modal, not anchored to the icon that opened it, unlike the ordinary
  // add-with-existing-boards path above.
  async function handleCreateBoardForQuickAdd(name: string) {
    if (!pendingQuickAdd || !activeProfileId) return
    const { itemType, itemId } = pendingQuickAdd
    try {
      const created = await createBoard(name)
      const createdId = String(getId(created))
      await setActiveBoardId(activeProfileId, createdId)
      await addItem(createdId, itemType, itemId)
      setPendingQuickAdd(null)
    } catch {
      // createBoard/setActiveBoardId/addItem already record their own
      // errors - leave the prompt open so the user can retry.
    }
  }

  // Fires once the fly-to-badge ghost lands (see FlyToBoardsBadge) - clears
  // the in-flight event and bumps the badge's brief pop, per spec
  // ("increments the badge with a brief pop").
  function handleFlyComplete() {
    setFlyEvent(null)
    setBadgeBumped(true)
    if (bumpTimeoutRef.current) clearTimeout(bumpTimeoutRef.current)
    bumpTimeoutRef.current = setTimeout(() => setBadgeBumped(false), 300)
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

  // Resolved once here (rather than inside BoardsView) since App.tsx already
  // owns the profiles list - see .scratch/boards/spec.md's "active board
  // lives on Profile" decision.
  const activeProfile = profiles.find((profile) => getId(profile) === activeProfileId) ?? null
  const activeBoardId = activeProfile?.activeBoardId ?? null
  const activeBoard = boards.find((b) => getId(b) === activeBoardId) ?? null

  // `${itemType}:${itemId}` membership set for the active board - the
  // quick-add icon's resting-vs-filled state everywhere it's rendered
  // (TodoItem, NotesView's note row) reads off this single Set rather than
  // each row computing its own membership check against `boards`.
  const activeItemKeys = useMemo(
    () => new Set((activeBoard?.items ?? []).map(itemKey)),
    [activeBoard],
  )

  const boardQuickAdd: BoardQuickAddState = {
    activeItemKeys,
    onAdd: handleQuickAdd,
    onRemove: handleQuickRemove,
  }

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
                { key: 'boards', label: 'Boards' },
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
                {tab.key === 'boards' ? (
                  <BoardsTabBadge ref={badgeRef} label={tab.label} count={activeBoard?.items.length ?? 0} bumped={badgeBumped} />
                ) : (
                  tab.label
                )}
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
        <NotesView activeProfileId={activeProfileId} boardQuickAdd={boardQuickAdd} />
      ) : activeTab === 'boards' ? (
        <BoardsView
          activeProfileId={activeProfileId}
          activeBoardId={activeBoardId}
          onSetActiveBoardId={handleSetActiveBoardId}
          onBoardDeleted={handleBoardDeleted}
          todos={todos}
          categories={categories}
          onSaveTodoBody={handleSaveNotes}
          boards={boards}
          boardsLoading={boardsLoading}
          boardsError={boardsError}
          onCreateBoard={createBoard}
          onRenameBoard={renameBoard}
          onDeleteBoard={deleteBoard}
          onReplaceBoardItems={replaceItems}
        />
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

          <section aria-label="Agenda" className="flex flex-col gap-4 lg:flex-row">
            <div className="flex flex-1 flex-col gap-4 sm:flex-row">
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
                    boardQuickAdd={boardQuickAdd}
                  />
                ) : (
                  <AgendaGroups
                    todos={visibleTodos}
                    categoriesById={categoriesById}
                    onToggle={handleTodoToggle}
                    onDelete={handleTodoDelete}
                    onOpen={setSelectedTodo}
                    boardQuickAdd={boardQuickAdd}
                    sortByPriority={sortByPriority}
                    nextOfficeDay={nextOfficeDay}
                  />
                )}
              </div>
            </div>
            <WeeklyProgressPanel activeProfileId={activeProfileId} categories={categories} />
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

      {pendingQuickAdd && (
        <CreateBoardPrompt
          itemLabel={pendingQuickAdd.label}
          onCreate={handleCreateBoardForQuickAdd}
          onCancel={() => setPendingQuickAdd(null)}
        />
      )}

      {showBoardSwitcher && (
        <BoardSwitcherModal
          boards={boards}
          activeBoardId={activeBoardId}
          onSelect={handleSelectBoardFromSwitcher}
          onCreate={handleCreateBoardForSwitcher}
          onClose={() => setShowBoardSwitcher(false)}
        />
      )}

      <FlyToBoardsBadge flyEvent={flyEvent} targetRef={badgeRef} onComplete={handleFlyComplete} />
    </main>
  )
}

export default App
