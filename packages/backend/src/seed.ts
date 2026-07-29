import { Category } from './models/Category.ts'

const UNCATEGORIZED = { name: 'Uncategorized', color: '#94a3b8', system: true }

// Idempotent: ensure the system-provided "Uncategorized" category always exists.
export async function seedUncategorizedCategory() {
  const existing = await Category.findOne({ name: UNCATEGORIZED.name })
  if (existing) return existing

  return Category.create(UNCATEGORIZED)
}
