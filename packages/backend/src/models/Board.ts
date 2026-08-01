import mongoose, { Schema, type Types } from 'mongoose'

export type BoardItemType = 'Todo' | 'Note'

export interface BoardItem {
  itemType: BoardItemType
  itemId: Types.ObjectId // refPath: 'items.itemType' — itemType doubles as the literal model name
}

export interface BoardDoc {
  name: string
  profileId: Types.ObjectId // ref Profile, required
  // Flat, ordered, no-cascade reference list — array position is display
  // order, no separate order field. Mirrors Todo.linkedTodoIds: deleting or
  // completing a todo, or deleting a note, must never touch any board's
  // items. Deleting a board must never delete the todos/notes it
  // references — only this document (and Profile.activeBoardId, if it
  // pointed here) are touched. A dangling itemId whose todo/note has since
  // been deleted is left in place rather than cleaned up; the frontend
  // tolerates it (dangling-ref placeholder card).
  items: BoardItem[]
  createdAt: Date
  updatedAt: Date
}

const boardItemSchema = new Schema<BoardItem>(
  {
    itemType: { type: String, enum: ['Todo', 'Note'], required: true },
    itemId: { type: Schema.Types.ObjectId, required: true, refPath: 'items.itemType' },
  },
  { _id: false },
)

const boardSchema = new Schema<BoardDoc>(
  {
    name: { type: String, required: true },
    profileId: { type: Schema.Types.ObjectId, ref: 'Profile', required: true },
    items: { type: [boardItemSchema], default: [] },
  },
  { timestamps: true },
)

export const Board = mongoose.model<BoardDoc>('Board', boardSchema)
