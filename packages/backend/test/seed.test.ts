import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest'

// Same mocked-at-the-module-boundary seam as the route tests
// (categories.route.test.ts et al.) — seed.ts isn't a route, but it talks
// to the models the same way, so it gets exercised the same way: mock the
// Mongoose statics it calls, assert on how it calls them.
interface MockedProfileModel {
  findOne: Mock
  create: Mock
}

interface MockedCategoryModel {
  findOne: Mock
  create: Mock
  updateMany: Mock
}

interface MockedScratchNoteModel {
  updateMany: Mock
}

vi.mock('../src/models/Profile.ts', () => {
  return {
    Profile: {
      findOne: vi.fn(),
      create: vi.fn(),
    },
  }
})

vi.mock('../src/models/Category.ts', () => {
  return {
    Category: {
      findOne: vi.fn(),
      create: vi.fn(),
      updateMany: vi.fn(),
    },
  }
})

vi.mock('../src/models/ScratchNote.ts', () => {
  return {
    ScratchNote: {
      updateMany: vi.fn(),
    },
  }
})

const { Profile } = (await import('../src/models/Profile.ts')) as unknown as {
  Profile: MockedProfileModel
}
const { Category } = (await import('../src/models/Category.ts')) as unknown as {
  Category: MockedCategoryModel
}
const { ScratchNote } = (await import('../src/models/ScratchNote.ts')) as unknown as {
  ScratchNote: MockedScratchNoteModel
}
const { seedUncategorizedCategory, migrateToWorkProfile } = await import('../src/seed.ts')

describe('seedUncategorizedCategory', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('creates a per-profile Uncategorized category when none exists yet', async () => {
    Category.findOne.mockResolvedValue(null)
    Category.create.mockResolvedValue({ _id: 'c1', name: 'Uncategorized', profileId: 'p1' })

    const result = await seedUncategorizedCategory('p1')

    expect(Category.findOne).toHaveBeenCalledWith({ name: 'Uncategorized', profileId: 'p1' })
    expect(Category.create).toHaveBeenCalledWith({
      name: 'Uncategorized',
      color: '#94a3b8',
      system: true,
      profileId: 'p1',
    })
    expect(result).toEqual({ _id: 'c1', name: 'Uncategorized', profileId: 'p1' })
  })

  it('reuses the existing Uncategorized category for that profile instead of duplicating it', async () => {
    const existing = { _id: 'c1', name: 'Uncategorized', profileId: 'p1' }
    Category.findOne.mockResolvedValue(existing)

    const result = await seedUncategorizedCategory('p1')

    expect(Category.create).not.toHaveBeenCalled()
    expect(result).toBe(existing)
  })
})

describe('migrateToWorkProfile', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('creates the Work profile and backfills profile-less Categories/ScratchNotes onto it', async () => {
    Profile.findOne.mockResolvedValue(null)
    Profile.create.mockResolvedValue({ _id: 'work-id', name: 'Work' })
    Category.updateMany.mockResolvedValue({ modifiedCount: 2 })
    ScratchNote.updateMany.mockResolvedValue({ modifiedCount: 1 })
    Category.findOne.mockResolvedValue(null)
    Category.create.mockResolvedValue({ _id: 'c1', name: 'Uncategorized', profileId: 'work-id' })

    const work = await migrateToWorkProfile()

    expect(Profile.findOne).toHaveBeenCalledWith({ name: 'Work' })
    expect(Profile.create).toHaveBeenCalledWith({ name: 'Work' })
    expect(Category.updateMany).toHaveBeenCalledWith(
      { profileId: { $exists: false } },
      { $set: { profileId: 'work-id' } },
    )
    expect(ScratchNote.updateMany).toHaveBeenCalledWith(
      { profileId: { $exists: false } },
      { $set: { profileId: 'work-id' } },
    )
    expect(work).toEqual({ _id: 'work-id', name: 'Work' })
  })

  it('is idempotent: a second run reuses the existing Work profile and never re-seeds or duplicates it', async () => {
    const existingWork = { _id: 'work-id', name: 'Work' }
    Profile.findOne.mockResolvedValue(existingWork)
    Category.updateMany.mockResolvedValue({ modifiedCount: 0 })
    ScratchNote.updateMany.mockResolvedValue({ modifiedCount: 0 })
    // Uncategorized for Work already exists from the first run.
    Category.findOne.mockResolvedValue({ _id: 'c1', name: 'Uncategorized', profileId: 'work-id' })

    await migrateToWorkProfile()

    expect(Profile.create).not.toHaveBeenCalled()
    expect(Category.create).not.toHaveBeenCalled()
    // The backfill filter is unconditional/idempotent by construction — it
    // only ever matches docs that still lack a profileId, so running it
    // again is safe even though we still call it every boot.
    expect(Category.updateMany).toHaveBeenCalledWith(
      { profileId: { $exists: false } },
      { $set: { profileId: 'work-id' } },
    )
  })

  it('seeds Work-scoped Uncategorized only after backfill, so a pre-Profile Uncategorized is reused not duplicated', async () => {
    Profile.findOne.mockResolvedValue(null)
    Profile.create.mockResolvedValue({ _id: 'work-id', name: 'Work' })
    Category.updateMany.mockResolvedValue({ modifiedCount: 1 })
    ScratchNote.updateMany.mockResolvedValue({ modifiedCount: 0 })
    // Simulates the pre-Profile "Uncategorized" category having just been
    // backfilled onto Work by the updateMany call above.
    Category.findOne.mockResolvedValue({ _id: 'old-uncategorized', name: 'Uncategorized', profileId: 'work-id' })

    await migrateToWorkProfile()

    expect(Category.create).not.toHaveBeenCalled()
  })
})
