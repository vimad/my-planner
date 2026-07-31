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
  createdAt: Date
  updatedAt: Date
}

const noteSchema = new Schema<NoteDoc>(
  {
    name: { type: String, required: true },
    folderId: { type: Schema.Types.ObjectId, ref: 'NoteFolder', default: null },
    body: { type: Schema.Types.Mixed, default: null },
    profileId: { type: Schema.Types.ObjectId, ref: 'Profile', required: true },
  },
  { timestamps: true },
)

export const Note = mongoose.model<NoteDoc>('Note', noteSchema)
