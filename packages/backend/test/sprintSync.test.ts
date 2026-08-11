import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest'

vi.mock('../src/services/jiraClient.ts', () => ({
  resolveBoard: vi.fn(),
  listSprints: vi.fn(),
}))

const findOneSort = vi.fn()
const findSort = vi.fn()

vi.mock('../src/models/Sprint.ts', () => ({
  Sprint: {
    findOne: vi.fn(() => ({ sort: findOneSort })),
    find: vi.fn(() => ({ sort: findSort })),
    findOneAndUpdate: vi.fn(),
  },
}))

const { resolveBoard, listSprints } = (await import('../src/services/jiraClient.ts')) as unknown as {
  resolveBoard: Mock
  listSprints: Mock
}
const { Sprint } = (await import('../src/models/Sprint.ts')) as unknown as {
  Sprint: { findOne: Mock; find: Mock; findOneAndUpdate: Mock }
}
const { getSprints } = await import('../src/services/sprintSync.ts')

describe('getSprints', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    Sprint.findOneAndUpdate.mockResolvedValue(undefined)
    findSort.mockResolvedValue([{ jiraSprintId: '632' }])
  })

  it('serves the cache without calling Jira when the freshest sync is recent', async () => {
    findOneSort.mockResolvedValue({ lastSyncedAt: new Date() })

    const result = await getSprints()

    expect(resolveBoard).not.toHaveBeenCalled()
    expect(listSprints).not.toHaveBeenCalled()
    expect(result).toEqual([{ jiraSprintId: '632' }])
  })

  it('refreshes from Jira when the cache is empty', async () => {
    findOneSort.mockResolvedValue(null)
    resolveBoard.mockResolvedValue({ id: 235, name: 'Odyssey', type: 'scrum' })
    listSprints.mockResolvedValue([{ id: 632, name: 'Sprint 132', state: 'active' }])

    const result = await getSprints()

    expect(resolveBoard).toHaveBeenCalledWith('WOSMVP', 'Odyssey')
    expect(listSprints).toHaveBeenCalledWith(235, ['active', 'future', 'closed'])
    expect(Sprint.findOneAndUpdate).toHaveBeenCalledTimes(1)
    expect(result).toEqual([{ jiraSprintId: '632' }])
  })

  it('refreshes from Jira when the cache is older than the TTL', async () => {
    findOneSort.mockResolvedValue({ lastSyncedAt: new Date(Date.now() - 11 * 60 * 1000) })
    resolveBoard.mockResolvedValue({ id: 235, name: 'Odyssey', type: 'scrum' })
    listSprints.mockResolvedValue([])

    await getSprints()

    expect(resolveBoard).toHaveBeenCalled()
  })

  it('returns null when the cache is cold and the board cannot be resolved', async () => {
    findOneSort.mockResolvedValue(null)
    resolveBoard.mockResolvedValue(null)

    const result = await getSprints()

    expect(result).toBeNull()
    expect(listSprints).not.toHaveBeenCalled()
  })

  it('serves a warm-but-stale cache even when the Jira refresh fails to resolve a board', async () => {
    findOneSort.mockResolvedValue({ lastSyncedAt: new Date(Date.now() - 11 * 60 * 1000) })
    resolveBoard.mockResolvedValue(null)

    const result = await getSprints()

    expect(result).toEqual([{ jiraSprintId: '632' }])
    expect(listSprints).not.toHaveBeenCalled()
  })
})
