import mongoose from 'mongoose'

// A ScratchNote's body is modeled as an array of line objects rather than a
// single Tiptap document with custom per-node ids. Each line carries its own
// stable `id` (assigned by the route layer, not Mongo's `_id`, so it survives
// round-trips through plain JSON on the frontend) and its own Tiptap JSON
// document in `content`. This sidesteps needing ProseMirror-internal
// line-splitting/id-attribute logic to get "select and promote individual
// lines" - each line is just its own small independent rich-text document,
// rendered with the same shared RichTextEditor component used for todos.
const lineSchema = new mongoose.Schema(
  {
    id: { type: String, required: true },
    // Tiptap JSON document for just this line's content (or null when empty).
    content: { type: mongoose.Schema.Types.Mixed, default: null },
    // Set once this line has been promoted into a Todo; null until then.
    promotedTodoId: { type: mongoose.Schema.Types.ObjectId, ref: 'Todo', default: null },
  },
  { _id: false },
)

const scratchNoteSchema = new mongoose.Schema(
  {
    body: { type: [lineSchema], default: [] },
    archived: { type: Boolean, default: false },
  },
  { timestamps: true },
)

export const ScratchNote = mongoose.model('ScratchNote', scratchNoteSchema)
