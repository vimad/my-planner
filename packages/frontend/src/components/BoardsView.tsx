import type { JSONContent } from '@tiptap/core'
import { DndContext, KeyboardSensor, PointerSensor, closestCenter, useSensor, useSensors } from '@dnd-kit/core'
import type { DragEndEvent } from '@dnd-kit/core'
import {
  SortableContext,
  arrayMove,
  rectSortingStrategy,
  sortableKeyboardCoordinates,
  useSortable,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react'
import { itemKey } from '../utils/boardItemKey'
import { getId } from '../utils/getId'
import { folderPath } from '../utils/notesTree'
import type { Board, BoardItem, Category, Note, NoteFolder, Todo } from '../types'
import { ConfirmDialog } from './ConfirmDialog'
import { ExpandableNotesEditor } from './ExpandableNotesEditor'
import type { RichTextEditorHandle } from './RichTextEditor'
import { TodoSummaryHeader } from './TodoSummaryHeader'

const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:4100'

async function parseErrorMessage(res: Response): Promise<string> {
  try {
    const data = await res.json()
    return data?.error ?? `Request failed with status ${res.status}`
  } catch {
    return `Request failed with status ${res.status}`
  }
}

// Card content area MUST use a concrete max-h + overflow-y-auto (not
// h-full) - see the Boards spec's "Implementation gotcha" note and
// ExpandableNotesEditor's own inline-vs-enlarged height comment. A missing
// concrete cap here silently stops clipping/scrolling and instead blows the
// card out to fit arbitrarily long pasted content.
const CARD_CONTENT_CLASSNAME =
  'max-h-28 overflow-y-auto [&_.tiptap]:min-h-[3.5rem] [&_.tiptap]:outline-none [&_ul]:list-disc [&_ul]:pl-4 [&_ol]:list-decimal [&_ol]:pl-4 [&_u]:underline [&_s]:line-through'

function TypeBadge({ type }: { type: 'Todo' | 'Note' }) {
  return (
    <span
      className={`shrink-0 rounded-full px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider ${
        type === 'Todo'
          ? 'bg-violet-100 text-violet-700 dark:bg-violet-500/20 dark:text-violet-300'
          : 'bg-cyan-100 text-cyan-700 dark:bg-cyan-500/20 dark:text-cyan-300'
      }`}
    >
      {type}
    </span>
  )
}

// Note-card header: title + full ancestor-chain folder path, computed
// client-side via utils/notesTree's folderPath - mirrors the todo-card
// header's reuse of TodoSummaryHeader, just with no shared component to
// reuse since Notes has nothing equivalent to TodoSummaryHeader yet.
function NoteCardHeader({ note, folders }: { note: Note; folders: NoteFolder[] }) {
  return (
    <div className="min-w-0">
      <h3 className="truncate text-sm font-semibold text-slate-900 dark:text-slate-100">{note.name}</h3>
      <p className="mt-1.5 truncate text-[10px] font-medium text-slate-400 dark:text-slate-500">
        {folderPath(folders, note.folderId ?? null)}
      </p>
    </div>
  )
}

// Placeholder for a board item whose underlying todo/note has since been
// deleted elsewhere - the no-cascade "tolerate and placeholder" convention
// (see Board.items' model comment), not an error. The only affordance
// besides drag-reorder is removing the dangling reference itself; there's
// nothing else to show.
function GhostCard({ onRemove, dragHandle }: { onRemove: () => void; dragHandle?: ReactNode }) {
  return (
    <div className="flex h-40 flex-col items-center justify-center gap-1 rounded-xl border border-dashed border-slate-300 bg-slate-50/60 p-4 text-center text-xs text-slate-400 dark:border-white/10 dark:bg-white/5 dark:text-slate-500">
      {dragHandle}
      <span>This item was deleted elsewhere.</span>
      <button type="button" onClick={onRemove} className="text-fuchsia-500 hover:underline dark:text-fuchsia-300">
        Remove from board
      </button>
    </div>
  )
}

interface BoardItemCardProps {
  todo?: Todo
  note?: Note
  folders: NoteFolder[]
  categoriesById: Record<string, Category>
  onRemove: () => void
  onSaveTodoBody: (id: string, body: JSONContent | null) => Promise<void> | void
  onSaveNoteBody: (id: string, body: JSONContent | null) => Promise<void> | void
  // Rendered as the first item in the header row - the visible drag handle
  // wired up by SortableBoardCard (useSortable's listeners/attributes).
  // Optional so this component stays trivially testable/renderable without
  // dragging in dnd-kit context.
  dragHandle?: ReactNode
}

// One card in the grid - hosts an always-open ExpandableNotesEditor against
// whichever entity (todo or note) this board item resolves to. The editor
// is reused exactly as it exists elsewhere (full toolbar, enlarge-to-modal,
// dirty tracking); this component only adds the border+Save affordance
// while dirty, the same "diff-free unsaved indicator" NotesView's own
// NoteEditorPane already uses for the same editor.
function BoardItemCard({
  todo,
  note,
  folders,
  categoriesById,
  onRemove,
  onSaveTodoBody,
  onSaveNoteBody,
  dragHandle,
}: BoardItemCardProps) {
  const editorRef = useRef<RichTextEditorHandle>(null)
  const [dirty, setDirty] = useState(false)
  const [saving, setSaving] = useState(false)

  if (!todo && !note) {
    return <GhostCard onRemove={onRemove} dragHandle={dragHandle} />
  }

  const title = todo ? todo.title : (note?.name ?? '')
  const body = todo ? (todo.body ?? null) : (note?.body ?? null)

  async function handleSave() {
    const json = editorRef.current?.getJSON() ?? body
    setSaving(true)
    try {
      if (todo) {
        await onSaveTodoBody(String(getId(todo)), json)
      } else if (note) {
        await onSaveNoteBody(String(getId(note)), json)
      }
      editorRef.current?.markSaved()
    } finally {
      setSaving(false)
    }
  }

  return (
    <div
      className={`rounded-xl border bg-white p-3 shadow-sm transition dark:bg-white/5 ${
        dirty ? 'border-fuchsia-400/60' : 'border-slate-200 dark:border-white/10'
      }`}
    >
      <div className="flex items-start gap-1.5">
        {dragHandle}
        <div className="min-w-0 flex-1">
          {todo ? (
            <TodoSummaryHeader
              title={todo.title}
              priority={todo.priority ?? 'Medium'}
              dueDate={todo.dueDate ?? ''}
              category={todo.categoryId ? categoriesById[todo.categoryId] : undefined}
            />
          ) : (
            <NoteCardHeader note={note as Note} folders={folders} />
          )}
        </div>
        <TypeBadge type={todo ? 'Todo' : 'Note'} />
        <button
          type="button"
          aria-label={`Remove "${title}" from board`}
          onClick={onRemove}
          className="shrink-0 rounded-full px-1.5 text-slate-400 hover:bg-slate-200 hover:text-slate-700 dark:hover:bg-white/10 dark:hover:text-slate-200"
        >
          ×
        </button>
      </div>

      <div className="mt-2">
        <ExpandableNotesEditor
          ref={editorRef}
          content={body}
          savedContent={body}
          editable
          toolbar
          onDirtyChange={setDirty}
          className="overflow-hidden rounded-lg border border-slate-200 bg-slate-50 px-2 py-1.5 text-xs text-slate-900 dark:border-white/10 dark:bg-white/5 dark:text-slate-100"
          contentClassName={CARD_CONTENT_CLASSNAME}
        />
        {dirty && (
          <button
            type="button"
            disabled={saving}
            onClick={handleSave}
            className="mt-1.5 self-start rounded-full bg-gradient-to-r from-violet-500 to-fuchsia-500 px-2.5 py-1 text-[11px] font-semibold text-white hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {saving ? 'Saving...' : 'Save'}
          </button>
        )}
      </div>
    </div>
  )
}

interface SortableBoardCardProps {
  itemKey: string
  label: string
  children: (dragHandle: ReactNode) => ReactNode
}

// Makes one grid card draggable/sortable via dnd-kit, mirroring
// TodoDetail's SortableLinkedTodoRow: this wrapper owns useSortable (ref +
// transform/transition + the drag handle's listeners/attributes) and hands
// the handle down as a render-prop so BoardItemCard/GhostCard can place it
// inline in their own layout rather than this wrapper dictating card markup.
function SortableBoardCard({ itemKey: key, label, children }: SortableBoardCardProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: key })
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  }

  const dragHandle = (
    <button
      type="button"
      aria-label={`Reorder "${label}"`}
      {...attributes}
      {...listeners}
      className="shrink-0 cursor-grab touch-none rounded px-1 text-slate-400 hover:bg-slate-200 hover:text-slate-700 active:cursor-grabbing dark:hover:bg-white/10 dark:hover:text-slate-200"
    >
      ⠿
    </button>
  )

  return (
    <div ref={setNodeRef} style={style} className={isDragging ? 'opacity-50' : ''}>
      {children(dragHandle)}
    </div>
  )
}

interface BoardSwitcherProps {
  boards: Board[]
  activeBoardId: string | null
  onSelect: (id: string) => void
  onCreate: (name: string) => Promise<void>
}

// Board-switcher dropdown + "+ New board" affordance, including the
// create-first-board prompt (forced-open create form, no cancel, no select)
// for the zero-boards case. Board rename/delete have their own affordances
// per the spec ("near the switcher"), left for a later ticket - this only
// owns switching and creating.
function BoardSwitcher({ boards, activeBoardId, onSelect, onCreate }: BoardSwitcherProps) {
  const [creating, setCreating] = useState(boards.length === 0)
  const [draftName, setDraftName] = useState('')

  async function submitCreate() {
    const name = draftName.trim()
    if (!name) return
    await onCreate(name)
    setDraftName('')
    // Always close the form on success - a board now exists either way (the
    // very first one, or a new addition to an existing list), so there's
    // nothing left to force-create. Unconditional rather than re-deriving
    // from `boards.length`, which - captured in this closure - would still
    // read its pre-creation value here regardless of the parent's refetch.
    setCreating(false)
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      {boards.length > 0 && !creating && (
        <select
          aria-label="Active board"
          value={activeBoardId ?? ''}
          onChange={(e) => onSelect(e.target.value)}
          className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm font-semibold text-slate-800 dark:border-white/10 dark:bg-white/5 dark:text-slate-100"
        >
          {activeBoardId == null && <option value="" disabled />}
          {boards.map((b) => {
            const id = String(getId(b))
            return (
              <option key={id} value={id}>
                {b.name} ({b.items.length})
              </option>
            )
          })}
        </select>
      )}

      {creating ? (
        <form
          className="flex items-center gap-2"
          onSubmit={(e) => {
            e.preventDefault()
            submitCreate()
          }}
        >
          <input
            autoFocus
            type="text"
            aria-label="New board name"
            placeholder={boards.length === 0 ? 'Name your first board…' : 'New board name…'}
            value={draftName}
            onChange={(e) => setDraftName(e.target.value)}
            className="rounded-lg border border-fuchsia-400/60 bg-white px-3 py-1.5 text-sm text-slate-900 outline-none dark:bg-white/5 dark:text-slate-100"
          />
          <button
            type="submit"
            className="rounded-full bg-gradient-to-r from-violet-500 to-fuchsia-500 px-3 py-1.5 text-xs font-semibold text-white hover:opacity-90"
          >
            {boards.length === 0 ? 'Create board' : 'Create'}
          </button>
          {boards.length > 0 && (
            <button
              type="button"
              onClick={() => {
                setCreating(false)
                setDraftName('')
              }}
              className="text-xs text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
            >
              Cancel
            </button>
          )}
        </form>
      ) : (
        <button
          type="button"
          onClick={() => setCreating(true)}
          className="rounded-full border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-500 hover:bg-slate-100 dark:border-white/10 dark:text-slate-300 dark:hover:bg-white/10"
        >
          + New board
        </button>
      )}
    </div>
  )
}

interface BoardHeaderActionsProps {
  board: Board
  onRename: (name: string) => Promise<void> | void
  onDeleteRequest: (board: Board) => void
}

// Rename/delete for the currently active board, sitting next to
// BoardSwitcher in the header (per spec: "near the switcher") rather than
// inside it, since both apply to "the board you're looking at" rather than
// board selection. Rename is inline, no confirm - same low-stakes treatment
// as profile/category rename (see ProfileSwitcher's identical pencil-icon
// pattern). Delete only *requests* - same "switcher/header requests, caller
// builds the confirm message and deletes" split ProfileSwitcher's
// onDeleteRequest already establishes, since the item count that belongs in
// the confirm copy lives on the parent's `boards` state, not here.
function BoardHeaderActions({ board, onRename, onDeleteRequest }: BoardHeaderActionsProps) {
  const [editing, setEditing] = useState(false)
  const [draftName, setDraftName] = useState(board.name)

  function startEdit() {
    setDraftName(board.name)
    setEditing(true)
  }

  function cancelEdit() {
    setEditing(false)
    setDraftName(board.name)
  }

  async function submitRename(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const trimmed = draftName.trim()
    if (!trimmed) return
    setEditing(false)
    if (trimmed !== board.name) await onRename(trimmed)
  }

  if (editing) {
    return (
      <form className="flex items-center gap-1" onSubmit={submitRename}>
        <input
          type="text"
          aria-label="Board name"
          autoFocus
          value={draftName}
          onChange={(e) => setDraftName(e.target.value)}
          className="rounded-lg border border-fuchsia-400/60 bg-white px-2 py-1 text-sm text-slate-900 outline-none dark:bg-white/5 dark:text-slate-100"
        />
        <button
          type="submit"
          className="rounded-lg bg-gradient-to-r from-violet-500 to-fuchsia-500 px-2 py-1 text-xs font-semibold text-white hover:opacity-90"
        >
          Save
        </button>
        <button
          type="button"
          onClick={cancelEdit}
          className="rounded-lg border border-slate-200 px-2 py-1 text-xs text-slate-600 hover:bg-slate-100 dark:border-white/10 dark:text-slate-300 dark:hover:bg-white/5"
        >
          Cancel
        </button>
      </form>
    )
  }

  return (
    <div className="flex items-center gap-1">
      <button
        type="button"
        onClick={startEdit}
        aria-label={`Rename "${board.name}"`}
        className="rounded-lg px-1.5 py-1 text-xs text-slate-400 hover:bg-slate-100 hover:text-slate-600 dark:text-slate-400 dark:hover:bg-white/10 dark:hover:text-slate-200"
      >
        ✎
      </button>
      <button
        type="button"
        onClick={() => onDeleteRequest(board)}
        aria-label={`Delete "${board.name}"`}
        className="rounded-lg px-1.5 py-1 text-xs text-red-400 hover:bg-red-50 dark:hover:bg-red-500/10"
      >
        🗑
      </button>
    </div>
  )
}

interface BoardsViewProps {
  activeProfileId: string | null
  // "Active board" lives on Profile (Profile.activeBoardId), not owned by
  // this component - see the Boards spec's Data Model rationale. The parent
  // (App.tsx) resolves it from its own profiles list and hands it down,
  // same as activeProfileId itself.
  activeBoardId: string | null
  onSetActiveBoardId: (boardId: string) => Promise<void> | void
  // Called after a successful board delete so the parent can re-fetch
  // Profile.activeBoardId (DELETE /api/boards/:id falls it back server-side
  // - see routes/boards.ts - to the next board by creation order, or null).
  // This component re-reads whatever comes back through the `activeBoardId`
  // prop on the next render rather than guessing the fallback client-side.
  onBoardDeleted?: () => Promise<void> | void
  // Todos are reused from App.tsx's already-loaded list rather than
  // fetched again here - the same list the agenda view and Linked Todos'
  // search already work off of (see the spec's "search-and-add reuses the
  // in-memory todosList" decision, which this same list also sets up for).
  // Categories are reused for the same reason: TodoSummaryHeader's category
  // chip needs the category's name/color, already loaded by App.tsx.
  todos: Todo[]
  categories: Category[]
  // Persists a todo's body by id - identical to App.tsx's handleSaveNotes,
  // passed straight through so a board card is "just hosting the existing
  // editor against the existing entity", per the spec, not a new persistence
  // path. Refreshing the shared todos/categories/tags state afterwards is
  // App.tsx's responsibility (handleSaveNotes already does it), not this
  // component's.
  onSaveTodoBody: (id: string, patch: { body: JSONContent | null }) => Promise<void> | void
  // Boards themselves are lifted out of this component and owned by App.tsx
  // (hooks/useBoards) as of ticket 14 - the same state the quick-add icon
  // (TodoItem/NotesView) and the Boards tab badge also read/mutate, so
  // nothing drifts out of sync between this view and the rest of the app.
  // Every board mutation this component triggers (create/rename/delete/
  // replace-items) goes through these props rather than a local fetch.
  boards: Board[]
  boardsLoading: boolean
  boardsError: string | null
  onCreateBoard: (name: string) => Promise<Board>
  onRenameBoard: (id: string, name: string) => Promise<Board>
  onDeleteBoard: (id: string) => Promise<void>
  onReplaceBoardItems: (id: string, items: BoardItem[]) => Promise<Board>
}

interface PendingConfirm {
  message: string
  run: () => void
}

// Third header tab (see App.tsx), swapped in exactly like NotesView. Unlike
// NotesView, Notes/NoteFolders aren't already owned anywhere else in the
// app, so this component fetches its own copies (same "owns its own data"
// convention NotesView established) purely to resolve/display note board
// items - it is not the Notes feature's source of truth and never mutates
// folders. Boards themselves, by contrast, *are* owned elsewhere (App.tsx's
// hooks/useBoards, threaded down via props) - see ticket 14.
export function BoardsView({
  activeProfileId,
  activeBoardId,
  onSetActiveBoardId,
  onBoardDeleted,
  todos,
  categories,
  onSaveTodoBody,
  boards,
  boardsLoading,
  boardsError,
  onCreateBoard,
  onRenameBoard,
  onDeleteBoard,
  onReplaceBoardItems,
}: BoardsViewProps) {
  const [notes, setNotes] = useState<Note[]>([])
  const [folders, setFolders] = useState<NoteFolder[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  // Same local pendingConfirm/ConfirmDialog pair NotesView owns for its own
  // delete confirms, rather than threading App.tsx's requestConfirm down as
  // a prop - this component already owns everything a board-delete confirm
  // needs (the board's own item count).
  const [pendingConfirm, setPendingConfirm] = useState<PendingConfirm | null>(null)

  function requestConfirm(message: string, run: () => void) {
    setPendingConfirm({ message, run })
  }

  const dragSensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )

  async function loadNotes(profileId: string) {
    try {
      const res = await fetch(`${API_URL}/api/notes?profileId=${encodeURIComponent(profileId)}`)
      if (!res.ok) return
      setNotes(await res.json())
    } catch {
      // Notes are only needed to render note-card headers/bodies; a failed
      // fetch just leaves note cards unresolved (rendered as ghost cards)
      // rather than blocking the rest of the board.
    }
  }

  async function loadFolders(profileId: string) {
    try {
      const res = await fetch(`${API_URL}/api/note-folders?profileId=${encodeURIComponent(profileId)}`)
      if (!res.ok) return
      setFolders(await res.json())
    } catch {
      // Folder path falls back to "Root" for an unresolved id - see
      // utils/notesTree's folderPath.
    }
  }

  // Re-scopes to the newly active profile's notes/folders on every profile
  // switch, mirroring App.tsx's and NotesView's identical profile-keyed
  // effect. Boards themselves re-scope via App.tsx's own hooks/useBoards
  // effect (keyed on the same activeProfileId), not here.
  useEffect(() => {
    if (!activeProfileId) return
    setLoading(true)
    Promise.all([loadNotes(activeProfileId), loadFolders(activeProfileId)]).finally(() => setLoading(false))
  }, [activeProfileId])

  async function handleCreateBoard(name: string) {
    try {
      const created = await onCreateBoard(name)
      // A freshly created board has nothing else that could be "active" -
      // for the zero-boards case there's no other candidate at all, and for
      // the general "+ New board" case landing on an unchanged, possibly
      // unrelated board would make the create action look like a no-op.
      await onSetActiveBoardId(String(getId(created)))
    } catch {
      // onCreateBoard already recorded the failure in boardsError.
    }
  }

  const activeBoard = boards.find((b) => String(getId(b)) === activeBoardId) ?? null

  async function handleRemoveItem(item: BoardItem) {
    if (!activeBoard) return
    const id = String(getId(activeBoard))
    const nextItems = activeBoard.items.filter((existing) => itemKey(existing) !== itemKey(item))
    try {
      await onReplaceBoardItems(id, nextItems)
    } catch {
      // onReplaceBoardItems already rolled back its optimistic update and
      // recorded the failure in boardsError.
    }
  }

  // Persists a drag-drop reorder immediately (no separate save step) via
  // App.tsx's shared onReplaceBoardItems, which itself is optimistic with
  // rollback on failure (see hooks/useBoards) - same spirit as TodoDetail's
  // onReorderLinkedTodos.
  async function handleDragEnd(event: DragEndEvent) {
    if (!activeBoard) return
    const { active, over } = event
    if (!over || active.id === over.id) return
    const id = String(getId(activeBoard))
    const oldIndex = activeBoard.items.findIndex((item) => itemKey(item) === active.id)
    const newIndex = activeBoard.items.findIndex((item) => itemKey(item) === over.id)
    if (oldIndex === -1 || newIndex === -1) return

    const nextItems = arrayMove(activeBoard.items, oldIndex, newIndex)
    try {
      await onReplaceBoardItems(id, nextItems)
    } catch {
      // onReplaceBoardItems already rolled back its optimistic update and
      // recorded the failure in boardsError.
    }
  }

  // Rename is inline with no confirm (see BoardHeaderActions) - saves via
  // the same whole-board PATCH endpoint as everything else here.
  async function handleRenameBoard(name: string) {
    if (!activeBoard) return
    try {
      await onRenameBoard(String(getId(activeBoard)), name)
    } catch {
      // onRenameBoard already recorded the failure in boardsError.
    }
  }

  async function handleDeleteBoard(id: string) {
    try {
      await onDeleteBoard(id)
      // The backend may have fallen Profile.activeBoardId back to another
      // board (or null) if this was the active one - see routes/boards.ts.
      // Re-fetching profiles is what makes the `activeBoardId` prop reflect
      // that, rather than this component guessing the fallback itself.
      await onBoardDeleted?.()
    } catch {
      // onDeleteBoard already recorded the failure in boardsError.
    }
  }

  // Copy inverts the app's usual cascade-delete pattern (other
  // delete-confirms list what *will* be destroyed) since deleting a board
  // destroys nothing downstream - see the Boards spec's Board delete
  // section. N is a single combined todo+note count across the board's
  // items.
  function requestDeleteBoard(board: Board) {
    const id = String(getId(board))
    requestConfirm(
      `Delete "${board.name}"? Its ${board.items.length} item(s) will not be deleted — only this board and its references to them.`,
      () => handleDeleteBoard(id),
    )
  }

  async function handleSaveNoteBody(id: string, body: JSONContent | null) {
    setError(null)
    try {
      const res = await fetch(`${API_URL}/api/notes/${id}?profileId=${encodeURIComponent(activeProfileId ?? '')}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ body }),
      })
      if (!res.ok) throw new Error(await parseErrorMessage(res))
      const updated: Note = await res.json()
      setNotes((prev) => prev.map((n) => (String(getId(n)) === id ? updated : n)))
    } catch (err) {
      setError((err as Error).message)
    }
  }

  async function handleSaveTodoBody(id: string, body: JSONContent | null) {
    await onSaveTodoBody(id, { body })
  }

  const categoriesById: Record<string, Category> = Object.fromEntries(
    categories.map((c) => [String(getId(c)), c]),
  )
  const todosById: Record<string, Todo> = Object.fromEntries(todos.map((t) => [String(getId(t)), t]))
  const notesById: Record<string, Note> = Object.fromEntries(notes.map((n) => [String(getId(n)), n]))

  // Merges this component's own notes/folders-fetch error with the boards
  // hook's error (App.tsx's hooks/useBoards) - both surface in the same spot
  // since both are equally "something in this view failed".
  const combinedError = error ?? boardsError

  return (
    <section aria-label="Boards" className="flex flex-col gap-4">
      {combinedError && (
        <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-300">
          Error: {combinedError}
        </p>
      )}

      {loading || boardsLoading ? (
        <p className="text-sm text-slate-500 dark:text-slate-400">Loading boards...</p>
      ) : (
        // BoardSwitcher is always rendered at this same position, whether
        // boards.length is 0 or not - it owns its own create-form open/
        // closed state (forced open for the zero-boards case), and keeping
        // it at a stable position/sibling-index across that transition
        // means React reconciles it in place rather than unmounting and
        // remounting it, which would otherwise discard that in-flight state
        // right as a create finishes (see submitCreate's own comment).
        <>
          {boards.length === 0 && (
            <div className="rounded-2xl border border-dashed border-slate-300 p-6 text-center dark:border-white/10">
              <p className="text-sm text-slate-500 dark:text-slate-400">
                Boards pull together todos and notes for something you're working on. Create your first one to get
                started.
              </p>
            </div>
          )}

          <div className="flex flex-wrap items-center gap-2">
            <BoardSwitcher
              boards={boards}
              activeBoardId={activeBoardId}
              onSelect={onSetActiveBoardId}
              onCreate={handleCreateBoard}
            />
            {activeBoard && (
              <BoardHeaderActions
                board={activeBoard}
                onRename={handleRenameBoard}
                onDeleteRequest={requestDeleteBoard}
              />
            )}
          </div>

          {boards.length > 0 && (
            <>
              {!activeBoard && (
                <p className="text-sm text-slate-500 dark:text-slate-400">Select a board to view its items.</p>
              )}

              {activeBoard && activeBoard.items.length === 0 && (
                <p className="rounded-xl border border-dashed border-slate-300 p-6 text-center text-sm text-slate-400 dark:border-white/10 dark:text-slate-500">
                  Nothing on this board yet. Use the add icon on any todo or note to add one here.
                </p>
              )}

              {activeBoard && activeBoard.items.length > 0 && (
                <DndContext sensors={dragSensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
                  {/* rectSortingStrategy, not TodoDetail's verticalListSortingStrategy - this
                      is a true multi-column grid (1/2/3 columns, responsive), and the rect
                      strategy accounts for reflow across rows the way a single-column
                      vertical-list strategy doesn't. */}
                  <SortableContext items={activeBoard.items.map(itemKey)} strategy={rectSortingStrategy}>
                    <div className="grid grid-cols-1 items-start gap-3 sm:grid-cols-2 lg:grid-cols-3">
                      {activeBoard.items.map((item) => {
                        const todo = item.itemType === 'Todo' ? todosById[item.itemId] : undefined
                        const note = item.itemType === 'Note' ? notesById[item.itemId] : undefined
                        const label = todo ? todo.title : (note?.name ?? 'this item')
                        return (
                          <SortableBoardCard key={itemKey(item)} itemKey={itemKey(item)} label={label}>
                            {(dragHandle) => (
                              <BoardItemCard
                                todo={todo}
                                note={note}
                                folders={folders}
                                categoriesById={categoriesById}
                                onRemove={() => handleRemoveItem(item)}
                                onSaveTodoBody={handleSaveTodoBody}
                                onSaveNoteBody={handleSaveNoteBody}
                                dragHandle={dragHandle}
                              />
                            )}
                          </SortableBoardCard>
                        )
                      })}
                    </div>
                  </SortableContext>
                </DndContext>
              )}
            </>
          )}
        </>
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
    </section>
  )
}
