# Notes — folder-hierarchy notes, separate from Todos and Scratchpad

Status: ready-for-agent

Source: synthesized from the "Notes feature spec" wayfinder map (`.scratch/notes-section/map.md` — three resolved tickets: [scope & data model fundamentals](issues/01-scope-data-model-fundamentals.md), [view layout & editor UX](issues/02-notes-view-layout-prototype.md), [folder/note name uniqueness](issues/03-folder-note-name-uniqueness.md)), plus defaults filled in while compiling this document for the small remaining details that didn't need their own decision session (backend API surface, folder rename, note-delete confirm, empty-state copy).

## Problem Statement

This app has Todos (task-shaped: priority, due dates, recurrence, completion) and Scratchpad (quick-capture notes meant to be triaged and promoted into todos or discarded). Neither fits "write something down and keep it, organized, indefinitely" — a recipe, a running journal, reference material. Notes is a new, third concept: durable, named, rich-text documents organized into a folder hierarchy, with no completion state and no promotion lifecycle. It coexists with Todos and Scratchpad rather than replacing either.

## Data Model

Two new Mongoose entities, `packages/backend/src/models/NoteFolder.ts` and `packages/backend/src/models/Note.ts`, following the existing `Category`/`Todo`/`ScratchNote` pattern (plain schema, `{ timestamps: true }`, profile-scoped).

```ts
interface NoteFolderDoc {
  name: string
  parentId: Types.ObjectId | null // null = root-level folder
  profileId: Types.ObjectId // ref Profile, required
  createdAt: Date
  updatedAt: Date
}

interface NoteDoc {
  name: string
  folderId: Types.ObjectId | null // null = root-level note
  body: JSONContent // Tiptap doc, same shape ScratchNote/Todo notes already store
  profileId: Types.ObjectId // ref Profile, required
  createdAt: Date
  updatedAt: Date
}
```

Deliberately minimal — no priority, tags, due dates, recurrence, category link, or completion field on either entity (Notes is not Todos). No uniqueness constraint on `name` among siblings, for either entity — matches the existing app-wide convention that nothing (Category, Todo, ScratchNote) enforces name uniqueness at the schema or route level.

Folders nest without limit via `parentId` (self-referencing). A note may live at the root (`folderId: null`) — it is not forced into a catch-all folder.

## API surface

Mirrors `packages/backend/src/routes/categories.ts`: `profileId` is required as a query param (`requireProfileId` from `utils/profileScope.ts`) on every read and id-addressed mutation, checked against the document's own `profileId` (404 on mismatch, not 403/403, so a cross-profile id reveals nothing).

**`packages/backend/src/routes/noteFolders.ts`**
- `POST /api/note-folders` — body `{ name, parentId, profileId }`. Creates a folder.
- `GET /api/note-folders?profileId=` — lists all of a profile's folders (flat; the client assembles the tree from `parentId`, same as it already would for any adjacency-list structure — no server-side tree-shaping needed for a "small notes section").
- `PATCH /api/note-folders/:id?profileId=` — body `{ name? , parentId? }`. Renames and/or moves (reparents) a folder. `parentId` accepts `null` to move to root.
- `DELETE /api/note-folders/:id?profileId=` — cascades: recursively deletes every descendant folder and every note inside this folder or any descendant, mirroring the cascade pattern in `profiles.ts`'s `DELETE /api/profiles/:id` (`deleteMany` on the collected ids, then delete the folder itself).

**`packages/backend/src/routes/notes.ts`**
- `POST /api/notes` — body `{ name, folderId, profileId }`. Creates a note with an empty body.
- `GET /api/notes?profileId=` — lists all of a profile's notes (flat, same reasoning as folders above).
- `PATCH /api/notes/:id?profileId=` — body `{ name?, folderId?, body? }`. Renames, moves, and/or saves editor content in one endpoint (matches `ScratchNote`'s pattern of a single PATCH for both metadata and content changes).
- `DELETE /api/notes/:id?profileId=` — deletes a single note.

## UI/UX

**Placement.** The header gains a persistent "Todos / Notes" segmented tab, next to the profile switcher and theme toggle. Switching tabs swaps only the main content area (the Categories + Agenda sections) for the Notes view — the rest of the page's chrome (header, the fixed-bottom Scratchpad bar) is unaffected by which tab is active.

**Layout — a two-pane split**, entered via the "Notes" tab:
- **Left pane — a single unified tree.** Folders and notes are mixed together in one recursive tree, sorted alphabetically at every level (no manual reordering). Folders are expandable/collapsible; notes are leaf rows. A "Root" row represents root-level items. `+ Folder` / `+ Note` buttons in the pane header create within whichever folder is currently "active" (the last-clicked folder, or the folder containing the last-opened note; root if nothing's been clicked yet).
- **Right pane — dedicated entirely to the editor.** Clicking a folder in the tree only changes which folder is "active" (for the `+ Folder`/`+ Note` buttons) — the right pane shows an empty-state placeholder (see below). Clicking a note fills the *entire* right pane, top to bottom, with an editable name field and the existing `RichTextEditor`/`ExpandableNotesEditor` (toolbar, enlarge-to-modal affordance, dirty-tracking — reused as-is, no new editor).

**Empty states.**
- Right pane, nothing selected: `Select a note to edit it here, or create one in "<active folder name>".` (already prototyped copy — carried through as the real copy, not a placeholder-for-a-placeholder).
- A folder with no children (in the tree): renders with no expand arrow and no children, same as any other leaf-less folder — no special "this folder is empty" messaging needed, since the tree already visually shows nothing under it.
- Notes has no data yet at all (brand new profile): the tree pane shows just the "Root" row with nothing under it; the right pane shows the same "Select a note..." placeholder pointed at Root. No dedicated first-run illustration/copy — consistent with how this app treats other empty states (e.g. the agenda's plain "Nothing on your agenda" text).

**Folder rename.** Not covered by the layout prototype (which only wired note rename via the editor pane's name field). Give folders the same affordance categories already have: a small inline "Rename" hover action on the folder's tree row (alongside the existing Move/Delete) that turns the row's label into a text input in place, matching `CategoryForm`'s rename-in-place spirit rather than opening a separate modal.

**Delete confirmation.** Folder delete already has a decided confirm (cascade, with an explicit count of what's destroyed — see [scope & data model fundamentals](issues/01-scope-data-model-fundamentals.md)). Single-note delete gets the same lightweight `requestConfirm` treatment every other delete in this app uses (todos, categories, scratch notes) — e.g. `Delete "<note name>"? This cannot be undone.` — for consistency, even though nothing about Notes specifically forced this; it would be the one delete in the app with no confirmation otherwise.

**Move.** Both folders and notes move via the same simple "move to folder" picker (a modal listing the folder tree, pick a destination, confirm) — no drag-and-drop. A folder being moved cannot be moved into itself or any of its own descendants (the picker excludes them).

## Out of scope

(Carried from the map, unchanged.) Converting/promoting a Note into a Todo. Multi-user collaboration/sharing. Version history/revision tracking on notes. Search over Notes (via the existing todo search box or a new one).

## Primary sources

- Layout/UX prototype (all three compared variants — tab-toggle split pane, full-page breadcrumb takeover, full-screen Miller-columns overlay): branch `prototype/notes-view-variants`.
