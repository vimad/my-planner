import { Category } from '../models/Category.ts'
import type { Types } from 'mongoose'

const UNCATEGORIZED_NAME = 'Uncategorized'

// The seeded Uncategorized category's id is only known at runtime, after
// boot-time seeding — not a static schema default. Shared by any route that
// needs to default a Todo's categoryId (todos.js, scratchNotes.js).
//
// Category.js is still plain JS (converted in issue 02), so its exports are
// implicitly `any` under `allowJs`/`checkJs: false` — the explicit return
// type here is the real contract until the model itself is typed.
export async function resolveDefaultCategoryId(): Promise<Types.ObjectId | string | null> {
  const uncategorized = await Category.findOne({ name: UNCATEGORIZED_NAME })
  return uncategorized?._id ?? uncategorized?.id ?? null
}
