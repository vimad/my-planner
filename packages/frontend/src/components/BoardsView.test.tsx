import type { DragEndEvent } from '@dnd-kit/core'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from 'vitest'
import type { Board, Category, Note, NoteFolder, Todo } from '../types'
import { BoardsView } from './BoardsView'

// dnd-kit's real drag gesture recognition needs real layout
// (getBoundingClientRect) that jsdom can't provide, so pointer/keyboard drag
// physics aren't ours to re-test here - dnd-kit owns that contract. Instead,
// DndContext is stubbed to hand back its onDragEnd callback directly,
// letting tests drive our own reorder/persist logic with a plain
// {active, over} event, the same shape dnd-kit itself would produce - same
// approach TodoDetail.test.tsx already established for the Linked Todos
// reorder.
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

function pasteText(node: Element, text: string) {
  fireEvent.paste(node, {
    clipboardData: { getData: (type: string) => (type === 'text/plain' ? text : '') },
  })
}

const kitchenCategory: Category = { _id: 'cat-kitchen', name: 'Kitchen', color: '#f472b6' }

const kitchenTodo: Todo = {
  _id: 't-kitchen',
  title: 'Order new faucet',
  priority: 'High',
  dueDate: '2026-08-04',
  categoryId: 'cat-kitchen',
  body: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'From the plumbing aisle' }] }] },
}

const workFolder: NoteFolder = { _id: 'f-work', name: 'Work', parentId: null }
const ideasFolder: NoteFolder = { _id: 'f-ideas', name: 'Ideas', parentId: 'f-work' }

const standupNote: Note = {
  _id: 'n-standup',
  name: 'Standup notes',
  folderId: 'f-ideas',
  body: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Ship the thing' }] }] },
}

const kitchenBoard: Board = {
  _id: 'b-kitchen',
  name: 'Kitchen Remodel',
  items: [
    { itemType: 'Todo', itemId: 't-kitchen' },
    { itemType: 'Note', itemId: 'n-standup' },
  ],
}

const groceryTodo: Todo = {
  _id: 't-grocery',
  title: 'Buy groceries',
  priority: 'Low',
  dueDate: '',
}

const budgetNote: Note = {
  _id: 'n-budget',
  name: 'Budget notes',
  folderId: null,
}

let notesData: Note[]
let foldersData: NoteFolder[]
// Response for GET /api/notes/search specifically - kept separate from
// `notesData` (the plain notes list BoardsView fetches to resolve/display
// note cards) so search-and-add tests can hand back a search-specific
// result set, including deliberately mocking back an already-on-board note
// (see the "excludes" test below) to prove BoardSearchAndAdd's own
// client-side exclusion filter works even if a mock/misbehaving backend
// didn't.
let noteSearchData: Note[]
let fetchMock: FetchMock

// Boards themselves are no longer fetched by this component (see ticket 14 -
// they're lifted to App.tsx's hooks/useBoards and threaded down as props),
// so this only ever needs to stub the notes/note-folders fetches BoardsView
// still owns itself (to resolve/display note board items) plus a
// catch-all for note PATCH calls individual tests configure themselves.
function stubNotesAndFoldersFetch(): FetchMock {
  return stubFetch((href) => {
    if (href.includes('/api/notes/search')) return jsonResponse(noteSearchData)
    if (href.includes('/api/note-folders')) return jsonResponse(foldersData)
    if (href.includes('/api/notes')) return jsonResponse(notesData)
    return jsonResponse([])
  })
}

function renderBoards(overrides: Partial<Parameters<typeof BoardsView>[0]> = {}) {
  const onSetActiveBoardId = vi.fn().mockResolvedValue(undefined)
  const onSaveTodoBody = vi.fn().mockResolvedValue(undefined)
  const onCreateBoard = vi.fn().mockResolvedValue(kitchenBoard)
  const onRenameBoard = vi.fn().mockResolvedValue(kitchenBoard)
  const onDeleteBoard = vi.fn().mockResolvedValue(undefined)
  const onReplaceBoardItems = vi.fn().mockResolvedValue(kitchenBoard)
  const props: Parameters<typeof BoardsView>[0] = {
    activeProfileId: 'profile-1',
    activeBoardId: 'b-kitchen',
    onSetActiveBoardId,
    todos: [kitchenTodo],
    categories: [kitchenCategory],
    onSaveTodoBody,
    boards: [kitchenBoard],
    boardsLoading: false,
    boardsError: null,
    onCreateBoard,
    onRenameBoard,
    onDeleteBoard,
    onReplaceBoardItems,
    ...overrides,
  }
  const utils = render(<BoardsView {...props} />)
  return {
    ...utils,
    props,
    onSetActiveBoardId,
    onSaveTodoBody,
    onCreateBoard,
    onRenameBoard,
    onDeleteBoard,
    onReplaceBoardItems,
  }
}

describe('BoardsView', () => {
  beforeEach(() => {
    notesData = [standupNote]
    foldersData = [workFolder, ideasFolder]
    noteSearchData = []
    fetchMock = stubNotesAndFoldersFetch()
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('lists boards (from the boards prop) in the switcher and shows the active board name', async () => {
    renderBoards()

    await waitFor(() => {
      expect(screen.getByLabelText('Active board')).toBeInTheDocument()
    })
    expect(screen.getByRole('option', { name: 'Kitchen Remodel (2)' })).toBeInTheDocument()
  })

  it("still fetches its own notes/note-folders scoped to the active profile (boards themselves come from props, not a fetch)", async () => {
    renderBoards()

    await waitFor(() => {
      expect(screen.getByText('Standup notes')).toBeInTheDocument()
    })

    const notesCall = fetchMock.mock.calls.find(([url]) => url.includes('/api/notes') && !url.includes('/api/notes/'))
    expect(notesCall?.[0]).toContain('profileId=profile-1')
    const foldersCall = fetchMock.mock.calls.find(([url]) => url.includes('/api/note-folders'))
    expect(foldersCall?.[0]).toContain('profileId=profile-1')
    // No /api/boards fetch - boards are supplied via props by App.tsx now.
    expect(fetchMock.mock.calls.some(([url]) => url.includes('/api/boards'))).toBe(false)
  })

  it('switching the board dropdown calls onSetActiveBoardId', async () => {
    const otherBoard: Board = { _id: 'b-other', name: 'Errands', items: [] }
    const { onSetActiveBoardId } = renderBoards({ boards: [kitchenBoard, otherBoard] })

    await waitFor(() => {
      expect(screen.getByLabelText('Active board')).toBeInTheDocument()
    })

    fireEvent.change(screen.getByLabelText('Active board'), { target: { value: 'b-other' } })

    expect(onSetActiveBoardId).toHaveBeenCalledWith('b-other')
  })

  it('re-populates the grid when the activeBoardId prop switches to a different board', async () => {
    const otherBoard: Board = { _id: 'b-other', name: 'Errands', items: [] }
    const { rerender, props } = renderBoards({ boards: [kitchenBoard, otherBoard] })

    await waitFor(() => {
      expect(screen.getByText('Order new faucet')).toBeInTheDocument()
    })

    rerender(<BoardsView {...props} boards={[kitchenBoard, otherBoard]} activeBoardId="b-other" />)

    await waitFor(() => {
      expect(screen.queryByText('Order new faucet')).not.toBeInTheDocument()
    })
    expect(screen.getByText('Nothing on this board yet. Use the add icon on any todo or note to add one here.')).toBeInTheDocument()
  })

  it('zero-boards state prompts to create the first board, calls onCreateBoard then onSetActiveBoardId', async () => {
    const created: Board = { _id: 'b-new', name: 'Kitchen Remodel', items: [] }
    const onCreateBoard = vi.fn().mockResolvedValue(created)
    const onSetActiveBoardId = vi.fn().mockResolvedValue(undefined)

    const { rerender, props } = renderBoards({ boards: [], activeBoardId: null, onCreateBoard, onSetActiveBoardId })

    await waitFor(() => {
      expect(screen.getByLabelText('New board name')).toBeInTheDocument()
    })
    expect(screen.queryByLabelText('Active board')).not.toBeInTheDocument()

    fireEvent.change(screen.getByLabelText('New board name'), { target: { value: 'Kitchen Remodel' } })
    fireEvent.click(screen.getByRole('button', { name: 'Create board' }))

    await waitFor(() => {
      expect(onCreateBoard).toHaveBeenCalledWith('Kitchen Remodel')
    })
    await waitFor(() => {
      expect(onSetActiveBoardId).toHaveBeenCalledWith('b-new')
    })

    // The create form closes and the switcher (now listing the new board)
    // takes its place - it must not get stuck open after a successful
    // create.
    await waitFor(() => {
      expect(screen.queryByLabelText('New board name')).not.toBeInTheDocument()
    })

    // Simulates App.tsx re-rendering once hooks/useBoards' own refetch
    // (triggered inside onCreateBoard) resolves with the new board, and
    // Profile.activeBoardId picks up the onSetActiveBoardId call above.
    rerender(<BoardsView {...props} boards={[created]} activeBoardId="b-new" onCreateBoard={onCreateBoard} onSetActiveBoardId={onSetActiveBoardId} />)

    expect(screen.getByLabelText('Active board')).toBeInTheDocument()
    expect(screen.getByRole('option', { name: 'Kitchen Remodel (0)' })).toBeInTheDocument()
  })

  it('renders a todo card with the compact summary header and a Todo badge', async () => {
    renderBoards()

    await waitFor(() => {
      expect(screen.getByText('Order new faucet')).toBeInTheDocument()
    })
    expect(screen.getByText('High')).toBeInTheDocument()
    expect(screen.getByText('Due 2026-08-04')).toBeInTheDocument()
    expect(screen.getByText('Kitchen')).toBeInTheDocument()
    expect(screen.getByText('Todo')).toBeInTheDocument()
  })

  it('renders a note card with its title, full folder path, and a Note badge', async () => {
    renderBoards()

    await waitFor(() => {
      expect(screen.getByText('Standup notes')).toBeInTheDocument()
    })
    expect(screen.getByText('Work / Ideas')).toBeInTheDocument()
    expect(screen.getByText('Note')).toBeInTheDocument()
  })

  it("saves a todo card's edited body via the onSaveTodoBody callback (PATCH /api/todos/:id under the hood)", async () => {
    const { onSaveTodoBody } = renderBoards()

    await waitFor(() => {
      expect(screen.getByText('From the plumbing aisle')).toBeInTheDocument()
    })

    const editables = document.querySelectorAll('[contenteditable]')
    pasteText(editables[0], 'X')

    const saveButton = await screen.findByRole('button', { name: 'Save' })
    fireEvent.click(saveButton)

    await waitFor(() => {
      expect(onSaveTodoBody).toHaveBeenCalledWith('t-kitchen', expect.objectContaining({ body: expect.anything() }))
    })
  })

  it("saves a note card's edited body via PATCH /api/notes/:id", async () => {
    renderBoards()

    await waitFor(() => {
      expect(screen.getByText('Ship the thing')).toBeInTheDocument()
    })

    const editables = document.querySelectorAll('[contenteditable]')
    pasteText(editables[1], 'X')

    const saveButton = await screen.findByRole('button', { name: 'Save' })

    const updated: Note = { ...standupNote, body: { type: 'doc', content: [] } }
    fetchMock.mockImplementationOnce(() => jsonResponse(updated, true)) // PATCH

    fireEvent.click(saveButton)

    await waitFor(() => {
      const patchCall = fetchMock.mock.calls.find(([, opts]) => opts?.method === 'PATCH')
      expect(patchCall).toBeDefined()
      expect(patchCall![0]).toContain('/api/notes/n-standup')
      expect(patchCall![0]).toContain('profileId=profile-1')
      const body = JSON.parse(patchCall![1]?.body ?? '{}')
      expect(body).toHaveProperty('body')
    })
  })

  it('removing an item via the × calls onReplaceBoardItems with the item filtered out, without deleting the underlying todo', async () => {
    const { rerender, props, onReplaceBoardItems } = renderBoards()

    await waitFor(() => {
      expect(screen.getByText('Order new faucet')).toBeInTheDocument()
    })

    fireEvent.click(screen.getByRole('button', { name: 'Remove "Order new faucet" from board' }))

    await waitFor(() => {
      expect(onReplaceBoardItems).toHaveBeenCalledWith('b-kitchen', [{ itemType: 'Note', itemId: 'n-standup' }])
    })
    // Only the board reference is removed - no DELETE call against the todo.
    expect(fetchMock.mock.calls.some(([, opts]) => opts?.method === 'DELETE')).toBe(false)

    // Simulates App.tsx re-rendering once hooks/useBoards' optimistic update
    // (triggered by onReplaceBoardItems) lands.
    const updated: Board = { ...kitchenBoard, items: [{ itemType: 'Note', itemId: 'n-standup' }] }
    rerender(<BoardsView {...props} boards={[updated]} />)

    expect(screen.queryByText('Order new faucet')).not.toBeInTheDocument()
  })

  it('renders a dangling reference as a ghost-card placeholder with a remove affordance', async () => {
    const danglingBoard: Board = {
      _id: 'b-kitchen',
      name: 'Kitchen Remodel',
      items: [{ itemType: 'Todo', itemId: 't-deleted' }],
    }
    notesData = []
    fetchMock = stubNotesAndFoldersFetch()

    const { onReplaceBoardItems } = renderBoards({ boards: [danglingBoard], todos: [] })

    await waitFor(() => {
      expect(screen.getByText('This item was deleted elsewhere.')).toBeInTheDocument()
    })

    fireEvent.click(screen.getByRole('button', { name: 'Remove from board' }))

    await waitFor(() => {
      expect(onReplaceBoardItems).toHaveBeenCalledWith('b-kitchen', [])
    })
  })

  it('shows the empty-grid placeholder when the active board has zero items', async () => {
    renderBoards({ boards: [{ _id: 'b-kitchen', name: 'Kitchen Remodel', items: [] }] })

    await waitFor(() => {
      expect(
        screen.getByText('Nothing on this board yet. Use the add icon on any todo or note to add one here.'),
      ).toBeInTheDocument()
    })
  })

  it('shows the loading state while boardsLoading is true', () => {
    renderBoards({ boardsLoading: true })

    expect(screen.getByText('Loading boards...')).toBeInTheDocument()
  })

  it('renders boardsError from the parent alongside this view\'s own errors', async () => {
    renderBoards({ boardsError: 'board mutation failed' })

    await waitFor(() => {
      expect(screen.getByText('Error: board mutation failed')).toBeInTheDocument()
    })
  })

  it('re-scopes its own notes/folders fetch to the newly active profile when activeProfileId changes', async () => {
    const { rerender, props } = renderBoards()

    await waitFor(() => {
      expect(screen.getByText('Kitchen Remodel (2)')).toBeInTheDocument()
    })

    const otherBoard: Board = { _id: 'b-personal', name: 'Personal errands', items: [] }
    notesData = []
    foldersData = []
    fetchMock = stubNotesAndFoldersFetch()

    rerender(
      <BoardsView
        {...props}
        activeProfileId="profile-2"
        activeBoardId="b-personal"
        boards={[otherBoard]}
        todos={[]}
        categories={[]}
      />,
    )

    await waitFor(() => {
      expect(screen.getByText('Personal errands (0)')).toBeInTheDocument()
    })

    const scopedCalls = fetchMock.mock.calls.filter(
      ([url]) => url.includes('/api/notes') || url.includes('/api/note-folders'),
    )
    expect(scopedCalls.some(([url]) => url.includes('profileId=profile-2'))).toBe(true)
  })

  it('renames the active board inline via the pencil affordance, without a confirm prompt', async () => {
    const { onRenameBoard } = renderBoards()

    await waitFor(() => {
      expect(screen.getByLabelText('Rename "Kitchen Remodel"')).toBeInTheDocument()
    })

    fireEvent.click(screen.getByLabelText('Rename "Kitchen Remodel"'))

    const input = screen.getByLabelText('Board name')
    expect(input).toHaveValue('Kitchen Remodel')
    fireEvent.change(input, { target: { value: 'Remodel Kitchen v2' } })

    fireEvent.click(screen.getByRole('button', { name: 'Save' }))

    await waitFor(() => {
      expect(onRenameBoard).toHaveBeenCalledWith('b-kitchen', 'Remodel Kitchen v2')
    })

    // No confirm dialog gates rename - it saves directly.
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
  })

  it('gates board delete behind a confirm dialog showing the combined todo+note item count, then calls onDeleteBoard', async () => {
    const { onDeleteBoard } = renderBoards()

    await waitFor(() => {
      expect(screen.getByLabelText('Delete "Kitchen Remodel"')).toBeInTheDocument()
    })

    fireEvent.click(screen.getByLabelText('Delete "Kitchen Remodel"'))

    expect(
      screen.getByText(
        'Delete "Kitchen Remodel"? Its 2 item(s) will not be deleted — only this board and its references to them.',
      ),
    ).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Confirm' }))

    await waitFor(() => {
      expect(onDeleteBoard).toHaveBeenCalledWith('b-kitchen')
    })
  })

  it('calls onDeleteBoard then onBoardDeleted, re-rendering correctly once the parent supplies the fallback board', async () => {
    const otherBoard: Board = { _id: 'b-other', name: 'Errands', items: [] }
    const onBoardDeleted = vi.fn().mockResolvedValue(undefined)
    const { rerender, props, onDeleteBoard } = renderBoards({ boards: [kitchenBoard, otherBoard], onBoardDeleted })

    await waitFor(() => {
      expect(screen.getByText('Order new faucet')).toBeInTheDocument()
    })

    fireEvent.click(screen.getByLabelText('Delete "Kitchen Remodel"'))
    fireEvent.click(screen.getByRole('button', { name: 'Confirm' }))

    await waitFor(() => expect(onDeleteBoard).toHaveBeenCalledWith('b-kitchen'))
    // The parent (App.tsx) is responsible for re-reading Profile.activeBoardId
    // and hooks/useBoards' own list after this fires and re-rendering with
    // the fallback - this component's job is only to call it and to re-read
    // `boards`/`activeBoardId` off its own props afterwards, not to guess
    // the fallback itself.
    await waitFor(() => expect(onBoardDeleted).toHaveBeenCalled())

    rerender(<BoardsView {...props} boards={[otherBoard]} activeBoardId="b-other" onBoardDeleted={onBoardDeleted} />)

    await waitFor(() => {
      expect(screen.queryByRole('option', { name: 'Kitchen Remodel (2)' })).not.toBeInTheDocument()
      expect(screen.getByRole('option', { name: 'Errands (0)' })).toBeInTheDocument()
    })
    expect(screen.getByText('Nothing on this board yet. Use the add icon on any todo or note to add one here.')).toBeInTheDocument()
  })

  it('falls back to the no-boards state once the parent supplies zero boards after delete', async () => {
    const onBoardDeleted = vi.fn().mockResolvedValue(undefined)
    const { rerender, props, onDeleteBoard } = renderBoards({ onBoardDeleted })

    await waitFor(() => {
      expect(screen.getByText('Order new faucet')).toBeInTheDocument()
    })

    fireEvent.click(screen.getByLabelText('Delete "Kitchen Remodel"'))
    fireEvent.click(screen.getByRole('button', { name: 'Confirm' }))

    await waitFor(() => expect(onDeleteBoard).toHaveBeenCalledWith('b-kitchen'))
    await waitFor(() => expect(onBoardDeleted).toHaveBeenCalled())

    rerender(<BoardsView {...props} boards={[]} activeBoardId={null} onBoardDeleted={onBoardDeleted} />)

    await waitFor(() => {
      expect(
        screen.getByText(
          "Boards pull together todos and notes for something you're working on. Create your first one to get started.",
        ),
      ).toBeInTheDocument()
    })
    // No board left to show, and no board left to rename/delete either.
    expect(screen.queryByLabelText('Active board')).not.toBeInTheDocument()
    expect(screen.queryByLabelText(/^Rename /)).not.toBeInTheDocument()
    expect(screen.queryByLabelText(/^Delete /)).not.toBeInTheDocument()
  })

  describe('drag-to-reorder', () => {
    async function dragEnd(activeId: string, overId: string) {
      await act(async () => {
        // The mocked DndContext only ever hands back a minimal {active, over}
        // pair (see the vi.mock above) - not a full DragEndEvent
        // (activatorEvent/collisions/delta), which handleDragEnd never reads -
        // hence the cast. Ids are the same `${itemType}:${itemId}` composite
        // keys itemKey/useSortable use.
        await capturedDragEnd?.({ active: { id: activeId }, over: { id: overId } } as DragEndEvent)
      })
    }

    it('calls onReplaceBoardItems with the reordered array, including across mixed todo/note cards', async () => {
      const { onReplaceBoardItems } = renderBoards()

      await waitFor(() => {
        expect(screen.getByText('Order new faucet')).toBeInTheDocument()
        expect(screen.getByText('Standup notes')).toBeInTheDocument()
      })

      await dragEnd('Todo:t-kitchen', 'Note:n-standup')

      await waitFor(() => {
        expect(onReplaceBoardItems).toHaveBeenCalledWith('b-kitchen', [
          { itemType: 'Note', itemId: 'n-standup' },
          { itemType: 'Todo', itemId: 't-kitchen' },
        ])
      })
    })

    it('does not throw when the reorder persist rejects - the optimistic-update/rollback itself is owned by hooks/useBoards (tested there)', async () => {
      const onReplaceBoardItems = vi.fn().mockRejectedValue(new Error('boom'))
      renderBoards({ onReplaceBoardItems })

      await waitFor(() => {
        expect(screen.getByText('Order new faucet')).toBeInTheDocument()
      })

      await dragEnd('Todo:t-kitchen', 'Note:n-standup')

      await waitFor(() => {
        expect(onReplaceBoardItems).toHaveBeenCalled()
      })
    })
  })

  describe('search-and-add', () => {
    it('filters todo results by title as the user types, excluding items already on the active board', async () => {
      renderBoards({ todos: [kitchenTodo, groceryTodo] })

      await waitFor(() => {
        expect(screen.getByText('Order new faucet')).toBeInTheDocument()
      })

      const input = screen.getByLabelText('Search todos and notes to add')

      // Matches groceryTodo (not yet on the board) - shows up as a result.
      fireEvent.change(input, { target: { value: 'groc' } })
      expect(await screen.findByRole('button', { name: 'Add "Buy groceries" to board' })).toBeInTheDocument()

      // Matches kitchenTodo's title, but it's already on the active board -
      // excluded from results even though the title matches.
      fireEvent.change(input, { target: { value: 'faucet' } })
      await waitFor(() => {
        expect(screen.queryByRole('button', { name: 'Add "Order new faucet" to board' })).not.toBeInTheDocument()
      })
    })

    it('queries GET /api/notes/search with the active board note ids as excludeIds, and excludes already-on-board notes client-side too', async () => {
      noteSearchData = [budgetNote, standupNote]
      renderBoards({ todos: [kitchenTodo] })

      await waitFor(() => {
        expect(screen.getByText('Order new faucet')).toBeInTheDocument()
      })

      fireEvent.change(screen.getByLabelText('Search todos and notes to add'), { target: { value: 'notes' } })

      expect(await screen.findByRole('button', { name: 'Add "Budget notes" to board' })).toBeInTheDocument()
      // standupNote is already on the active board (see kitchenBoard.items) -
      // it must not appear even though the mocked search response includes
      // it, proving BoardSearchAndAdd's own client-side filter (not just the
      // backend's excludeIds) is doing the work.
      expect(screen.queryByRole('button', { name: 'Add "Standup notes" to board' })).not.toBeInTheDocument()

      await waitFor(() => {
        const searchCall = fetchMock.mock.calls.find(([url]) => url.includes('/api/notes/search'))
        expect(searchCall).toBeDefined()
        expect(searchCall![0]).toContain('profileId=profile-1')
        expect(searchCall![0]).toContain('q=notes')
        expect(searchCall![0]).toContain('excludeIds=n-standup')
      })
    })

    it('selecting a todo result and a note result both add the item via onReplaceBoardItems and update the grid', async () => {
      noteSearchData = [budgetNote]
      // budgetNote must also be resolvable via BoardsView's own notes fetch
      // (not just the search response) so the post-rerender grid can render
      // its card - the search endpoint only feeds the search results list.
      notesData = [standupNote, budgetNote]
      fetchMock = stubNotesAndFoldersFetch()
      const { rerender, props, onReplaceBoardItems } = renderBoards({ todos: [kitchenTodo, groceryTodo] })

      await waitFor(() => {
        expect(screen.getByText('Order new faucet')).toBeInTheDocument()
      })

      const input = screen.getByLabelText('Search todos and notes to add')

      fireEvent.change(input, { target: { value: 'groc' } })
      fireEvent.click(await screen.findByRole('button', { name: 'Add "Buy groceries" to board' }))

      await waitFor(() => {
        expect(onReplaceBoardItems).toHaveBeenCalledWith('b-kitchen', [
          ...kitchenBoard.items,
          { itemType: 'Todo', itemId: 't-grocery' },
        ])
      })

      fireEvent.change(input, { target: { value: 'budget' } })
      fireEvent.click(await screen.findByRole('button', { name: 'Add "Budget notes" to board' }))

      await waitFor(() => {
        expect(onReplaceBoardItems).toHaveBeenCalledWith('b-kitchen', [
          ...kitchenBoard.items,
          { itemType: 'Note', itemId: 'n-budget' },
        ])
      })

      // Simulates App.tsx re-rendering once hooks/useBoards' optimistic
      // update (triggered by onReplaceBoardItems) lands with both additions.
      const updated: Board = {
        ...kitchenBoard,
        items: [...kitchenBoard.items, { itemType: 'Todo', itemId: 't-grocery' }, { itemType: 'Note', itemId: 'n-budget' }],
      }
      rerender(<BoardsView {...props} boards={[updated]} todos={[kitchenTodo, groceryTodo]} />)

      expect(screen.getByText('Buy groceries')).toBeInTheDocument()
      expect(screen.getByText('Budget notes')).toBeInTheDocument()
    })

    it('caps todo results and note results at 6 each, independently', async () => {
      const manyTodos: Todo[] = Array.from({ length: 8 }, (_, i) => ({
        _id: `t-extra-${i}`,
        title: `Extra todo ${i}`,
        priority: 'Medium',
        dueDate: '',
      }))
      const manyNotes: Note[] = Array.from({ length: 8 }, (_, i) => ({
        _id: `n-extra-${i}`,
        name: `Extra note ${i}`,
        folderId: null,
      }))
      noteSearchData = manyNotes

      renderBoards({ todos: [kitchenTodo, ...manyTodos] })

      await waitFor(() => {
        expect(screen.getByText('Order new faucet')).toBeInTheDocument()
      })

      fireEvent.change(screen.getByLabelText('Search todos and notes to add'), { target: { value: 'extra' } })

      await waitFor(() => {
        expect(screen.getAllByRole('button', { name: /^Add "Extra todo \d" to board$/ })).toHaveLength(6)
      })
      expect(screen.getAllByRole('button', { name: /^Add "Extra note \d" to board$/ })).toHaveLength(6)
    })
  })
})
