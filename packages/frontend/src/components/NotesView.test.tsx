import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from 'vitest'
import type { BoardQuickAddState, Category, Note, NoteFolder, Todo } from '../types'
import { NotesView } from './NotesView'

interface FakeResponse {
  ok: boolean
  status: number
  json: () => Promise<unknown>
}

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

function stubFetch(handler: (url: string, init?: FetchCallInit) => Promise<FakeResponse>): FetchMock {
  const mock: FetchMock = vi.fn((url, init) => handler(String(url), init))
  vi.stubGlobal('fetch', mock)
  return mock
}

// Pastes text into a Tiptap/ProseMirror editor - jsdom doesn't implement
// real contenteditable text insertion, so `fireEvent.paste` (read by
// ProseMirror's own paste handler) is the reliable way to change the live
// document in tests, per RichTextEditor.test.tsx's established pattern.
function pasteText(node: Element, text: string) {
  fireEvent.paste(node, {
    clipboardData: { getData: (type: string) => (type === 'text/plain' ? text : '') },
  })
}

// Rename/Move/Delete live behind a row's "More actions" kebab menu rather
// than always-visible buttons - opens the menu for the row named
// `itemName` and returns that row element so callers can scope further
// `within` queries (e.g. the popover's own Move/Delete/Rename entries) to
// it.
function openRowMenu(itemName: string): HTMLElement {
  const nameEl = screen.getByText(itemName)
  const row = nameEl.closest('.group') as HTMLElement
  fireEvent.click(within(row).getByRole('button', { name: 'More actions' }))
  return row
}

const recipesFolder: NoteFolder = { _id: 'f-recipes', name: 'Recipes', parentId: null }
const workFolder: NoteFolder = { _id: 'f-work', name: 'Work', parentId: null }
const workIdeasFolder: NoteFolder = { _id: 'f-work-ideas', name: 'Ideas', parentId: 'f-work' }

const passwordsNote: Note = {
  _id: 'n-passwords',
  name: 'Passwords',
  folderId: null,
  body: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Nothing sensitive' }] }] },
}

const pastaNote: Note = {
  _id: 'n-pasta',
  name: 'Weeknight pasta',
  folderId: 'f-recipes',
  body: null,
}

const standupNote: Note = {
  _id: 'n-standup',
  name: 'Standup notes',
  folderId: 'f-work',
  body: null,
}

// Fixtures for the note-linked-todos feature (.scratch/note-linked-todos/spec.md).
const workCategory: Category = { _id: 'c-work', name: 'Work', color: '#8b5cf6' }
const epfTodo: Todo = { _id: 't-epf', title: 'Get filled EPF form', categoryId: 'c-work', priority: 'High' }
const handoutTodo: Todo = { _id: 't-handout', title: 'Print handout', priority: 'Low' }
const approvalTodo: Todo = { _id: 't-approval', title: 'Chase approval from finance', priority: 'Medium' }

const meetingNote: Note = {
  _id: 'n-meeting',
  name: "Today's 1:1 with manager",
  folderId: null,
  body: null,
  // t-missing has no matching todo in todosData below - the dangling-
  // reference tolerance case (user story 17).
  linkedTodoIds: ['t-epf', 't-missing'],
}

let foldersData: NoteFolder[]
let notesData: Note[]
let todosData: Todo[]
let categoriesData: Category[]
let fetchMock: FetchMock

function stubNotesFetch(): FetchMock {
  return stubFetch((href) => {
    if (href.includes('/api/todos/search')) return jsonResponse(todosData)
    if (href.includes('/api/note-folders')) return jsonResponse(foldersData)
    if (href.includes('/api/notes')) return jsonResponse(notesData)
    if (href.includes('/api/todos')) return jsonResponse(todosData)
    if (href.includes('/api/categories')) return jsonResponse(categoriesData)
    return jsonResponse([])
  })
}

describe('NotesView', () => {
  beforeEach(() => {
    foldersData = [recipesFolder, workFolder]
    notesData = [passwordsNote, pastaNote]
    todosData = []
    categoriesData = []
    fetchMock = stubNotesFetch()
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('renders the unified tree with folders and notes mixed together, sorted alphabetically', async () => {
    render(<NotesView onOpenTodo={vi.fn()} activeProfileId="profile-1" />)

    await waitFor(() => {
      expect(screen.getByText('Root')).toBeInTheDocument()
    })

    // Root level: Passwords (note), Recipes (folder), Work (folder) - one
    // alphabetical listing across both kinds.
    const treeLabels = ['Passwords', 'Recipes', 'Work']
    const positions = treeLabels.map((label) => screen.getByText(label).compareDocumentPosition)
    expect(positions).toHaveLength(3)
    for (const label of treeLabels) {
      expect(screen.getByText(label)).toBeInTheDocument()
    }
    // Weeknight pasta nests under Recipes (expanded by default).
    expect(screen.getByText('Weeknight pasta')).toBeInTheDocument()

    const foldersCall = fetchMock.mock.calls.find(([url]) => url.includes('/api/note-folders'))
    expect(foldersCall?.[0]).toContain('profileId=profile-1')
  })

  it('shows the empty-state placeholder naming Root until a note is selected', async () => {
    render(<NotesView onOpenTodo={vi.fn()} activeProfileId="profile-1" />)

    await waitFor(() => {
      expect(screen.getByText('Root')).toBeInTheDocument()
    })

    expect(
      screen.getByText('Select a note to edit it here, or create one in "Root".'),
    ).toBeInTheDocument()
  })

  it('creates a folder at the root via the + Folder button', async () => {
    render(<NotesView onOpenTodo={vi.fn()} activeProfileId="profile-1" />)
    await waitFor(() => {
      expect(screen.getByText('Root')).toBeInTheDocument()
    })

    const created: NoteFolder = { _id: 'f-new', name: 'New Folder', parentId: null }
    fetchMock.mockImplementationOnce(() => jsonResponse(created, true)) // POST /api/note-folders
    fetchMock.mockImplementationOnce(() => jsonResponse([...foldersData, created])) // refetch GET

    fireEvent.click(screen.getByRole('button', { name: 'New folder' }))

    await waitFor(() => {
      expect(screen.getByText('New Folder')).toBeInTheDocument()
    })

    const postCall = fetchMock.mock.calls.find(([, opts]) => opts?.method === 'POST')
    expect(postCall).toBeDefined()
    expect(postCall![0]).toContain('/api/note-folders')
    expect(JSON.parse(postCall![1]?.body ?? '{}')).toEqual({
      name: 'New Folder',
      parentId: null,
      profileId: 'profile-1',
    })
  })

  it('creates a note in the active folder via the + Note button and opens it, pre-filled, in the editor pane', async () => {
    render(<NotesView onOpenTodo={vi.fn()} activeProfileId="profile-1" />)
    await waitFor(() => {
      expect(screen.getByText('Root')).toBeInTheDocument()
    })

    // Click into the Recipes folder first so the new note is created there.
    fireEvent.click(screen.getByText('Recipes'))

    const created: Note = { _id: 'n-new', name: 'Untitled Note', folderId: 'f-recipes', body: null }
    fetchMock.mockImplementationOnce(() => jsonResponse(created, true)) // POST /api/notes
    fetchMock.mockImplementationOnce(() => jsonResponse([...notesData, created])) // refetch GET

    fireEvent.click(screen.getByRole('button', { name: 'New note' }))

    await waitFor(() => {
      expect(screen.getByLabelText('Note name')).toHaveValue('Untitled Note')
    })

    const postCall = fetchMock.mock.calls.find(
      ([url, opts]) => url.includes('/api/notes') && opts?.method === 'POST',
    )
    expect(postCall).toBeDefined()
    expect(JSON.parse(postCall![1]?.body ?? '{}')).toEqual({
      name: 'Untitled Note',
      folderId: 'f-recipes',
      profileId: 'profile-1',
    })
  })

  it('selecting an existing note opens the editor pane pre-filled with its name and body', async () => {
    render(<NotesView onOpenTodo={vi.fn()} activeProfileId="profile-1" />)
    await waitFor(() => {
      expect(screen.getByText('Root')).toBeInTheDocument()
    })

    fireEvent.click(screen.getByText('Passwords'))

    await waitFor(() => {
      expect(screen.getByLabelText('Note name')).toHaveValue('Passwords')
    })
    expect(screen.getByText('Nothing sensitive')).toBeInTheDocument()
    // No Save button until something actually changes.
    expect(screen.queryByRole('button', { name: 'Save' })).not.toBeInTheDocument()
  })

  it('saves an edited note name via PATCH /api/notes/:id', async () => {
    render(<NotesView onOpenTodo={vi.fn()} activeProfileId="profile-1" />)
    await waitFor(() => {
      expect(screen.getByText('Root')).toBeInTheDocument()
    })

    fireEvent.click(screen.getByText('Passwords'))
    await waitFor(() => {
      expect(screen.getByLabelText('Note name')).toHaveValue('Passwords')
    })

    fireEvent.change(screen.getByLabelText('Note name'), { target: { value: 'Passwords (renamed)' } })

    const saveButton = await screen.findByRole('button', { name: 'Save' })

    const updated: Note = { ...passwordsNote, name: 'Passwords (renamed)' }
    fetchMock.mockImplementationOnce(() => jsonResponse(updated, true)) // PATCH

    fireEvent.click(saveButton)

    await waitFor(() => {
      const patchCall = fetchMock.mock.calls.find(([, opts]) => opts?.method === 'PATCH')
      expect(patchCall).toBeDefined()
      expect(patchCall![0]).toContain('/api/notes/n-passwords')
      expect(patchCall![0]).toContain('profileId=profile-1')
      expect(JSON.parse(patchCall![1]?.body ?? '{}')).toEqual({ name: 'Passwords (renamed)' })
    })

    await waitFor(() => {
      expect(screen.queryByRole('button', { name: 'Save' })).not.toBeInTheDocument()
    })
  })

  it('saves an edited note body via PATCH /api/notes/:id', async () => {
    render(<NotesView onOpenTodo={vi.fn()} activeProfileId="profile-1" />)
    await waitFor(() => {
      expect(screen.getByText('Root')).toBeInTheDocument()
    })

    fireEvent.click(screen.getByText('Passwords'))
    await waitFor(() => {
      expect(screen.getByText('Nothing sensitive')).toBeInTheDocument()
    })

    const editable = document.querySelector('[contenteditable]') as HTMLElement
    pasteText(editable, 'X')

    const saveButton = await screen.findByRole('button', { name: 'Save' })

    const updated: Note = { ...passwordsNote, body: { type: 'doc', content: [] } }
    fetchMock.mockImplementationOnce(() => jsonResponse(updated, true)) // PATCH

    fireEvent.click(saveButton)

    await waitFor(() => {
      const patchCall = fetchMock.mock.calls.find(([, opts]) => opts?.method === 'PATCH')
      expect(patchCall).toBeDefined()
      const body = JSON.parse(patchCall![1]?.body ?? '{}')
      expect(body).toHaveProperty('body')
      expect(body).not.toHaveProperty('name')
    })
  })

  it('re-fetches folders and notes, and clears selection, when the active profile changes', async () => {
    const { rerender } = render(<NotesView onOpenTodo={vi.fn()} activeProfileId="profile-1" />)
    await waitFor(() => {
      expect(screen.getByText('Passwords')).toBeInTheDocument()
    })

    fireEvent.click(screen.getByText('Passwords'))
    await waitFor(() => {
      expect(screen.getByLabelText('Note name')).toBeInTheDocument()
    })

    const otherFolder: NoteFolder = { _id: 'f-personal', name: 'Personal', parentId: null }
    const otherNote: Note = { _id: 'n-groceries', name: 'Groceries', folderId: null, body: null }
    foldersData = [otherFolder]
    notesData = [otherNote]
    fetchMock = stubNotesFetch()

    rerender(<NotesView onOpenTodo={vi.fn()} activeProfileId="profile-2" />)

    await waitFor(() => {
      expect(screen.getByText('Groceries')).toBeInTheDocument()
    })
    expect(screen.queryByText('Passwords')).not.toBeInTheDocument()
    // Selection from the previous profile is cleared - back to the
    // empty-state placeholder.
    expect(
      screen.getByText('Select a note to edit it here, or create one in "Root".'),
    ).toBeInTheDocument()

    const foldersCalls = fetchMock.mock.calls.filter(([url]) => url.includes('/api/note-folders'))
    expect(foldersCalls.some(([url]) => url.includes('profileId=profile-2'))).toBe(true)
  })

  it('moves a note to a different folder via the move picker', async () => {
    render(<NotesView onOpenTodo={vi.fn()} activeProfileId="profile-1" />)
    await waitFor(() => {
      expect(screen.getByText('Root')).toBeInTheDocument()
    })

    openRowMenu('Weeknight pasta')
    fireEvent.click(screen.getByText('Move'))

    const dialog = screen.getByRole('dialog', { name: 'Move "Weeknight pasta"' })
    fireEvent.click(within(dialog).getByText('Work'))

    const updated: Note = { ...pastaNote, folderId: 'f-work' }
    fetchMock.mockImplementationOnce(() => jsonResponse(updated, true)) // PATCH

    fireEvent.click(within(dialog).getByRole('button', { name: 'Move here' }))

    await waitFor(() => {
      const patchCall = fetchMock.mock.calls.find(([, opts]) => opts?.method === 'PATCH')
      expect(patchCall).toBeDefined()
      expect(patchCall![0]).toContain('/api/notes/n-pasta')
      expect(JSON.parse(patchCall![1]?.body ?? '{}')).toEqual({ folderId: 'f-work' })
    })

    expect(screen.queryByRole('dialog', { name: 'Move "Weeknight pasta"' })).not.toBeInTheDocument()
  })

  it('moves a folder to a different parent via the move picker', async () => {
    render(<NotesView onOpenTodo={vi.fn()} activeProfileId="profile-1" />)
    await waitFor(() => {
      expect(screen.getByText('Root')).toBeInTheDocument()
    })

    openRowMenu('Recipes')
    fireEvent.click(screen.getByText('Move'))

    const dialog = screen.getByRole('dialog', { name: 'Move "Recipes"' })
    fireEvent.click(within(dialog).getByText('Work'))

    const updated: NoteFolder = { ...recipesFolder, parentId: 'f-work' }
    fetchMock.mockImplementationOnce(() => jsonResponse(updated, true)) // PATCH

    fireEvent.click(within(dialog).getByRole('button', { name: 'Move here' }))

    await waitFor(() => {
      const patchCall = fetchMock.mock.calls.find(([, opts]) => opts?.method === 'PATCH')
      expect(patchCall).toBeDefined()
      expect(patchCall![0]).toContain('/api/note-folders/f-recipes')
      expect(JSON.parse(patchCall![1]?.body ?? '{}')).toEqual({ parentId: 'f-work' })
    })
  })

  it("excludes a folder's own descendants (and itself) from the move picker", async () => {
    foldersData = [recipesFolder, workFolder, workIdeasFolder]
    fetchMock = stubNotesFetch()

    render(<NotesView onOpenTodo={vi.fn()} activeProfileId="profile-1" />)
    await waitFor(() => {
      expect(screen.getByText('Root')).toBeInTheDocument()
    })

    openRowMenu('Work')
    fireEvent.click(screen.getByText('Move'))

    const dialog = screen.getByRole('dialog', { name: 'Move "Work"' })
    // Recipes is unrelated to Work - still a valid destination.
    expect(within(dialog).getByText('Recipes')).toBeInTheDocument()
    // Ideas is Work's own child, and Work itself can't be its own
    // destination - both are excluded from the picker's options.
    expect(within(dialog).queryByText('Ideas')).not.toBeInTheDocument()
    expect(within(dialog).queryByText('Work')).not.toBeInTheDocument()
  })

  it('renames a folder inline, saving via PATCH /api/note-folders/:id', async () => {
    render(<NotesView onOpenTodo={vi.fn()} activeProfileId="profile-1" />)
    await waitFor(() => {
      expect(screen.getByText('Root')).toBeInTheDocument()
    })

    openRowMenu('Recipes')
    fireEvent.click(screen.getByText('Rename'))
    const input = screen.getByRole('textbox', { name: 'Rename "Recipes"' })
    fireEvent.change(input, { target: { value: 'Recipes (renamed)' } })

    const updated: NoteFolder = { ...recipesFolder, name: 'Recipes (renamed)' }
    fetchMock.mockImplementationOnce(() => jsonResponse(updated, true)) // PATCH

    fireEvent.blur(input)

    await waitFor(() => {
      const patchCall = fetchMock.mock.calls.find(([, opts]) => opts?.method === 'PATCH')
      expect(patchCall).toBeDefined()
      expect(patchCall![0]).toContain('/api/note-folders/f-recipes')
      expect(JSON.parse(patchCall![1]?.body ?? '{}')).toEqual({ name: 'Recipes (renamed)' })
    })
  })

  it('shows a requestConfirm prompt before deleting a note, then calls DELETE /api/notes/:id', async () => {
    render(<NotesView onOpenTodo={vi.fn()} activeProfileId="profile-1" />)
    await waitFor(() => {
      expect(screen.getByText('Root')).toBeInTheDocument()
    })

    openRowMenu('Passwords')
    fireEvent.click(screen.getByText('Delete'))

    expect(screen.getByText('Delete "Passwords"? This cannot be undone.')).toBeInTheDocument()

    fetchMock.mockImplementationOnce(() => jsonResponse(null, true)) // DELETE

    fireEvent.click(screen.getByRole('button', { name: 'Confirm' }))

    await waitFor(() => {
      const deleteCall = fetchMock.mock.calls.find(([, opts]) => opts?.method === 'DELETE')
      expect(deleteCall).toBeDefined()
      expect(deleteCall![0]).toContain('/api/notes/n-passwords')
    })
  })

  it('shows a cascade requestConfirm prompt with the destroyed-item count before deleting a folder, then calls DELETE', async () => {
    foldersData = [recipesFolder, workFolder, workIdeasFolder]
    notesData = [passwordsNote, pastaNote, standupNote]
    fetchMock = stubNotesFetch()

    render(<NotesView onOpenTodo={vi.fn()} activeProfileId="profile-1" />)
    await waitFor(() => {
      expect(screen.getByText('Root')).toBeInTheDocument()
    })

    // Work has one descendant folder (Ideas) and one note directly inside
    // it (Standup notes).
    openRowMenu('Work')
    fireEvent.click(screen.getByText('Delete'))

    expect(screen.getByText('Delete "Work" and everything in it — 1 note, 1 folder?')).toBeInTheDocument()

    fetchMock.mockImplementationOnce(() => jsonResponse(null, true)) // DELETE

    fireEvent.click(screen.getByRole('button', { name: 'Confirm' }))

    await waitFor(() => {
      const deleteCall = fetchMock.mock.calls.find(([, opts]) => opts?.method === 'DELETE')
      expect(deleteCall).toBeDefined()
      expect(deleteCall![0]).toContain('/api/note-folders/f-work')
    })
  })

  it('resets the right pane to the empty-state placeholder when the open note is deleted directly', async () => {
    render(<NotesView onOpenTodo={vi.fn()} activeProfileId="profile-1" />)
    await waitFor(() => {
      expect(screen.getByText('Root')).toBeInTheDocument()
    })

    fireEvent.click(screen.getByText('Passwords'))
    await waitFor(() => {
      expect(screen.getByLabelText('Note name')).toHaveValue('Passwords')
    })

    openRowMenu('Passwords')
    fireEvent.click(screen.getByText('Delete'))
    fetchMock.mockImplementationOnce(() => jsonResponse(null, true)) // DELETE
    // The refetch after deletion should no longer include Passwords.
    notesData = notesData.filter((note) => note._id !== 'n-passwords')

    fireEvent.click(screen.getByRole('button', { name: 'Confirm' }))

    await waitFor(() => {
      expect(screen.queryByLabelText('Note name')).not.toBeInTheDocument()
    })
    expect(screen.getByText('Select a note to edit it here, or create one in "Root".')).toBeInTheDocument()
  })

  it("resets the right pane to the empty-state placeholder when the open note's folder is deleted via cascade", async () => {
    render(<NotesView onOpenTodo={vi.fn()} activeProfileId="profile-1" />)
    await waitFor(() => {
      expect(screen.getByText('Root')).toBeInTheDocument()
    })

    fireEvent.click(screen.getByText('Weeknight pasta'))
    await waitFor(() => {
      expect(screen.getByLabelText('Note name')).toHaveValue('Weeknight pasta')
    })

    openRowMenu('Recipes')
    fireEvent.click(screen.getByText('Delete'))
    expect(screen.getByText('Delete "Recipes" and everything in it — 1 note, 0 folders?')).toBeInTheDocument()

    fetchMock.mockImplementationOnce(() => jsonResponse(null, true)) // DELETE
    // The refetch after the cascade should no longer include Recipes or the
    // note that lived inside it.
    foldersData = foldersData.filter((folder) => folder._id !== 'f-recipes')
    notesData = notesData.filter((note) => note._id !== 'n-pasta')

    fireEvent.click(screen.getByRole('button', { name: 'Confirm' }))

    await waitFor(() => {
      expect(screen.queryByLabelText('Note name')).not.toBeInTheDocument()
    })
    expect(screen.getByText('Select a note to edit it here, or create one in "Root".')).toBeInTheDocument()
  })

  // Ticket 14: the quick-add pin icon on NotesView's note row - the second
  // insertion point alongside TodoItem (see
  // .scratch/boards/issues/14-quick-add-icon-and-badge.md). TodoItem.test.tsx
  // already covers the icon's own render/click contract against a hand-rolled
  // row; these tests drive it through NotesView's real tree markup instead,
  // so its behavior is proven against the actual DOM rather than a fixture
  // that could drift out of sync with it.
  describe('NotesView quick-add icon', () => {
    function makeQuickAdd(overrides: Partial<BoardQuickAddState> = {}): BoardQuickAddState {
      return {
        activeItemKeys: new Set<string>(),
        onAdd: vi.fn(),
        onRemove: vi.fn(),
        ...overrides,
      }
    }

    it('renders no icon when boardQuickAdd is omitted', async () => {
      render(<NotesView onOpenTodo={vi.fn()} activeProfileId="profile-1" />)
      await waitFor(() => {
        expect(screen.getByText('Root')).toBeInTheDocument()
      })

      expect(screen.queryByLabelText(/the active board/)).not.toBeInTheDocument()
    })

    it('renders the outline pin at rest when the note is not on the active board', async () => {
      const quickAdd = makeQuickAdd()
      render(<NotesView onOpenTodo={vi.fn()} activeProfileId="profile-1" boardQuickAdd={quickAdd} />)
      await waitFor(() => {
        expect(screen.getByText('Root')).toBeInTheDocument()
      })

      const icon = screen.getByLabelText('Add "Passwords" to the active board')
      expect(icon).toHaveAttribute('aria-pressed', 'false')
      expect(icon.querySelector('svg')).toHaveAttribute('fill', 'none')
    })

    it('renders the filled pin when the note is on the active board', async () => {
      const quickAdd = makeQuickAdd({ activeItemKeys: new Set(['Note:n-passwords']) })
      render(<NotesView onOpenTodo={vi.fn()} activeProfileId="profile-1" boardQuickAdd={quickAdd} />)
      await waitFor(() => {
        expect(screen.getByText('Root')).toBeInTheDocument()
      })

      const icon = screen.getByLabelText('Remove "Passwords" from the active board')
      expect(icon).toHaveAttribute('aria-pressed', 'true')
      expect(icon.querySelector('svg')).toHaveAttribute('fill', 'currentColor')
    })

    it('clicking the outline icon calls onAdd with the note, its label, and the icon element itself - and does not select the note', async () => {
      const quickAdd = makeQuickAdd()
      render(<NotesView onOpenTodo={vi.fn()} activeProfileId="profile-1" boardQuickAdd={quickAdd} />)
      await waitFor(() => {
        expect(screen.getByText('Root')).toBeInTheDocument()
      })

      fireEvent.click(screen.getByLabelText('Add "Passwords" to the active board'))

      expect(quickAdd.onAdd).toHaveBeenCalledWith('Note', 'n-passwords', 'Passwords', expect.any(HTMLElement))
      expect(quickAdd.onRemove).not.toHaveBeenCalled()
      // The row's own click handling (opening the note in the editor pane)
      // must never fire from a click aimed at the icon - the icon's click
      // handler stops propagation, same contract TodoItem.test.tsx verifies for the todo row.
      expect(screen.queryByLabelText('Note name')).not.toBeInTheDocument()
    })

    it('clicking the filled icon calls onRemove, not onAdd', async () => {
      const quickAdd = makeQuickAdd({ activeItemKeys: new Set(['Note:n-passwords']) })
      render(<NotesView onOpenTodo={vi.fn()} activeProfileId="profile-1" boardQuickAdd={quickAdd} />)
      await waitFor(() => {
        expect(screen.getByText('Root')).toBeInTheDocument()
      })

      fireEvent.click(screen.getByLabelText('Remove "Passwords" from the active board'))

      expect(quickAdd.onRemove).toHaveBeenCalledWith('Note', 'n-passwords')
      expect(quickAdd.onAdd).not.toHaveBeenCalled()
    })

    // Regression test for the hover-reveal placement bug (see the Boards
    // spec's "Quick-add icon" section and ticket 14's "Placement rule"): the
    // pin and the row's "More actions" menu are both always rendered (only
    // their opacity is hover-gated via CSS - see ROW_BASE_CLASSES/RowMenu),
    // unlike the old hidden/group-hover:flex Move/Delete buttons that popped
    // in and out of the flex layout, shrinking flex-1 and shifting every
    // sibling after it sideways. Since nothing here toggles display, a click
    // aimed at the icon can never land on a newly-shifted sibling instead.
    it('keeps the quick-add icon and the row menu always in the DOM (opacity-hidden, not display-toggled), so hover never shifts a pending click', async () => {
      const quickAdd = makeQuickAdd()
      render(<NotesView onOpenTodo={vi.fn()} activeProfileId="profile-1" boardQuickAdd={quickAdd} />)
      await waitFor(() => {
        expect(screen.getByText('Root')).toBeInTheDocument()
      })

      const icon = screen.getByLabelText('Add "Passwords" to the active board')
      const row = icon.closest('.group') as HTMLElement
      expect(within(row).getByRole('button', { name: 'More actions' })).toBeInTheDocument()

      fireEvent.click(icon)
      expect(quickAdd.onAdd).toHaveBeenCalledWith('Note', 'n-passwords', 'Passwords', expect.any(HTMLElement))
    })
  })

  // .scratch/note-linked-todos/spec.md - the "Linked todos" trigger pill,
  // its inline rail, and the rail's own "+" add panel (search existing /
  // create new).
  describe('linked todos', () => {
    beforeEach(() => {
      notesData = [passwordsNote, pastaNote, meetingNote]
      todosData = [epfTodo, handoutTodo, approvalTodo]
      categoriesData = [workCategory]
      fetchMock = stubNotesFetch()
    })

    async function openMeetingNote() {
      render(<NotesView onOpenTodo={vi.fn()} activeProfileId="profile-1" />)
      await waitFor(() => {
        expect(screen.getByText('Root')).toBeInTheDocument()
      })
      fireEvent.click(screen.getByText("Today's 1:1 with manager"))
      await waitFor(() => {
        expect(screen.getByLabelText('Note name')).toHaveValue("Today's 1:1 with manager")
      })
    }

    it('renders the trigger collapsed by default, with the badge showing the correct count', async () => {
      await openMeetingNote()

      const trigger = screen.getByRole('button', { name: 'Show linked todos' })
      expect(trigger).toHaveAttribute('aria-expanded', 'false')
      // Only t-epf resolves (t-missing is dangling) - badge shows 1, not 2.
      expect(within(trigger).getByText('1')).toBeInTheDocument()
      expect(screen.queryByText('Get filled EPF form')).not.toBeInTheDocument()
    })

    it('clicking the trigger reveals the rail; clicking it again hides it', async () => {
      await openMeetingNote()

      fireEvent.click(screen.getByRole('button', { name: 'Show linked todos' }))
      expect(screen.getByText('Get filled EPF form')).toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'Hide linked todos' })).toHaveAttribute('aria-expanded', 'true')

      fireEvent.click(screen.getByRole('button', { name: 'Hide linked todos' }))
      expect(screen.queryByText('Get filled EPF form')).not.toBeInTheDocument()
    })

    it('resets the rail to collapsed when a different note is selected', async () => {
      await openMeetingNote()
      fireEvent.click(screen.getByRole('button', { name: 'Show linked todos' }))
      expect(screen.getByText('Get filled EPF form')).toBeInTheDocument()

      fireEvent.click(screen.getByText('Passwords'))
      await waitFor(() => {
        expect(screen.getByLabelText('Note name')).toHaveValue('Passwords')
      })

      expect(screen.getByRole('button', { name: 'Show linked todos' })).toHaveAttribute('aria-expanded', 'false')
      expect(screen.queryByText('Get filled EPF form')).not.toBeInTheDocument()
    })

    it('a linkedTodoIds entry that does not resolve to a loaded todo is silently omitted from the rail', async () => {
      await openMeetingNote()
      fireEvent.click(screen.getByRole('button', { name: 'Show linked todos' }))

      expect(screen.getByText('Get filled EPF form')).toBeInTheDocument()
      // t-missing has no corresponding todo - no broken row, no thrown error.
      expect(screen.queryByLabelText('Unlink t-missing')).not.toBeInTheDocument()
    })

    it('clicking a linked todo card calls onOpenTodo with the resolved Todo object', async () => {
      const onOpenTodo = vi.fn()
      render(<NotesView onOpenTodo={onOpenTodo} activeProfileId="profile-1" />)
      await waitFor(() => {
        expect(screen.getByText('Root')).toBeInTheDocument()
      })
      fireEvent.click(screen.getByText("Today's 1:1 with manager"))
      await waitFor(() => {
        expect(screen.getByLabelText('Note name')).toHaveValue("Today's 1:1 with manager")
      })
      fireEvent.click(screen.getByRole('button', { name: 'Show linked todos' }))

      fireEvent.click(screen.getByText('Get filled EPF form'))

      expect(onOpenTodo).toHaveBeenCalledWith(epfTodo)
    })

    it("clicking a linked todo's unlink control calls the notes PATCH with that id removed from linkedTodoIds", async () => {
      await openMeetingNote()
      fireEvent.click(screen.getByRole('button', { name: 'Show linked todos' }))

      const updated: Note = { ...meetingNote, linkedTodoIds: ['t-missing'] }
      fetchMock.mockImplementationOnce(() => jsonResponse(updated, true)) // PATCH

      fireEvent.click(screen.getByLabelText('Unlink Get filled EPF form'))

      await waitFor(() => {
        const patchCall = fetchMock.mock.calls.find(
          ([url, opts]) => url.includes('/api/notes/n-meeting') && opts?.method === 'PATCH',
        )
        expect(patchCall).toBeDefined()
        expect(JSON.parse(patchCall![1]?.body ?? '{}')).toEqual({ linkedTodoIds: ['t-missing'] })
      })
    })

    it('opening the + panel and searching surfaces matching todos excluding already-linked ones; clicking a result links it', async () => {
      await openMeetingNote()
      fireEvent.click(screen.getByRole('button', { name: 'Show linked todos' }))
      fireEvent.click(screen.getByRole('button', { name: 'Link a todo' }))

      fireEvent.change(screen.getByLabelText('Search todos to link'), { target: { value: 'a' } })

      await waitFor(() => {
        // Print handout and Chase approval both match "a" and aren't linked
        // yet - Get filled EPF form is already linked and must be excluded.
        expect(screen.getByText('Print handout')).toBeInTheDocument()
        expect(screen.getByText('Chase approval from finance')).toBeInTheDocument()
      })
      // "Get filled EPF form" already appears once in the rail itself - the
      // search results must not add a second copy of it.
      expect(screen.getAllByText('Get filled EPF form')).toHaveLength(1)

      const updated: Note = { ...meetingNote, linkedTodoIds: ['t-epf', 't-missing', 't-handout'] }
      fetchMock.mockImplementationOnce(() => jsonResponse(updated, true)) // PATCH

      fireEvent.click(screen.getByText('Print handout'))

      await waitFor(() => {
        const patchCall = fetchMock.mock.calls.find(
          ([url, opts]) => url.includes('/api/notes/n-meeting') && opts?.method === 'PATCH',
        )
        expect(patchCall).toBeDefined()
        expect(JSON.parse(patchCall![1]?.body ?? '{}')).toEqual({
          linkedTodoIds: ['t-epf', 't-missing', 't-handout'],
        })
      })
    })

    it('using "Create new" in the panel calls POST /api/todos, then calls the notes PATCH with the new id appended', async () => {
      await openMeetingNote()
      fireEvent.click(screen.getByRole('button', { name: 'Show linked todos' }))
      fireEvent.click(screen.getByRole('button', { name: 'Link a todo' }))

      fireEvent.click(screen.getByRole('tab', { name: 'Create new' }))
      fireEvent.change(screen.getByLabelText('New todo title'), { target: { value: 'Book meeting room' } })

      const created: Todo = { _id: 't-new', title: 'Book meeting room', priority: 'Medium' }
      fetchMock.mockImplementationOnce(() => jsonResponse(created, true)) // POST /api/todos
      const updated: Note = { ...meetingNote, linkedTodoIds: ['t-epf', 't-missing', 't-new'] }
      fetchMock.mockImplementationOnce(() => jsonResponse(updated, true)) // PATCH /api/notes/n-meeting

      fireEvent.click(screen.getByRole('button', { name: 'Add' }))

      await waitFor(() => {
        const postCall = fetchMock.mock.calls.find(
          ([url, opts]) => url.includes('/api/todos') && !url.includes('search') && opts?.method === 'POST',
        )
        expect(postCall).toBeDefined()
        expect(JSON.parse(postCall![1]?.body ?? '{}')).toEqual({ title: 'Book meeting room', profileId: 'profile-1' })
      })

      await waitFor(() => {
        const patchCall = fetchMock.mock.calls.find(
          ([url, opts]) => url.includes('/api/notes/n-meeting') && opts?.method === 'PATCH',
        )
        expect(patchCall).toBeDefined()
        expect(JSON.parse(patchCall![1]?.body ?? '{}')).toEqual({
          linkedTodoIds: ['t-epf', 't-missing', 't-new'],
        })
      })
    })
  })
})
