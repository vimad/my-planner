import { useState } from 'react'
import { childFolders } from '../utils/notesTree'
import { getId } from '../utils/getId'
import type { NoteFolder } from '../types'

const OPTION_CLASSES = 'block w-full py-2 pr-3 text-left text-sm'
const OPTION_SELECTED_CLASSES = 'bg-fuchsia-100 dark:bg-fuchsia-500/20'
const OPTION_IDLE_CLASSES = 'hover:bg-slate-50 dark:hover:bg-white/5'

interface FolderOptionsProps {
  folders: NoteFolder[]
  parentId: string | null
  depth: number
  excludeFolderIds: string[]
  selected: string | null
  onSelect: (id: string) => void
}

// Recurses through `childFolders` (already alphabetical) the same way
// NotesView's own tree does, so the picker's nesting order matches what the
// user sees in the tree pane - just folders, no notes, and with
// `excludeFolderIds` (the folder being moved plus its own descendants, for a
// folder move) pruning entire subtrees rather than just hiding a row, since a
// folder can't be moved under itself either directly or transitively.
function FolderOptions({ folders, parentId, depth, excludeFolderIds, selected, onSelect }: FolderOptionsProps) {
  const kids = childFolders(folders, parentId).filter((folder) => !excludeFolderIds.includes(String(getId(folder))))

  return (
    <>
      {kids.map((folder) => {
        const id = String(getId(folder))
        return (
          <div key={id}>
            <button
              type="button"
              onClick={() => onSelect(id)}
              style={{ paddingLeft: `${12 + depth * 16}px` }}
              className={`${OPTION_CLASSES} ${selected === id ? OPTION_SELECTED_CLASSES : OPTION_IDLE_CLASSES}`}
            >
              {folder.name}
            </button>
            <FolderOptions
              folders={folders}
              parentId={id}
              depth={depth + 1}
              excludeFolderIds={excludeFolderIds}
              selected={selected}
              onSelect={onSelect}
            />
          </div>
        )
      })}
    </>
  )
}

interface MoveToFolderPickerProps {
  folders: NoteFolder[]
  itemName: string
  excludeFolderIds?: string[]
  onMove: (folderId: string | null) => void
  onCancel: () => void
}

// Modal "move to folder" picker shared by both notes and folders (ticket 06)
// - rewritten against the real Note/NoteFolder types and real PATCH-backed
// move semantics from the throwaway prototype validated on branch
// prototype/notes-view-variants (prototype-views/notes/MoveToFolderPicker.tsx),
// which used fake in-memory mutation functions. Picking "(root - no
// folder)" moves the item to root (`folderId`/`parentId: null`); picking a
// folder calls `onMove` with its id. The caller owns the actual PATCH call
// and decides which field (`folderId` for a note, `parentId` for a folder)
// the returned id gets written to.
export function MoveToFolderPicker({
  folders,
  itemName,
  excludeFolderIds = [],
  onMove,
  onCancel,
}: MoveToFolderPickerProps) {
  const [selected, setSelected] = useState<string | null>(null)

  return (
    <div
      className="fixed inset-0 z-[80] flex items-center justify-center bg-black/60 p-4"
      role="dialog"
      aria-modal="true"
      aria-label={`Move "${itemName}"`}
    >
      <div className="w-full max-w-sm rounded-2xl border border-slate-200 bg-white p-4 shadow-xl dark:border-white/10 dark:bg-[#160f24]">
        <h3 className="mb-3 text-sm font-semibold text-slate-900 dark:text-slate-100">
          {`Move "${itemName}" to folder`}
        </h3>
        <div className="mb-4 max-h-60 overflow-y-auto rounded-lg border border-slate-200 dark:border-white/10">
          <button
            type="button"
            onClick={() => setSelected(null)}
            className={`${OPTION_CLASSES} px-3 ${selected === null ? OPTION_SELECTED_CLASSES : OPTION_IDLE_CLASSES}`}
          >
            (root — no folder)
          </button>
          <FolderOptions
            folders={folders}
            parentId={null}
            depth={0}
            excludeFolderIds={excludeFolderIds}
            selected={selected}
            onSelect={setSelected}
          />
        </div>
        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs text-slate-600 dark:border-white/10 dark:text-slate-300"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => onMove(selected)}
            className="rounded-lg bg-gradient-to-r from-violet-500 to-fuchsia-500 px-3 py-1.5 text-xs font-semibold text-white"
          >
            Move here
          </button>
        </div>
      </div>
    </div>
  )
}
