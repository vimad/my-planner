import mongoose from 'mongoose'

// dueDate is stored as an opaque local calendar-day string (e.g. "2026-07-25"),
// never a Date/timestamp — see the technical constraint in the spec about
// avoiding Date#toISOString() day-shift bugs. categoryId has no static
// schema default: the "Uncategorized" category's id is only known at runtime
// after seeding, so the default is resolved in the route layer instead.
const todoSchema = new mongoose.Schema(
  {
    title: { type: String, required: true },
    categoryId: { type: mongoose.Schema.Types.ObjectId, ref: 'Category', required: true },
    completed: { type: Boolean, default: false },
    dueDate: { type: String, default: null },
    priority: { type: String, enum: ['High', 'Medium', 'Low'], default: 'Medium' },
    tags: { type: [String], default: [] },
    // Links this todo to the app-wide Settings.nextOfficeDay instead of a
    // real dueDate. An explicit dueDate always wins over this — see
    // dateAgenda.js's effectiveDueDate, the single place that resolves the
    // two into what's actually shown/grouped/highlighted.
    officeLinked: { type: Boolean, default: false },
    // Tiptap JSON document (or null when the body has never been edited).
    body: { type: mongoose.Schema.Types.Mixed, default: null },
    // Denormalized plain-text extract of `body`, maintained by the route
    // layer (see utils/tiptapText.js) whenever `body` is set — used for
    // simple case-insensitive search (see GET /api/todos/search) since Tiptap
    // JSON isn't directly regex-matchable.
    bodyText: { type: String, default: '' },
    // Recurrence is a plain property on this instance, not a separate
    // "series" entity — see the spec's "Recurring todo mechanics" section.
    // null means one-off; { pattern } means the next instance is cloned and
    // its dueDate advanced when this instance is completed.
    recurrence: {
      type: new mongoose.Schema(
        { pattern: { type: String, enum: ['daily', 'weekly', 'monthly'], required: true } },
        { _id: false },
      ),
      default: null,
    },
  },
  { timestamps: true },
)

export const Todo = mongoose.model('Todo', todoSchema)
