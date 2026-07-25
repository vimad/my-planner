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
    // Tiptap JSON document (or null when the body has never been edited).
    body: { type: mongoose.Schema.Types.Mixed, default: null },
  },
  { timestamps: true },
)

export const Todo = mongoose.model('Todo', todoSchema)
