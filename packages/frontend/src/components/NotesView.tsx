import type { JSONContent } from '@tiptap/core'
import { useEffect, useRef, useState } from 'react'
import { getId } from '../utils/getId'
import {
  combinedChildren,
  descendantFolderIds,
  folderDestroyCounts,
  folderName,
  type TreeEntry,
} from '../utils/notesTree'
import type { Note, NoteFolder } from '../types'
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

const CREATE_BUTTON_CLASSES =
  'rounded border border-dashed border-slate-300 px-1.5 py-0.5 text-xs text-slate-500 hover:bg-slate-100 dark:border-white/20 dark:text-slate-300 dark:hover:bg-white/10'

const TREE_ROW_CLASSES =
  'text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-white/5'
const TREE_ROW_ACTIVE_CLASSES = 'bg-fuchsia-100 text-fuchsia-800 dark:bg-fuchsia-500/20 dark:text-fuchsia-200'

const ROW_ACTION_CLASSES =
  'rounded border border-slate-200 px-1.5 py-0.5 text-[11px] text-slate-500 hover:bg-slate-100 dark:border-white/10 dark:text-slate-300 dark:hover:bg-white/10'
// Hidden until the row is hovered (`group`/`group-hover` below) - jsdom
// doesn't simulate real `:hover`, so these stay in the DOM (just visually
// hidden in a real browser) and are perfectly clickable in tests.
const ROW_ACTIONS_CONTAINER_CLASSES = 'ml-1 hidden shrink-0 gap-1 group-hover:flex'

interface TreeRowProps {
  folders: NoteFolder[]
  notes: Note[]
  entry: TreeEntry
  depth: number
  activeFolderId: string | null
  selectedNoteId: string | null
  onSelectFolder: (id: string) => void
  onSelectNote: (note: Note) => void
  onRequestMove: (entry: TreeEntry) => void
  onRequestDeleteNote: (note: Note) => void
  onRequestDeleteFolder: (folder: NoteFolder) => void
  onRenameFolder: (id: string, name: string) => void
}

// One row of the unified folder+note tree, recursing into a folder's own
// combinedChildren for its subtree. Folders track their own expand/collapse
// state locally (uncontrolled, defaulting open) - there's no need to lift it
// higher since nothing outside a row ever needs to know whether it's open.
// Ticket 06 adds hover-reveal Move/Delete (and, on folders, Rename) actions -
// folder rename is also local state (an inline text input swapped in for the
// name button), mirroring how `open` is already row-local; the actual PATCH
// call is owned by the parent via `onRenameFolder`.
function TreeRow({
  folders,
  notes,
  entry,
  depth,
  activeFolderId,
  selectedNoteId,
  onSelectFolder,
  onSelectNote,
  onRequestMove,
  onRequestDeleteNote,
  onRequestDeleteFolder,
  onRenameFolder,
}: TreeRowProps) {
  const [open, setOpen] = useState(true)
  const [renaming, setRenaming] = useState(false)
  const [renameValue, setRenameValue] = useState('')

  if (entry.kind === 'note') {
    const note = entry.item
    const id = String(getId(note))
    const active = selectedNoteId === id
    return (
      <div
        style={{ paddingLeft: `${depth * 14 + 20}px` }}
        className={`group mb-0.5 flex items-center rounded-lg pr-2 text-sm ${active ? TREE_ROW_ACTIVE_CLASSES : TREE_ROW_CLASSES}`}
      >
        <button type="button" onClick={() => onSelectNote(note)} className="flex-1 py-1.5 text-left">
          {note.name}
        </button>
        <div className={ROW_ACTIONS_CONTAINER_CLASSES}>
          <button
            type="button"
            aria-label={`Move "${note.name}"`}
            onClick={() => onRequestMove(entry)}
            className={ROW_ACTION_CLASSES}
          >
            Move
          </button>
          <button
            type="button"
            aria-label={`Delete "${note.name}"`}
            onClick={() => onRequestDeleteNote(note)}
            className={ROW_ACTION_CLASSES}
          >
            Delete
          </button>
        </div>
      </div>
    )
  }

  const folder = entry.item
  const folderId = String(getId(folder))
  const kids = combinedChildren(folders, notes, folderId)
  const active = activeFolderId === folderId && !selectedNoteId

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
        style={{ paddingLeft: `${depth * 14}px` }}
        className={`group mb-0.5 flex items-center rounded-lg pr-2 text-sm ${active ? TREE_ROW_ACTIVE_CLASSES : TREE_ROW_CLASSES}`}
      >
        {kids.length > 0 ? (
          <button
            type="button"
            aria-label={open ? `Collapse ${folder.name}` : `Expand ${folder.name}`}
            onClick={() => setOpen((v) => !v)}
            className="w-5 shrink-0 text-xs text-slate-400"
          >
            {open ? '▾' : '▸'}
          </button>
        ) : (
          <span className="inline-block w-5 shrink-0" aria-hidden="true" />
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
            className="flex-1 rounded border border-fuchsia-300 bg-white px-1.5 py-1 text-sm text-slate-900 focus:outline-none dark:border-fuchsia-400/40 dark:bg-white/10 dark:text-slate-100"
          />
        ) : (
          <>
            <button type="button" onClick={() => onSelectFolder(folderId)} className="flex-1 py-1.5 text-left">
              {folder.name}
            </button>
            <div className={ROW_ACTIONS_CONTAINER_CLASSES}>
              <button type="button" aria-label={`Rename "${folder.name}"`} onClick={startRename} className={ROW_ACTION_CLASSES}>
                Rename
              </button>
              <button
                type="button"
                aria-label={`Move "${folder.name}"`}
                onClick={() => onRequestMove(entry)}
                className={ROW_ACTION_CLASSES}
              >
                Move
              </button>
              <button
                type="button"
                aria-label={`Delete "${folder.name}"`}
                onClick={() => onRequestDeleteFolder(folder)}
                className={ROW_ACTION_CLASSES}
              >
                Delete
              </button>
            </div>
          </>
        )}
      </div>
      {open &&
        kids.map((kid) => (
          <TreeRow
            key={String(getId(kid.item))}
            folders={folders}
            notes={notes}
            entry={kid}
            depth={depth + 1}
            activeFolderId={activeFolderId}
            selectedNoteId={selectedNoteId}
            onSelectFolder={onSelectFolder}
            onSelectNote={onSelectNote}
            onRequestMove={onRequestMove}
            onRequestDeleteNote={onRequestDeleteNote}
            onRequestDeleteFolder={onRequestDeleteFolder}
            onRenameFolder={onRenameFolder}
          />
        ))}
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
          contentClassName="min-h-0 flex-1 overflow-y-auto [&_.tiptap]:min-h-full [&_.tiptap]:outline-none [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:list-decimal [&_ol]:pl-5 [&_u]:underline [&_s]:line-through"
        />
      </div>
    </div>
  )
}

interface NotesViewProps {
  activeProfileId: string | null
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
export function NotesView({ activeProfileId }: NotesViewProps) {
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
    // loadFolders/loadNotes are stable enough (no external deps beyond the
    // profileId already in this effect's own dependency array) that omitting
    // them here mirrors App.tsx's identical choice for loadCategories/
    // loadTodos/etc.
  }, [activeProfileId])

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

  async function handleMoveConfirm(targetFolderId: string | null) {
    const entry = movingEntry
    setMovingEntry(null)
    if (!entry) return
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

  return (
    <section aria-label="Notes" className="flex flex-col gap-4 sm:flex-row">
      <div className="flex w-72 shrink-0 flex-col rounded-2xl border border-slate-200 bg-white p-3 shadow-sm dark:border-white/10 dark:bg-white/5 dark:shadow-none dark:backdrop-blur-md">
        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
            Folders &amp; notes
          </h2>
          <div className="flex gap-1">
            <button type="button" onClick={handleCreateFolder} className={CREATE_BUTTON_CLASSES}>
              + Folder
            </button>
            <button type="button" onClick={handleCreateNote} className={CREATE_BUTTON_CLASSES}>
              + Note
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
            <button
              type="button"
              onClick={() => selectFolder(null)}
              className={`mb-1 block w-full rounded-lg px-2 py-1.5 text-left text-sm ${
                activeFolderId === null && !selectedNoteId ? TREE_ROW_ACTIVE_CLASSES : TREE_ROW_CLASSES
              }`}
            >
              Root
            </button>
            {rootItems.map((entry) => (
              <TreeRow
                key={String(getId(entry.item))}
                folders={folders}
                notes={notes}
                entry={entry}
                depth={0}
                activeFolderId={activeFolderId}
                selectedNoteId={selectedNoteId}
                onSelectFolder={selectFolder}
                onSelectNote={selectNote}
                onRequestMove={requestMove}
                onRequestDeleteNote={requestDeleteNote}
                onRequestDeleteFolder={requestDeleteFolder}
                onRenameFolder={handleRenameFolder}
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
