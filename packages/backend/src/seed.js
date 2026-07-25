import { Test } from './models/Test.js'

// Scaffolding seed: make sure there is at least one document to read.
// Later real work will replace this with proper seed/migration logic.
export async function seedTestCollection() {
  const existing = await Test.findOne()
  if (existing) return existing

  return Test.create({ name: 'vinod' })
}
