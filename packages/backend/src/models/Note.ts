import mongoose, { Schema, type Types } from 'mongoose'
import type { TiptapNode } from '../utils/tiptapText.ts'

export interface NoteDoc {
  name: string
  // null = root-level note (not forced into a catch-all folder).
  folderId: Types.ObjectId | null
  // Tiptap JSON document (or null when the body has never been edited) -
  // same Schema.Types.Mixed convention as Todo.body/ScratchLine.content.
  body: TiptapNode | null
  profileId: Types.ObjectId
  // Flat, reference-only grouping of Todo documents for visibility - NOT a
  // cascade in either direction, mirroring Todo.linkedTodoIds. Completing,
  // editing, or deleting a linked todo must never affect this note, and
  // deleting this note must never affect (or delete) a linked todo. Stored
  // one-directionally here only; a Todo has no back-reference to whichever
  // notes link to it. A linked id whose todo has since been deleted is left
  // dangling rather than cleaned up - the route/frontend layer is
  // responsible for tolerating that, not this schema.
  linkedTodoIds: Types.ObjectId[]
  createdAt: Date
  updatedAt: Date
}

const noteSchema = new Schema<NoteDoc>(
  {
    name: { type: String, required: true },
    folderId: { type: Schema.Types.ObjectId, ref: 'NoteFolder', default: null },
    body: { type: Schema.Types.Mixed, default: null },
    profileId: { type: Schema.Types.ObjectId, ref: 'Profile', required: true },
    linkedTodoIds: { type: [{ type: Schema.Types.ObjectId, ref: 'Todo' }], default: [] },
  },
  { timestamps: true },
)

export const Note = mongoose.model<NoteDoc>('Note', noteSchema)
