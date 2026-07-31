import mongoose, { Schema, type Types } from 'mongoose'

export interface NoteFolderDoc {
  name: string
  // null = root-level folder. Self-referencing (ref: 'NoteFolder') so
  // folders nest without limit, same shape as any adjacency-list tree.
  parentId: Types.ObjectId | null
  profileId: Types.ObjectId
  createdAt: Date
  updatedAt: Date
}

const noteFolderSchema = new Schema<NoteFolderDoc>(
  {
    name: { type: String, required: true },
    parentId: { type: Schema.Types.ObjectId, ref: 'NoteFolder', default: null },
    profileId: { type: Schema.Types.ObjectId, ref: 'Profile', required: true },
  },
  { timestamps: true },
)

export const NoteFolder = mongoose.model<NoteFolderDoc>('NoteFolder', noteFolderSchema)
