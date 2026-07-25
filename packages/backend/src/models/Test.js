import mongoose from 'mongoose'

const testSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
  },
  { timestamps: true },
)

// Explicitly pin the collection name to "test" as requested.
export const Test = mongoose.model('Test', testSchema, 'test')
