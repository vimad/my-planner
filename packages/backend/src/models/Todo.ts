import mongoose, { Schema, type Types } from 'mongoose'
import type { TiptapNode } from '../utils/tiptapText.ts'

export type TodoPriority = 'High' | 'Medium' | 'Low'

export interface TodoRecurrence {
  pattern: 'daily' | 'weekly' | 'monthly'
}

// dueDate is stored as an opaque local calendar-day string (e.g. "2026-07-25"),
// never a Date/timestamp — see the technical constraint in the spec about
// avoiding Date#toISOString() day-shift bugs. categoryId has no static
// schema default: the "Uncategorized" category's id is only known at runtime
// after seeding, so the default is resolved in the route layer instead.
export interface TodoDoc {
  title: string
  categoryId: Types.ObjectId
  completed: boolean
  dueDate: string | null
  priority: TodoPriority
  tags: string[]
  // Links this todo to the app-wide Settings.nextOfficeDay instead of a
  // real dueDate. An explicit dueDate always wins over this — see
  // dateAgenda.js's effectiveDueDate, the single place that resolves the
  // two into what's actually shown/grouped/highlighted.
  officeLinked: boolean
  // Tiptap JSON document (or null when the body has never been edited).
  body: TiptapNode | null
  // Denormalized plain-text extract of `body`, maintained by the route
  // layer (see utils/tiptapText.ts) whenever `body` is set — used for
  // simple case-insensitive search (see GET /api/todos/search) since Tiptap
  // JSON isn't directly regex-matchable.
  bodyText: string
  // Recurrence is a plain property on this instance, not a separate
  // "series" entity — see the spec's "Recurring todo mechanics" section.
  // null means one-off; { pattern } means the next instance is cloned and
  // its dueDate advanced when this instance is completed.
  recurrence: TodoRecurrence | null
  // Flat, reference-only grouping of other todos for visibility and quick
  // access to their notes — NOT a cascade in either direction. Completing,
  // reopening, or deleting this todo must never affect a linked todo, and
  // vice versa. Stored one-directionally on the linking ("parent") todo
  // only; a linked todo has no back-reference to whoever links to it. A
  // linked id whose todo has since been deleted is left dangling rather
  // than cleaned up — the route/frontend layer is responsible for
  // tolerating that, not this schema.
  linkedTodoIds: Types.ObjectId[]
  createdAt: Date
  updatedAt: Date
}

const recurrenceSchema = new Schema<TodoRecurrence>(
  { pattern: { type: String, enum: ['daily', 'weekly', 'monthly'], required: true } },
  { _id: false },
)

const todoSchema = new Schema<TodoDoc>(
  {
    title: { type: String, required: true },
    categoryId: { type: Schema.Types.ObjectId, ref: 'Category', required: true },
    completed: { type: Boolean, default: false },
    dueDate: { type: String, default: null },
    priority: { type: String, enum: ['High', 'Medium', 'Low'], default: 'Medium' },
    tags: { type: [String], default: [] },
    officeLinked: { type: Boolean, default: false },
    body: { type: Schema.Types.Mixed, default: null },
    bodyText: { type: String, default: '' },
    recurrence: {
      type: recurrenceSchema,
      default: null,
    },
    linkedTodoIds: { type: [{ type: Schema.Types.ObjectId, ref: 'Todo' }], default: [] },
  },
  { timestamps: true },
)

export const Todo = mongoose.model<TodoDoc>('Todo', todoSchema)
