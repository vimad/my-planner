import { Category } from './models/Category.ts'
import { Profile } from './models/Profile.ts'
import { ScratchNote } from './models/ScratchNote.ts'
import type { Types } from 'mongoose'

const UNCATEGORIZED_NAME = 'Uncategorized'
const WORK_PROFILE_NAME = 'Work'

// Idempotent: ensure the given profile has its own system-provided
// "Uncategorized" category. Extends the pre-Profile global version of this
// same idea (one Uncategorized for the whole app) to run per-profile —
// called both when a brand-new Profile is created (routes/profiles.ts) and,
// post-backfill, for the migrated "Work" profile below.
export async function seedUncategorizedCategory(profileId: Types.ObjectId | string) {
  const existing = await Category.findOne({ name: UNCATEGORIZED_NAME, profileId })
  if (existing) return existing

  return Category.create({ name: UNCATEGORIZED_NAME, color: '#94a3b8', system: true, profileId })
}

// Idempotent: find-or-create the single default "Work" profile that
// pre-Profile data migrates onto. Deliberately does not seed Uncategorized
// itself — the caller (migrateToWorkProfile) does that only after backfill,
// so an old, not-yet-backfilled Uncategorized category isn't duplicated.
async function findOrCreateWorkProfile() {
  const existing = await Profile.findOne({ name: WORK_PROFILE_NAME })
  if (existing) return existing

  return Profile.create({ name: WORK_PROFILE_NAME })
}

// Idempotent boot-time migration: find-or-create the "Work" profile and
// backfill profileId onto any Category/ScratchNote that predates Profile
// (i.e. has none yet), landing them on Work. Safe to run on every boot —
// once every doc has a profileId, the update filters match nothing and the
// backfill is a no-op; findOrCreateWorkProfile reuses the existing Work
// profile rather than creating a second one.
export async function migrateToWorkProfile() {
  const work = await findOrCreateWorkProfile()

  await Category.updateMany({ profileId: { $exists: false } }, { $set: { profileId: work._id } })
  await ScratchNote.updateMany({ profileId: { $exists: false } }, { $set: { profileId: work._id } })

  // Runs after backfill so a pre-Profile "Uncategorized" category that just
  // got assigned to Work is found (and reused) rather than duplicated.
  await seedUncategorizedCategory(work._id)

  return work
}
