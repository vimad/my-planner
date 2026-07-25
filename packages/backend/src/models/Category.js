import mongoose from 'mongoose'

const categorySchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    color: { type: String, required: true },
    system: { type: Boolean, default: false },
  },
  { timestamps: true },
)

export const Category = mongoose.model('Category', categorySchema)
