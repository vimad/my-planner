import mongoose, { Schema, type Types } from 'mongoose'
import type { TiptapNode } from '../utils/tiptapText.ts'

// A ScratchNote's body is modeled as an array of line objects rather than a
// single Tiptap document with custom per-node ids. Each line carries its own
// stable `id` (assigned by the route layer, not Mongo's `_id`, so it survives
// round-trips through plain JSON on the frontend) and its own Tiptap JSON
// document in `content`. This sidesteps needing ProseMirror-internal
// line-splitting/id-attribute logic to get "select and promote individual
// lines" - each line is just its own small independent rich-text document,
// rendered with the same shared RichTextEditor component used for todos.
export interface ScratchLine {
  id: string
  // Tiptap JSON document for just this line's content (or null when empty).
  content: TiptapNode | null
  // Set once this line has been promoted into a Todo; null until then.
  promotedTodoId: Types.ObjectId | null
}

export interface ScratchNoteDoc {
  body: ScratchLine[]
  archived: boolean
  createdAt: Date
  updatedAt: Date
}

const lineSchema = new Schema<ScratchLine>(
  {
    id: { type: String, required: true },
    content: { type: Schema.Types.Mixed, default: null },
    promotedTodoId: { type: Schema.Types.ObjectId, ref: 'Todo', default: null },
  },
  { _id: false },
)

const scratchNoteSchema = new Schema<ScratchNoteDoc>(
  {
    body: { type: [lineSchema], default: [] },
    archived: { type: Boolean, default: false },
  },
  { timestamps: true },
)

export const ScratchNote = mongoose.model<ScratchNoteDoc>('ScratchNote', scratchNoteSchema)
