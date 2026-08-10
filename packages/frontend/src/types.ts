// Shared frontend-side data shapes. These describe the plain JSON the
// backend's HTTP API actually sends/accepts (GET/POST/PATCH
// /api/todos, /api/categories, /api/scratch-notes) — they are a different
// type domain than the backend's Mongoose documents (packages/backend/src/
// models/*.ts's TodoDoc/CategoryDoc/ScratchNoteDoc) and must not import
// those across the package boundary. Every field an ObjectId would occupy
// on the backend (categoryId, linkedTodoIds, promotedTodoId, _id itself) is
// a plain string here, since that's what JSON.stringify/JSON.parse produces
// over the wire.
//
// Introduced in Issue 07 (previously each component that needed a sliver of
// one of these shapes declared its own minimal local interface, e.g.
// CategoryChip.tsx's `CategoryChipCategory`, MiniCalendar.tsx's
// `MiniCalendarTodo`, dateAgenda.ts's `DueDateFields`). Those per-file
// interfaces are left as-is (still structurally compatible with the types
// below — a `Todo`/`Category` value here satisfies all of them), but any
// new component should prefer importing from here. Issue 08 (App.jsx) is
// expected to adopt these as its own state types.
//
// Only `title` is required on `Todo` (and `name`/`color` on `Category`) —
// deliberately loose on everything else, because a single `Todo` value is
// used for both a fully-hydrated todo straight from the API (every field
// present) and an in-memory draft for the "new todo" popup (just
// `{ title }`, no `_id` yet — see TodoDetail's `isNew`/`canLink`).

import type { JSONContent } from '@tiptap/core'

export type TodoPriority = 'High' | 'Medium' | 'Low'

export interface TodoRecurrence {
  pattern: 'daily' | 'weekly' | 'monthly'
}

export interface Todo {
  _id?: string
  id?: string
  title: string
  categoryId?: string
  completed?: boolean
  // Local calendar-day string ("YYYY-MM-DD"), never a Date/timestamp — see
  // utils/dateAgenda.ts's header comment.
  dueDate?: string | null
  priority?: TodoPriority
  tags?: string[]
  officeLinked?: boolean
  body?: JSONContent | null
  recurrence?: TodoRecurrence | null
  // Flat, one-directional, no-cascade grouping of other todos' ids — see
  // the backend TodoDoc comment. A dangling id (its todo since deleted) is
  // left in place; callers resolving against a `Todo[]` are responsible for
  // tolerating a lookup miss.
  linkedTodoIds?: string[]
  createdAt?: string
  updatedAt?: string
}

// GET /api/categories augments the stored doc (name/color/system) with
// server-computed remaining/completed counts — see CategoryChip.tsx's
// near-identical `CategoryChipCategory`, which this is a superset of.
export interface Category {
  _id?: string
  id?: string
  name: string
  color: string
  system?: boolean
  remaining?: number
  completed?: number
}

// One line within a ScratchNote's body — see the backend ScratchNote model
// comment for why lines are independent Tiptap documents rather than one
// shared document with custom node ids.
export interface ScratchLine {
  id: string
  content: JSONContent | null
  promotedTodoId?: string | null
}

export interface ScratchNote {
  _id?: string
  id?: string
  body: ScratchLine[]
  archived?: boolean
  createdAt?: string
  updatedAt?: string
}

// The coarse grouping layer above Category — see .scratch/profiles/spec.md.
// `color` is optional (an open styling assumption per the spec); this ticket
// (02) doesn't render it anywhere yet. `activeBoardId` is null (never
// undefined once a Profile round-trips through the API) for a profile with
// no active board — see .scratch/boards/spec.md's Data Model section.
export interface Profile {
  _id?: string
  id?: string
  name: string
  color?: string
  activeBoardId?: string | null
  createdAt?: string
  updatedAt?: string
}

// A named group of people scoped to a Jira label, independent of Profile -
// never bound to one (see .scratch/sprint-jira-integration/spec.md's "Team,
// Person, membership"). `jiraLabels` is an array on the wire (future
// flexibility) even though phase 1's UI only ever edits a single entry.
export interface Team {
  _id?: string
  id?: string
  name: string
  jiraLabels: string[]
  createdAt?: string
  updatedAt?: string
}

// Notes — a third, durable/organized concept alongside Todos and Scratchpad
// (see .scratch/notes-section/spec.md). Deliberately minimal: no priority,
// tags, due dates, or completion. `parentId`/`folderId` are `null` (never
// `undefined`) for a root-level folder/note, mirroring how the backend
// always writes an explicit null rather than omitting the field.
export interface NoteFolder {
  _id?: string
  id?: string
  name: string
  parentId?: string | null
  createdAt?: string
  updatedAt?: string
}

export interface Note {
  _id?: string
  id?: string
  name: string
  folderId?: string | null
  body?: JSONContent | null
  // Flat, one-directional, no-cascade grouping of linked todos' ids - see
  // the backend NoteDoc comment. A dangling id (its todo since deleted) is
  // left in place; callers resolving against a `Todo[]` are responsible for
  // tolerating a lookup miss.
  linkedTodoIds?: string[]
  createdAt?: string
  updatedAt?: string
}

// Boards - a persistent, named collection of existing todos/notes, built by
// attaching items from wherever they normally live (see
// .scratch/boards/spec.md). Strictly link-only: a Board never owns/creates a
// Todo or Note, only references one by id.
export type BoardItemType = 'Todo' | 'Note'

export interface BoardItem {
  itemType: BoardItemType
  // A dangling itemId (its Todo/Note since deleted elsewhere) is left in
  // place rather than cleaned up - see the backend BoardDoc comment. Callers
  // resolving against a Todo[]/Note[] list are responsible for tolerating a
  // lookup miss (the dangling-ref ghost card).
  itemId: string
}

export interface Board {
  _id?: string
  id?: string
  name: string
  // Flat, ordered, no-cascade reference list - array position is display
  // order, no separate order field (mirrors Todo.linkedTodoIds).
  items: BoardItem[]
  createdAt?: string
  updatedAt?: string
}

// GET /api/todos/weekly-summary's response shape - see the backend's
// packages/backend/src/utils/weeklySummaryBuckets.ts (source of truth for
// this shape) and .scratch/weekly-summary/spec.md. `weekStart`/`weekEnd` and
// every segment's `date` are local calendar-day strings ("YYYY-MM-DD"), same
// convention as Todo.dueDate. `categoryId` is bare - the frontend joins it
// against its own already-loaded `Category[]` for name/color rather than the
// backend embedding them.
export interface WeeklySummarySegment {
  date: string
  text: string
}

export interface WeeklySummaryCompletedEntry {
  id: string
  title: string
  completedAt: string
  lastSegmentBeforeCompletion: WeeklySummarySegment | null
}

export interface WeeklySummaryActionedEntry {
  id: string
  title: string
  segments: WeeklySummarySegment[]
}

export interface WeeklySummaryNoActionEntry {
  id: string
  title: string
}

export interface WeeklySummaryCategoryGroup {
  categoryId: string
  completed: WeeklySummaryCompletedEntry[]
  actioned: WeeklySummaryActionedEntry[]
  noAction: WeeklySummaryNoActionEntry[]
}

export interface WeeklySummaryResponse {
  weekStart: string
  weekEnd: string
  categories: WeeklySummaryCategoryGroup[]
}

// Threaded from App.tsx (which owns the active board via hooks/useBoards)
// down through AgendaGroups/CompletedTodos/NotesView to every quick-add
// insertion point (TodoItem, NotesView's note row) - see ticket 14
// (.scratch/boards/issues/14-quick-add-icon-and-badge.md). One shared value
// object rather than a resolved-boolean-per-row prop, so intermediate
// components that render many rows only have to thread one thing down.
// Optional on every consumer so a component test can render a row in
// isolation (no Boards context at all) and just get no icon rendered.
export interface BoardQuickAddState {
  // `${itemType}:${itemId}` keys currently on the active board - see
  // utils/boardItemKey.ts. A Set, not a per-row boolean, so this can be
  // computed once in App.tsx and handed down unchanged.
  activeItemKeys: Set<string>
  // Adds the item to the active board (or, if zero boards exist yet, opens
  // App.tsx's create-first-board prompt instead - see the spec's zero-boards
  // case). `originEl` is the clicked icon's own button element, read for its
  // bounding rect to anchor the arcing fly-to-badge animation.
  onAdd: (itemType: BoardItemType, itemId: string, label: string, originEl: HTMLElement) => void
  // Removes the item from the active board instantly - no reverse animation.
  onRemove: (itemType: BoardItemType, itemId: string) => void
}
