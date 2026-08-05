import { describe, expect, it } from 'vitest'
import type { Note, NoteFolder } from '../types'
import {
  childFolders,
  childNotes,
  combinedChildren,
  descendantFolderIds,
  folderDestroyCounts,
  folderName,
  folderPath,
} from './notesTree'

const recipes: NoteFolder = { _id: 'f-recipes', name: 'Recipes', parentId: null }
const work: NoteFolder = { _id: 'f-work', name: 'Work', parentId: null }
const workIdeas: NoteFolder = { _id: 'f-work-ideas', name: 'Ideas', parentId: 'f-work' }

const folders: NoteFolder[] = [recipes, work, workIdeas]

const passwords: Note = { _id: 'n-passwords', name: 'Passwords', folderId: null, body: null }
const pasta: Note = { _id: 'n-pasta', name: 'Weeknight pasta', folderId: 'f-recipes', body: null }
const sourdough: Note = { _id: 'n-sourdough', name: 'Sourdough', folderId: 'f-recipes', body: null }
const standup: Note = { _id: 'n-standup', name: 'Standup notes', folderId: 'f-work', body: null }

const notes: Note[] = [passwords, pasta, sourdough, standup]

describe('childFolders', () => {
  it('returns only the direct children of the given parent, sorted alphabetically', () => {
    expect(childFolders(folders, null)).toEqual([recipes, work])
    expect(childFolders(folders, 'f-work')).toEqual([workIdeas])
  })

  it('returns an empty array for a folder with no child folders', () => {
    expect(childFolders(folders, 'f-recipes')).toEqual([])
  })
})

describe('childNotes', () => {
  it('returns only the direct children of the given folder, sorted alphabetically', () => {
    expect(childNotes(notes, 'f-recipes')).toEqual([sourdough, pasta])
    expect(childNotes(notes, null)).toEqual([passwords])
  })

  it('returns an empty array for a folder with no notes', () => {
    expect(childNotes(notes, 'f-work-ideas')).toEqual([])
  })
})

describe('combinedChildren', () => {
  it('lists folders before notes at that level, each group alphabetical on its own', () => {
    // Root level has Passwords (note), Recipes (folder), Work (folder) —
    // folders first (Recipes, Work), then notes (Passwords), not a single
    // alphabetical pass across both kinds.
    expect(combinedChildren(folders, notes, null)).toEqual([
      { kind: 'folder', item: recipes },
      { kind: 'folder', item: work },
      { kind: 'note', item: passwords },
    ])
  })

  it('lists a folder before its sibling notes at a nested level', () => {
    // Under Work: Ideas (folder) sorts before Standup notes (note).
    expect(combinedChildren(folders, notes, 'f-work')).toEqual([
      { kind: 'folder', item: workIdeas },
      { kind: 'note', item: standup },
    ])
  })

  it('returns an empty array for a leaf folder with nothing in it', () => {
    expect(combinedChildren(folders, notes, 'f-work-ideas')).toEqual([])
  })
})

describe('descendantFolderIds', () => {
  it('collects every folder nested (at any depth) under the given folder, not including itself', () => {
    expect(descendantFolderIds(folders, 'f-work')).toEqual(['f-work-ideas'])
  })

  it('returns an empty array for a folder with no descendants', () => {
    expect(descendantFolderIds(folders, 'f-recipes')).toEqual([])
  })
})

describe('folderDestroyCounts', () => {
  it('counts descendant folders (not including itself) and every note inside the folder or a descendant', () => {
    // Work has one descendant folder (Ideas) and one note directly inside it
    // (Standup notes) - Ideas itself has no notes.
    expect(folderDestroyCounts(folders, notes, 'f-work')).toEqual({ folderCount: 1, noteCount: 1 })
  })

  it('counts a leaf folder with only direct notes and no sub-folders', () => {
    expect(folderDestroyCounts(folders, notes, 'f-recipes')).toEqual({ folderCount: 0, noteCount: 2 })
  })

  it('returns zero counts for an empty leaf folder', () => {
    expect(folderDestroyCounts(folders, notes, 'f-work-ideas')).toEqual({ folderCount: 0, noteCount: 0 })
  })
})

describe('folderName', () => {
  it('returns "Root" for a null folder id', () => {
    expect(folderName(folders, null)).toBe('Root')
  })

  it("returns the folder's own name for a known id", () => {
    expect(folderName(folders, 'f-work-ideas')).toBe('Ideas')
  })

  it('falls back to "Root" for an id that matches no known folder', () => {
    expect(folderName(folders, 'does-not-exist')).toBe('Root')
  })
})

describe('folderPath', () => {
  it('returns "Root" for a null folder id', () => {
    expect(folderPath(folders, null)).toBe('Root')
  })

  it('returns just the folder name for a root-level folder', () => {
    expect(folderPath(folders, 'f-recipes')).toBe('Recipes')
  })

  it('joins the full ancestor chain with " / " for a nested folder', () => {
    expect(folderPath(folders, 'f-work-ideas')).toBe('Work / Ideas')
  })

  it('falls back to "Root" for an id that matches no known folder', () => {
    expect(folderPath(folders, 'does-not-exist')).toBe('Root')
  })
})
