import type { JSONContent } from '@tiptap/core'
import { ChevronRight, ChevronsDownUp, ChevronsUpDown, File, Folder, FolderOpen, MoreHorizontal, Pin } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { boardItemKey } from '../utils/boardItemKey'
import { getId } from '../utils/getId'
import {
  combinedChildren,
  descendantFolderIds,
  entryKey,
  folderDestroyCounts,
  folderName,
  type TreeEntry,
} from '../utils/notesTree'
import type { BoardQuickAddState, Note, NoteFolder } from '../types'
import { ConfirmDialog } from './ConfirmDialog'
import { ExpandableNotesEditor } from './ExpandableNotesEditor'
import { MoveToFolderPicker } from './MoveToFolderPicker'
import type { RichTextEditorHandle } from './RichTextEditor'

const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:4100'

async function parseErrorMessage(res: Response): Promise<string> {
  try {
    const data = await res.json()
    return data?.error ?? `Request failed with status ${res.status}`
  } catch {
    return `Request failed with status ${res.status}`
  }
}

const TREE_ROW_CLASSES =
  'text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-white/5'
const TREE_ROW_ACTIVE_CLASSES = 'bg-fuchsia-100 text-fuchsia-800 dark:bg-fuchsia-500/20 dark:text-fuchsia-200'
const TREE_ROW_DROP_TARGET_CLASSES = 'ring-2 ring-inset ring-fuchsia-400 dark:ring-fuchsia-400/70'
const ROW_BASE_CLASSES = 'group mb-0.5 flex cursor-grab items-center gap-1.5 rounded-md py-1 pr-1.5 text-sm active:cursor-grabbing'
// Sentinel dragOverTarget value for the Root row, distinct from any real
// folder id (which are never this string) and from `null` (nothing hovered).
const ROOT_DROP_TARGET = '__root__'
// A row's expand-chevron (folders) is 19px wide; note rows have no chevron
// of their own but use this spacer so a note's icon still lines up under
// its sibling folders' icons rather than under their chevrons.
const ROW_CHEVRON_SPACER_CLASSES = 'inline-block w-[19px] shrink-0'

interface TreeRowProps {
  folders: NoteFolder[]
  notes: Note[]
  entry: TreeEntry
  activeFolderId: string | null
  selectedNoteId: string | null
  onSelectFolder: (id: string) => void
  onSelectNote: (note: Note) => void
  onRequestMove: (entry: TreeEntry) => void
  onRequestDeleteNote: (note: Note) => void
  onRequestDeleteFolder: (folder: NoteFolder) => void
  onRenameFolder: (id: string, name: string) => void
  // Quick-add icon insertion point (ticket 14) - note rows only, per spec
  // (folders don't get one). Optional so tests can render the tree without
  // wiring up Boards state at all.
  boardQuickAdd?: BoardQuickAddState
  // Folder open/collapse state is lifted to NotesView (rather than each
  // row's own useState) so the header's Collapse all/Expand all buttons can
  // control every folder at once; a folder is open unless its id is in this
  // set.
  collapsedFolderIds: Set<string>
  onToggleFolder: (folderId: string) => void
  // Drag-and-drop move: every row is a drag source, and every folder row is
  // also a drop target. `draggedEntry` is lifted to NotesView (rather than
  // kept per-row) since a drop target needs to know what's being dragged to
  // decide whether it can accept it; `dragOverTarget` is the folder id (or
  // ROOT_DROP_TARGET) currently under the pointer, used purely for the
  // highlight ring.
  draggedEntry: TreeEntry | null
  dragOverTarget: string | null
  canDropOn: (entry: TreeEntry, targetFolderId: string | null) => boolean
  onDragStartEntry: (entry: TreeEntry) => void
  onDragEndEntry: () => void
  onDragOverTarget: (targetFolderId: string | null) => void
  onDropOnFolder: (targetFolderId: string | null) => void
}

interface RowMenuProps {
  canRename: boolean
  onRename?: () => void
  onMove: () => void
  onDelete: () => void
}

// Rename/Move/Delete collapsed behind one kebab per row instead of two or
// three always-reserved buttons - opens a small popover, closes on an
// outside click. Kept at opacity-0/group-hover:opacity-100 (not
// hidden/group-hover:flex like the old always-reserved buttons) so it never
// pops in/out of the flex layout on hover - nothing after it ever shifts.
function RowMenu({ canRename, onRename, onMove, onDelete }: RowMenuProps) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    function onDocClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDocClick)
    return () => document.removeEventListener('mousedown', onDocClick)
  }, [open])

  return (
    <div ref={ref} className="relative shrink-0 opacity-0 group-hover:opacity-100 focus-within:opacity-100">
      <button
        type="button"
        aria-label="More actions"
        onClick={(e) => {
          e.stopPropagation()
          setOpen((v) => !v)
        }}
        className="rounded p-0.5 text-slate-400 hover:bg-slate-200 hover:text-slate-600 dark:hover:bg-white/10 dark:hover:text-slate-200"
      >
        <MoreHorizontal size={14} />
      </button>
      {open && (
        <div className="absolute right-0 top-6 z-10 min-w-[7rem] overflow-hidden rounded-lg border border-slate-200 bg-white py-1 text-xs shadow-lg dark:border-white/10 dark:bg-[#1a1229]">
          {canRename && onRename && (
            <button
              type="button"
              onClick={() => {
                setOpen(false)
                onRename()
              }}
              className="block w-full px-3 py-1.5 text-left text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-white/10"
            >
              Rename
            </button>
          )}
          <button
            type="button"
            onClick={() => {
              setOpen(false)
              onMove()
            }}
            className="block w-full px-3 py-1.5 text-left text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-white/10"
          >
            Move
          </button>
          <button
            type="button"
            onClick={() => {
              setOpen(false)
              onDelete()
            }}
            className="block w-full px-3 py-1.5 text-left text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-500/10"
          >
            Delete
          </button>
        </div>
      )}
    </div>
  )
}

// One row of the unified folder+note tree, recursing into a folder's own
// combinedChildren for its subtree. A folder's children render inside a
// bordered, indented wrapper (see the `border-l` div below) so the
// connecting line - not just accumulated padding - is what shows a note or
// subfolder belongs to that folder. A folder's own expand/collapse bit lives
// in NotesView's collapsedFolderIds (see onToggleFolder) rather than local
// state, so the header's Collapse all/Expand all buttons can reach every
// folder at once. Folder rename is still local state (an inline text input
// swapped in for the name button); the actual PATCH call is owned by the
// parent via `onRenameFolder`.
function TreeRow({
  folders,
  notes,
  entry,
  activeFolderId,
  selectedNoteId,
  onSelectFolder,
  onSelectNote,
  onRequestMove,
  onRequestDeleteNote,
  onRequestDeleteFolder,
  onRenameFolder,
  boardQuickAdd,
  draggedEntry,
  dragOverTarget,
  canDropOn,
  onDragStartEntry,
  onDragEndEntry,
  onDragOverTarget,
  onDropOnFolder,
  collapsedFolderIds,
  onToggleFolder,
}: TreeRowProps) {
  const [renaming, setRenaming] = useState(false)
  const [renameValue, setRenameValue] = useState('')
  const isDragging = draggedEntry !== null && entryKey(draggedEntry) === entryKey(entry)

  if (entry.kind === 'note') {
    const note = entry.item
    const id = String(getId(note))
    const active = selectedNoteId === id
    const pinned = boardQuickAdd?.activeItemKeys.has(boardItemKey('Note', id)) ?? false
    return (
      <div
        draggable
        onDragStart={(e) => {
          e.dataTransfer.effectAllowed = 'move'
          onDragStartEntry(entry)
        }}
        onDragEnd={onDragEndEntry}
        className={`${ROW_BASE_CLASSES} ${active ? TREE_ROW_ACTIVE_CLASSES : TREE_ROW_CLASSES} ${
          isDragging ? 'opacity-40' : ''
        }`}
      >
        <span className={ROW_CHEVRON_SPACER_CLASSES} aria-hidden="true" />
        <File size={14} className="shrink-0 text-slate-400 dark:text-slate-500" />
        <button type="button" onClick={() => onSelectNote(note)} className="flex-1 truncate py-0.5 text-left">
          {note.name}
        </button>
        {boardQuickAdd && (
          <button
            type="button"
            aria-label={`${pinned ? 'Remove' : 'Add'} "${note.name}" ${pinned ? 'from' : 'to'} the active board`}
            aria-pressed={pinned}
            onClick={(e) => {
              e.stopPropagation()
              if (pinned) boardQuickAdd.onRemove('Note', id)
              else boardQuickAdd.onAdd('Note', id, note.name, e.currentTarget)
            }}
            className={`shrink-0 rounded p-0.5 transition ${
              pinned
                ? 'text-fuchsia-500 opacity-100 dark:text-fuchsia-400'
                : 'text-slate-400 opacity-0 hover:bg-slate-200 group-hover:opacity-100 dark:hover:bg-white/10'
            }`}
          >
            <Pin size={12} fill={pinned ? 'currentColor' : 'none'} />
          </button>
        )}
        <RowMenu canRename={false} onMove={() => onRequestMove(entry)} onDelete={() => onRequestDeleteNote(note)} />
      </div>
    )
  }

  const folder = entry.item
  const folderId = String(getId(folder))
  const kids = combinedChildren(folders, notes, folderId)
  const active = activeFolderId === folderId && !selectedNoteId
  const canAcceptDrop = draggedEntry !== null && canDropOn(draggedEntry, folderId)
  const isDropTarget = canAcceptDrop && dragOverTarget === folderId
  const open = !collapsedFolderIds.has(folderId)

  function startRename() {
    setRenameValue(folder.name)
    setRenaming(true)
  }

  function commitRename() {
    setRenaming(false)
    const trimmed = renameValue.trim()
    if (trimmed && trimmed !== folder.name) onRenameFolder(folderId, trimmed)
  }

  return (
    <div>
      <div
        draggable={!renaming}
        onDragStart={(e) => {
          e.dataTransfer.effectAllowed = 'move'
          onDragStartEntry(entry)
        }}
        onDragEnd={onDragEndEntry}
        onDragOver={(e) => {
          if (!canAcceptDrop) return
          e.preventDefault()
          onDragOverTarget(folderId)
        }}
        onDrop={(e) => {
          if (!canAcceptDrop) return
          e.preventDefault()
          onDropOnFolder(folderId)
        }}
        className={`${ROW_BASE_CLASSES} ${active ? TREE_ROW_ACTIVE_CLASSES : TREE_ROW_CLASSES} ${
          isDragging ? 'opacity-40' : ''
        } ${isDropTarget ? TREE_ROW_DROP_TARGET_CLASSES : ''}`}
      >
        {kids.length > 0 ? (
          <button
            type="button"
            aria-label={open ? `Collapse ${folder.name}` : `Expand ${folder.name}`}
            onClick={() => onToggleFolder(folderId)}
            className="shrink-0 rounded p-0.5 text-slate-400 hover:bg-slate-200 dark:hover:bg-white/10"
          >
            <ChevronRight size={13} className={`transition-transform ${open ? 'rotate-90' : ''}`} />
          </button>
        ) : (
          <span className={ROW_CHEVRON_SPACER_CLASSES} aria-hidden="true" />
        )}
        {open ? (
          <FolderOpen size={14} className="shrink-0 text-amber-500 dark:text-amber-400" />
        ) : (
          <Folder size={14} className="shrink-0 text-amber-500 dark:text-amber-400" />
        )}
        {renaming ? (
          <input
            type="text"
            autoFocus
            value={renameValue}
            aria-label={`Rename "${folder.name}"`}
            onChange={(e) => setRenameValue(e.target.value)}
            onBlur={commitRename}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault()
                commitRename()
              } else if (e.key === 'Escape') {
                setRenaming(false)
              }
            }}
            className="flex-1 rounded border border-fuchsia-300 bg-white px-1.5 py-0.5 text-sm text-slate-900 focus:outline-none dark:border-fuchsia-400/40 dark:bg-white/10 dark:text-slate-100"
          />
        ) : (
          <button type="button" onClick={() => onSelectFolder(folderId)} className="flex-1 truncate py-0.5 text-left font-medium">
            {folder.name}
          </button>
        )}
        {!renaming && (
          <RowMenu
            canRename
            onRename={startRename}
            onMove={() => onRequestMove(entry)}
            onDelete={() => onRequestDeleteFolder(folder)}
          />
        )}
      </div>
      {open && kids.length > 0 && (
        <div className="ml-[16px] border-l border-slate-200 pl-2 dark:border-white/10">
          {kids.map((kid) => (
            <TreeRow
              key={String(getId(kid.item))}
              folders={folders}
              notes={notes}
              entry={kid}
              activeFolderId={activeFolderId}
              selectedNoteId={selectedNoteId}
              onSelectFolder={onSelectFolder}
              onSelectNote={onSelectNote}
              onRequestMove={onRequestMove}
              onRequestDeleteNote={onRequestDeleteNote}
              onRequestDeleteFolder={onRequestDeleteFolder}
              onRenameFolder={onRenameFolder}
              boardQuickAdd={boardQuickAdd}
              draggedEntry={draggedEntry}
              dragOverTarget={dragOverTarget}
              canDropOn={canDropOn}
              onDragStartEntry={onDragStartEntry}
              onDragEndEntry={onDragEndEntry}
              onDragOverTarget={onDragOverTarget}
              onDropOnFolder={onDropOnFolder}
              collapsedFolderIds={collapsedFolderIds}
              onToggleFolder={onToggleFolder}
            />
          ))}
        </div>
      )}
    </div>
  )
}

interface NoteEditorPaneProps {
  note: Note
  onSave: (id: string, patch: { name?: string; body?: JSONContent | null }) => Promise<void>
}

// Fills the whole right pane once a note is selected: an editable name field
// plus the reused ExpandableNotesEditor (toolbar, enlarge-to-modal,
// dirty-tracking all included as-is - see the module doc on NotesView
// below). Keyed by note id from the parent, so switching notes remounts this
// (and the editor inside it) fresh rather than needing manual state resets.
function NoteEditorPane({ note, onSave }: NoteEditorPaneProps) {
  const [name, setName] = useState(note.name)
  const [bodyDirty, setBodyDirty] = useState(false)
  const [saving, setSaving] = useState(false)
  const editorRef = useRef<RichTextEditorHandle>(null)

  const nameDirty = name !== note.name
  const dirty = nameDirty || bodyDirty

  async function handleSave() {
    const id = String(getId(note))
    const patch: { name?: string; body?: JSONContent | null } = {}
    if (nameDirty) patch.name = name
    if (bodyDirty) patch.body = editorRef.current?.getJSON() ?? note.body ?? null
    setSaving(true)
    try {
      await onSave(id, patch)
      editorRef.current?.markSaved()
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="flex h-full flex-col">
      <div className="mb-2 flex shrink-0 items-center gap-2">
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          aria-label="Note name"
          className="w-full flex-1 rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 text-lg font-semibold text-slate-900 focus:border-fuchsia-400/60 focus:outline-none dark:border-white/10 dark:bg-white/5 dark:text-slate-100"
        />
        {dirty && (
          <button
            type="button"
            disabled={saving}
            onClick={handleSave}
            className="shrink-0 rounded-lg bg-gradient-to-r from-violet-500 to-fuchsia-500 px-3 py-1.5 text-sm font-semibold text-white hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {saving ? 'Saving...' : 'Save'}
          </button>
        )}
      </div>
      <div className="min-h-0 flex-1">
        <ExpandableNotesEditor
          ref={editorRef}
          content={note.body}
          savedContent={note.body}
          editable
          toolbar
          onDirtyChange={setBodyDirty}
          className="flex h-full flex-col overflow-hidden rounded-lg border border-slate-200 p-2 dark:border-white/10"
          contentClassName="min-h-0 flex-1 overflow-y-auto"
        />
      </div>
    </div>
  )
}

interface NotesViewProps {
  activeProfileId: string | null
  // Quick-add icon insertion point (ticket 14) - threaded straight through
  // to every note row's TreeRow. Optional so existing tests can render this
  // view without wiring up Boards state at all.
  boardQuickAdd?: BoardQuickAddState
  // Bumped by App.tsx after the bottom capture bar creates a Note in the
  // Temp folder (Scratchpad's captureMode="note") - this component owns its
  // folders/notes fetch independently of App.tsx's state, so it has no other
  // way to learn a new Note/folder landed. Only triggers a plain refetch
  // (see the effect below), not the full profile-switch reset, since the
  // user is still looking at whatever they had open.
  refreshSignal?: number
}

interface PendingConfirm {
  message: string
  run: () => void
}

// Swapped into the Categories+Agenda slot when the header's Todos/Notes tab
// is on Notes (see App.tsx). Fetches its own folder/note lists (independent
// of App's categories/todos state, since Notes is otherwise unrelated to
// Todos) and re-fetches whenever the active profile changes - mirroring
// App.tsx's own load/refresh naming convention (loadX/refreshX) even though
// this component owns its data rather than App.tsx owning it.
//
// Two-pane split: the left pane is a single unified folder+note tree (see
// utils/notesTree.ts for the alphabetical-mix assembly); the right pane is
// dedicated entirely to whichever note is selected (or an empty-state
// placeholder naming the currently "active" folder). Clicking a folder only
// changes which folder is "active" for the +Folder/+Note buttons - it does
// not affect the right pane.
//
// Ticket 06 adds move/rename/delete. Move and delete both need their own
// small "are you sure" gate - rather than threading App.tsx's
// requestConfirm down as a prop, this component owns an identical
// pendingConfirm/ConfirmDialog pair itself (NotesView already owns all the
// state a confirm here would need - the folders/notes arrays for computing a
// folder's cascade-delete count - so lifting it up would just be an extra
// hop for no benefit).
export function NotesView({ activeProfileId, boardQuickAdd, refreshSignal }: NotesViewProps) {
  const [folders, setFolders] = useState<NoteFolder[]>([])
  const [notes, setNotes] = useState<Note[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  // The last-clicked folder, or the folder containing the last-opened note;
  // root (null) until something's been clicked, per spec.
  const [activeFolderId, setActiveFolderId] = useState<string | null>(null)
  const [selectedNoteId, setSelectedNoteId] = useState<string | null>(null)
  const [pendingConfirm, setPendingConfirm] = useState<PendingConfirm | null>(null)
  const [movingEntry, setMovingEntry] = useState<TreeEntry | null>(null)
  // Drag-and-drop move (an alternative to the Move picker below): the entry
  // currently being dragged, and which drop target (a folder id, or
  // ROOT_DROP_TARGET for the Root row) the pointer is currently over, purely
  // for the highlight ring - the actual move only happens on drop.
  const [draggedEntry, setDraggedEntry] = useState<TreeEntry | null>(null)
  const [dragOverTarget, setDragOverTarget] = useState<string | null>(null)
  // Which folders are collapsed, by id - lifted out of each TreeRow's own
  // state (a folder is open unless its id is here) so the header's Collapse
  // all/Expand all buttons can reach every folder in one shot.
  const [collapsedFolderIds, setCollapsedFolderIds] = useState<Set<string>>(new Set())

  function toggleFolder(id: string) {
    setCollapsedFolderIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function collapseAll() {
    setCollapsedFolderIds(new Set(folders.map((folder) => String(getId(folder)))))
  }

  function expandAll() {
    setCollapsedFolderIds(new Set())
  }

  function requestConfirm(message: string, run: () => void) {
    setPendingConfirm({ message, run })
  }

  async function loadFolders(profileId: string) {
    setError(null)
    try {
      const res = await fetch(`${API_URL}/api/note-folders?profileId=${encodeURIComponent(profileId)}`)
      if (!res.ok) throw new Error(await parseErrorMessage(res))
      setFolders(await res.json())
    } catch (err) {
      setError((err as Error).message)
    }
  }

  async function loadNotes(profileId: string) {
    setError(null)
    try {
      const res = await fetch(`${API_URL}/api/notes?profileId=${encodeURIComponent(profileId)}`)
      if (!res.ok) throw new Error(await parseErrorMessage(res))
      setNotes(await res.json())
    } catch (err) {
      setError((err as Error).message)
    }
  }

  function refreshFolders() {
    return activeProfileId ? loadFolders(activeProfileId) : Promise.resolve()
  }

  function refreshNotes() {
    return activeProfileId ? loadNotes(activeProfileId) : Promise.resolve()
  }

  // Loads (and re-loads on every profile switch) both lists together, same
  // as App.tsx's own profile-keyed effect for categories/todos/etc. A folder
  // or note id selected in one profile has no meaning in another, so both
  // are reset alongside the refetch.
  useEffect(() => {
    if (!activeProfileId) return
    setLoading(true)
    Promise.all([loadFolders(activeProfileId), loadNotes(activeProfileId)]).finally(() => setLoading(false))
    setActiveFolderId(null)
    setSelectedNoteId(null)
    setCollapsedFolderIds(new Set())
    // loadFolders/loadNotes are stable enough (no external deps beyond the
    // profileId already in this effect's own dependency array) that omitting
    // them here mirrors App.tsx's identical choice for loadCategories/
    // loadTodos/etc.
  }, [activeProfileId])

  // Refetch on every bump of refreshSignal, skipping the initial mount (the
  // effect above already covers that) - deliberately not resetting
  // activeFolderId/selectedNoteId/collapsedFolderIds like the profile-switch
  // effect does, since a Temp note landing from the capture bar shouldn't
  // yank the user away from whatever they were already looking at.
  const isFirstRefreshSignal = useRef(true)
  useEffect(() => {
    if (isFirstRefreshSignal.current) {
      isFirstRefreshSignal.current = false
      return
    }
    if (!activeProfileId) return
    loadFolders(activeProfileId)
    loadNotes(activeProfileId)
    // loadFolders/loadNotes are stable enough to omit, same rationale as the
    // profile-switch effect above.
  }, [refreshSignal])

  async function handleCreateFolder() {
    if (!activeProfileId) return
    setError(null)
    try {
      const res = await fetch(`${API_URL}/api/note-folders`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'New Folder', parentId: activeFolderId, profileId: activeProfileId }),
      })
      if (!res.ok) throw new Error(await parseErrorMessage(res))
      await refreshFolders()
    } catch (err) {
      setError((err as Error).message)
    }
  }

  // The new note is selected immediately (from the POST response, which
  // already carries its id) so the editor pane opens on it right away,
  // letting the user rename it from the (empty, "Untitled Note") default
  // straight away - then the full list is refreshed for consistency with
  // every other mutation in this component.
  async function handleCreateNote() {
    if (!activeProfileId) return
    setError(null)
    try {
      const res = await fetch(`${API_URL}/api/notes`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'Untitled Note', folderId: activeFolderId, profileId: activeProfileId }),
      })
      if (!res.ok) throw new Error(await parseErrorMessage(res))
      const created: Note = await res.json()
      setSelectedNoteId(String(getId(created)))
      await refreshNotes()
    } catch (err) {
      setError((err as Error).message)
    }
  }

  async function handleSaveNote(id: string, patch: { name?: string; body?: JSONContent | null }) {
    setError(null)
    try {
      const res = await fetch(`${API_URL}/api/notes/${id}?profileId=${encodeURIComponent(activeProfileId ?? '')}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(patch),
      })
      if (!res.ok) throw new Error(await parseErrorMessage(res))
      const updated: Note = await res.json()
      setNotes((prev) => prev.map((n) => (String(getId(n)) === id ? updated : n)))
    } catch (err) {
      setError((err as Error).message)
    }
  }

  function selectFolder(id: string | null) {
    setActiveFolderId(id)
    setSelectedNoteId(null)
  }

  function selectNote(note: Note) {
    setSelectedNoteId(String(getId(note)))
    setActiveFolderId(note.folderId ?? null)
  }

  // Deleting a single note: same lightweight requestConfirm treatment every
  // other delete in this app uses (todos, categories, scratch notes).
  function requestDeleteNote(note: Note) {
    const id = String(getId(note))
    requestConfirm(`Delete "${note.name}"? This cannot be undone.`, async () => {
      setError(null)
      try {
        const res = await fetch(
          `${API_URL}/api/notes/${id}?profileId=${encodeURIComponent(activeProfileId ?? '')}`,
          { method: 'DELETE' },
        )
        if (!res.ok) throw new Error(await parseErrorMessage(res))
        // If this note was open in the editor pane, reset to the
        // empty-state placeholder rather than pointing at a deleted note.
        if (selectedNoteId === id) setSelectedNoteId(null)
        await refreshNotes()
      } catch (err) {
        setError((err as Error).message)
      }
    })
  }

  // Deleting a folder cascades server-side (DELETE /api/note-folders/:id
  // deletes every descendant folder and every note inside this folder or
  // any descendant) but doesn't report a count back, so the confirm
  // message's counts are computed here from the already-fetched flat
  // folders/notes arrays via folderDestroyCounts.
  function requestDeleteFolder(folder: NoteFolder) {
    const folderId = String(getId(folder))
    const { folderCount, noteCount } = folderDestroyCounts(folders, notes, folderId)
    const destroyedFolderIds = new Set([folderId, ...descendantFolderIds(folders, folderId)])
    const noteWord = noteCount === 1 ? 'note' : 'notes'
    const folderWord = folderCount === 1 ? 'folder' : 'folders'
    requestConfirm(
      `Delete "${folder.name}" and everything in it — ${noteCount} ${noteWord}, ${folderCount} ${folderWord}?`,
      async () => {
        setError(null)
        try {
          const res = await fetch(
            `${API_URL}/api/note-folders/${folderId}?profileId=${encodeURIComponent(activeProfileId ?? '')}`,
            { method: 'DELETE' },
          )
          if (!res.ok) throw new Error(await parseErrorMessage(res))
          // If the open note lived in this folder (or any descendant), or
          // the active folder itself got destroyed, reset both back to
          // Root rather than pointing at ids that no longer exist.
          const openNote = notes.find((n) => String(getId(n)) === selectedNoteId)
          if (openNote && openNote.folderId != null && destroyedFolderIds.has(openNote.folderId)) {
            setSelectedNoteId(null)
          }
          if (activeFolderId != null && destroyedFolderIds.has(activeFolderId)) {
            setActiveFolderId(null)
          }
          await Promise.all([refreshFolders(), refreshNotes()])
        } catch (err) {
          setError((err as Error).message)
        }
      },
    )
  }

  // Move picker: opened for either a note or a folder row, and closed
  // (without a request) on Cancel. The actual PATCH depends on which kind
  // of item is being moved - a note's `folderId` vs. a folder's `parentId`.
  function requestMove(entry: TreeEntry) {
    setMovingEntry(entry)
  }

  // Shared by both move paths: the Move picker's confirm button, and
  // dropping a dragged row onto a folder/Root. A note's `folderId` vs. a
  // folder's `parentId` is the only thing that differs between the two
  // kinds of entry.
  async function performMove(entry: TreeEntry, targetFolderId: string | null) {
    setError(null)
    try {
      if (entry.kind === 'note') {
        const id = String(getId(entry.item))
        const res = await fetch(
          `${API_URL}/api/notes/${id}?profileId=${encodeURIComponent(activeProfileId ?? '')}`,
          {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ folderId: targetFolderId }),
          },
        )
        if (!res.ok) throw new Error(await parseErrorMessage(res))
        await refreshNotes()
      } else {
        const id = String(getId(entry.item))
        const res = await fetch(
          `${API_URL}/api/note-folders/${id}?profileId=${encodeURIComponent(activeProfileId ?? '')}`,
          {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ parentId: targetFolderId }),
          },
        )
        if (!res.ok) throw new Error(await parseErrorMessage(res))
        await refreshFolders()
      }
    } catch (err) {
      setError((err as Error).message)
    }
  }

  async function handleMoveConfirm(targetFolderId: string | null) {
    const entry = movingEntry
    setMovingEntry(null)
    if (!entry) return
    await performMove(entry, targetFolderId)
  }

  // Whether `entry` may be dropped onto `targetFolderId` (null = Root): a
  // note just can't be dropped back onto the folder it's already in (a
  // no-op); a folder additionally can't be dropped onto itself or any of its
  // own descendants (would create a cycle), mirroring moveExcludeFolderIds
  // below for the picker.
  function canDropOn(entry: TreeEntry, targetFolderId: string | null): boolean {
    if (entry.kind === 'note') {
      return (entry.item.folderId ?? null) !== targetFolderId
    }
    const folderId = String(getId(entry.item))
    if (targetFolderId === folderId) return false
    if (targetFolderId !== null && descendantFolderIds(folders, folderId).includes(targetFolderId)) return false
    return (entry.item.parentId ?? null) !== targetFolderId
  }

  function handleDragStartEntry(entry: TreeEntry) {
    setDraggedEntry(entry)
  }

  function handleDragEndEntry() {
    setDraggedEntry(null)
    setDragOverTarget(null)
  }

  function handleDragOverTarget(targetFolderId: string | null) {
    setDragOverTarget(targetFolderId ?? ROOT_DROP_TARGET)
  }

  function handleDropOnFolder(targetFolderId: string | null) {
    const entry = draggedEntry
    setDraggedEntry(null)
    setDragOverTarget(null)
    if (!entry || !canDropOn(entry, targetFolderId)) return
    void performMove(entry, targetFolderId)
  }

  // Folder inline rename, mirroring the note editor pane's name field:
  // TreeRow owns the in-place text input and only calls this once the value
  // actually changed (on blur/Enter).
  async function handleRenameFolder(id: string, name: string) {
    setError(null)
    try {
      const res = await fetch(
        `${API_URL}/api/note-folders/${id}?profileId=${encodeURIComponent(activeProfileId ?? '')}`,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name }),
        },
      )
      if (!res.ok) throw new Error(await parseErrorMessage(res))
      await refreshFolders()
    } catch (err) {
      setError((err as Error).message)
    }
  }

  const rootItems = combinedChildren(folders, notes, null)
  const selectedNote = notes.find((n) => String(getId(n)) === selectedNoteId) ?? null
  const activeFolderLabel = folderName(folders, activeFolderId)
  // A folder can't be moved into itself or any of its own descendants - a
  // note being moved has no such restriction (excludeFolderIds stays empty).
  const moveExcludeFolderIds =
    movingEntry?.kind === 'folder'
      ? [String(getId(movingEntry.item)), ...descendantFolderIds(folders, String(getId(movingEntry.item)))]
      : []
  const rootCanAcceptDrop = draggedEntry !== null && canDropOn(draggedEntry, null)
  const rootIsDropTarget = rootCanAcceptDrop && dragOverTarget === ROOT_DROP_TARGET

  return (
    <section aria-label="Notes" className="flex flex-col gap-4 sm:flex-row">
      <div className="flex w-72 shrink-0 flex-col rounded-2xl border border-slate-200 bg-white p-3 shadow-sm dark:border-white/10 dark:bg-white/5 dark:shadow-none dark:backdrop-blur-md">
        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
            Folders &amp; notes
          </h2>
          <div className="flex shrink-0 gap-0.5">
            <button
              type="button"
              onClick={collapseAll}
              aria-label="Collapse all folders"
              title="Collapse all"
              className="rounded p-0.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-white/10 dark:hover:text-slate-200"
            >
              <ChevronsDownUp size={13} />
            </button>
            <button
              type="button"
              onClick={expandAll}
              aria-label="Expand all folders"
              title="Expand all"
              className="rounded p-0.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-white/10 dark:hover:text-slate-200"
            >
              <ChevronsUpDown size={13} />
            </button>
          </div>
        </div>

        {error && (
          <p className="mb-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-300">
            Error: {error}
          </p>
        )}

        {loading ? (
          <p className="text-sm text-slate-500 dark:text-slate-400">Loading notes...</p>
        ) : (
          <div className="flex-1 overflow-y-auto">
            <div
              onDragOver={(e) => {
                if (!rootCanAcceptDrop) return
                e.preventDefault()
                handleDragOverTarget(null)
              }}
              onDrop={(e) => {
                if (!rootCanAcceptDrop) return
                e.preventDefault()
                handleDropOnFolder(null)
              }}
              className={`mb-1 flex items-center justify-between rounded-md ${
                rootIsDropTarget ? TREE_ROW_DROP_TARGET_CLASSES : ''
              }`}
            >
              <button
                type="button"
                onClick={() => selectFolder(null)}
                className={`flex-1 rounded-md px-1.5 py-1 text-left text-sm font-medium ${
                  activeFolderId === null && !selectedNoteId ? TREE_ROW_ACTIVE_CLASSES : TREE_ROW_CLASSES
                }`}
              >
                Root
              </button>
              <div className="flex shrink-0 gap-1 pl-1">
                <button
                  type="button"
                  onClick={handleCreateFolder}
                  aria-label="New folder"
                  className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-white/10 dark:hover:text-slate-200"
                >
                  <Folder size={14} />
                </button>
                <button
                  type="button"
                  onClick={handleCreateNote}
                  aria-label="New note"
                  className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-white/10 dark:hover:text-slate-200"
                >
                  <File size={14} />
                </button>
              </div>
            </div>
            {rootItems.map((entry) => (
              <TreeRow
                key={String(getId(entry.item))}
                folders={folders}
                notes={notes}
                entry={entry}
                activeFolderId={activeFolderId}
                selectedNoteId={selectedNoteId}
                onSelectFolder={selectFolder}
                onSelectNote={selectNote}
                onRequestMove={requestMove}
                onRequestDeleteNote={requestDeleteNote}
                onRequestDeleteFolder={requestDeleteFolder}
                onRenameFolder={handleRenameFolder}
                boardQuickAdd={boardQuickAdd}
                draggedEntry={draggedEntry}
                dragOverTarget={dragOverTarget}
                canDropOn={canDropOn}
                onDragStartEntry={handleDragStartEntry}
                onDragEndEntry={handleDragEndEntry}
                onDragOverTarget={handleDragOverTarget}
                onDropOnFolder={handleDropOnFolder}
                collapsedFolderIds={collapsedFolderIds}
                onToggleFolder={toggleFolder}
              />
            ))}
          </div>
        )}
      </div>

      <div className="flex min-h-[60vh] flex-1 flex-col rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-white/10 dark:bg-white/5 dark:shadow-none dark:backdrop-blur-md">
        {selectedNote ? (
          <NoteEditorPane key={selectedNoteId} note={selectedNote} onSave={handleSaveNote} />
        ) : (
          <div className="flex flex-1 items-center justify-center text-center text-sm text-slate-400 dark:text-slate-500">
            {`Select a note to edit it here, or create one in "${activeFolderLabel}".`}
          </div>
        )}
      </div>

      {movingEntry && (
        <MoveToFolderPicker
          folders={folders}
          itemName={movingEntry.item.name}
          excludeFolderIds={moveExcludeFolderIds}
          onMove={handleMoveConfirm}
          onCancel={() => setMovingEntry(null)}
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
    </section>
  )
}
