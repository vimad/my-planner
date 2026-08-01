// Pure tree-assembly helpers for the Notes view (see
// .scratch/notes-section/spec.md) - turn the flat folder+note arrays the
// backend returns (GET /api/note-folders, GET /api/notes; the client
// assembles the tree, not the server) into the nested, alphabetically-sorted
// structure the tree pane renders. Mirrors the shape validated in the
// prototype's mockNotesData.ts (branch `prototype/notes-view-variants`),
// rewritten against the real Note/NoteFolder types instead of the
// prototype's in-memory mock ones.
import type { Note, NoteFolder } from '../types'
import { getId } from './getId'

export type TreeEntry = { kind: 'folder'; item: NoteFolder } | { kind: 'note'; item: Note }

// Direct child folders of `parentId` (null = root-level), sorted
// alphabetically by name.
export function childFolders(folders: NoteFolder[], parentId: string | null): NoteFolder[] {
  return folders
    .filter((folder) => (folder.parentId ?? null) === parentId)
    .sort((a, b) => a.name.localeCompare(b.name))
}

// Direct child notes of `folderId` (null = root-level), sorted
// alphabetically by name.
export function childNotes(notes: Note[], folderId: string | null): Note[] {
  return notes
    .filter((note) => (note.folderId ?? null) === folderId)
    .sort((a, b) => a.name.localeCompare(b.name))
}

// Folders and notes mixed together in one alphabetically-sorted listing, for
// the direct children of `parentId` - the unit the tree pane's recursive
// TreeRow renders one level of at a time. No manual reordering, per spec:
// sort order is always derived, never stored.
export function combinedChildren(folders: NoteFolder[], notes: Note[], parentId: string | null): TreeEntry[] {
  const folderEntries: TreeEntry[] = childFolders(folders, parentId).map((item) => ({ kind: 'folder', item }))
  const noteEntries: TreeEntry[] = childNotes(notes, parentId).map((item) => ({ kind: 'note', item }))
  return [...folderEntries, ...noteEntries].sort((a, b) => a.item.name.localeCompare(b.item.name))
}

// All folders nested (recursively) under `folderId`, not including itself -
// used by ticket 06's cascade-delete count and move-picker exclusion.
export function descendantFolderIds(folders: NoteFolder[], folderId: string): string[] {
  const direct = folders.filter((folder) => (folder.parentId ?? null) === folderId).map((folder) => String(getId(folder)))
  return direct.flatMap((id) => [id, ...descendantFolderIds(folders, id)])
}

// Counts what a folder's cascade delete would destroy - used by ticket 06's
// delete-confirm prompt, since DELETE /api/note-folders/:id cascades
// server-side but doesn't report a count back. `folderCount` is descendant
// folders only (not including `folderId` itself - the confirm message names
// the folder being deleted separately); `noteCount` covers every note
// directly inside the folder or any of those descendants.
export function folderDestroyCounts(
  folders: NoteFolder[],
  notes: Note[],
  folderId: string,
): { folderCount: number; noteCount: number } {
  const descendants = descendantFolderIds(folders, folderId)
  const allIds = new Set([folderId, ...descendants])
  const noteCount = notes.filter((note) => note.folderId != null && allIds.has(note.folderId)).length
  return { folderCount: descendants.length, noteCount }
}

// Resolves a folder id to its display name for the "active folder" label
// (the empty-state placeholder, and future move-target breadcrumbs) - null
// or an id that no longer matches any known folder both fall back to "Root".
export function folderName(folders: NoteFolder[], folderId: string | null): string {
  if (folderId === null) return 'Root'
  return folders.find((folder) => String(getId(folder)) === folderId)?.name ?? 'Root'
}

// Full ancestor-chain path for a folder, walking `parentId` up to the root
// and joining with " / " (e.g. "Work / Ideas") - the "client assembles the
// hierarchy" convention this module already follows for the tree pane,
// extended to a note card's header (Boards feature - see
// .scratch/boards/spec.md's note-card header decision). Root-level (null)
// resolves to "Root", same as folderName above; an id that no longer matches
// any known folder (dangling reference) also falls back to "Root" rather
// than throwing, since a broken chain shouldn't crash the card it labels.
// Guards against a cyclical parentId chain (shouldn't happen, but a bad
// manual DB edit could produce one) by capping the walk at the number of
// folders that exist.
export function folderPath(folders: NoteFolder[], folderId: string | null): string {
  if (folderId === null) return 'Root'
  const chain: string[] = []
  let currentId: string | null = folderId
  const seen = new Set<string>()
  while (currentId !== null && !seen.has(currentId) && chain.length <= folders.length) {
    const folder = folders.find((f) => String(getId(f)) === currentId)
    if (!folder) break
    seen.add(currentId)
    chain.unshift(folder.name)
    currentId = folder.parentId ?? null
  }
  return chain.length > 0 ? chain.join(' / ') : 'Root'
}
