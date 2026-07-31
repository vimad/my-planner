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
// (02) doesn't render it anywhere yet.
export interface Profile {
  _id?: string
  id?: string
  name: string
  color?: string
  createdAt?: string
  updatedAt?: string
}
