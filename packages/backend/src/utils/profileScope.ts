import { Category } from '../models/Category.ts'
import type { Types } from 'mongoose'

// Shared join used by every Todo-adjacent read that needs profile-scoping:
// a Todo carries no direct profileId (see the Profiles spec's "derived
// transitively via categoryId -> Category.profileId" decision), so scoping
// a Todo query by profile means first resolving which categoryIds belong to
// that profile, then filtering Todo.find/.distinct by
// `categoryId: { $in: [...] }`. Centralized here rather than duplicated
// across routes/todos.ts's three profile-scoped endpoints (list, tags,
// search).
export async function resolveCategoryIdsForProfile(
  profileId: Types.ObjectId | string,
): Promise<(Types.ObjectId | string)[]> {
  const categories = await Category.find({ profileId }, { _id: 1 })
  return categories.map((category) => category._id as Types.ObjectId | string)
}
