import { Category } from '../models/Category.js'

const UNCATEGORIZED_NAME = 'Uncategorized'

// The seeded Uncategorized category's id is only known at runtime, after
// boot-time seeding — not a static schema default. Shared by any route that
// needs to default a Todo's categoryId (todos.js, scratchNotes.js).
export async function resolveDefaultCategoryId() {
  const uncategorized = await Category.findOne({ name: UNCATEGORIZED_NAME })
  return uncategorized?._id ?? uncategorized?.id ?? null
}
