import mongoose, { Schema } from 'mongoose'

export interface CategoryDoc {
  name: string
  color: string
  system: boolean
  createdAt: Date
  updatedAt: Date
}

const categorySchema = new Schema<CategoryDoc>(
  {
    name: { type: String, required: true },
    color: { type: String, required: true },
    system: { type: Boolean, default: false },
  },
  { timestamps: true },
)

export const Category = mongoose.model<CategoryDoc>('Category', categorySchema)
