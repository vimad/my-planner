import { Category } from '../models/Category.ts'
import type { Types } from 'mongoose'

const UNCATEGORIZED_NAME = 'Uncategorized'

// The seeded Uncategorized category's id is only known at runtime, after
// boot-time seeding — not a static schema default. Shared by any route that
// needs to default a Todo's categoryId (todos.js, scratchNotes.js).
//
// Takes profileId because Uncategorized is per-profile (each Profile gets
// its own seeded Uncategorized category — see seed.ts's
// seedUncategorizedCategory) — resolving "the" Uncategorized category
// without a profile would be ambiguous once more than one profile exists.
//
// Category.js is still plain JS (converted in issue 02), so its exports are
// implicitly `any` under `allowJs`/`checkJs: false` — the explicit return
// type here is the real contract until the model itself is typed.
export async function resolveDefaultCategoryId(
  profileId: Types.ObjectId | string,
): Promise<Types.ObjectId | string | null> {
  const uncategorized = await Category.findOne({ name: UNCATEGORIZED_NAME, profileId })
  return uncategorized?._id ?? uncategorized?.id ?? null
}
