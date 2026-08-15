import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest'

vi.mock('../src/services/backlogSearch.ts', () => ({ searchBacklog: vi.fn() }))

const findSort = vi.fn()

vi.mock('../src/models/BacklogTicketCache.ts', () => ({
  BacklogTicketCache: {
    find: vi.fn(() => ({ sort: findSort })),
    deleteMany: vi.fn(),
    insertMany: vi.fn(),
  },
}))

vi.mock('../src/models/BacklogCacheSync.ts', () => ({
  BacklogCacheSync: {
    findOne: vi.fn(),
    findOneAndUpdate: vi.fn(),
  },
}))

const { searchBacklog } = (await import('../src/services/backlogSearch.ts')) as unknown as { searchBacklog: Mock }
const { BacklogTicketCache } = (await import('../src/models/BacklogTicketCache.ts')) as unknown as {
  BacklogTicketCache: { find: Mock; deleteMany: Mock; insertMany: Mock }
}
const { BacklogCacheSync } = (await import('../src/models/BacklogCacheSync.ts')) as unknown as {
  BacklogCacheSync: { findOne: Mock; findOneAndUpdate: Mock }
}
const { getBacklog, refreshBacklog } = await import('../src/services/backlogCache.ts')

const TICKETS = [
  { key: 'WOSMVP-100', title: 'A story', type: 'Story', labels: ['Odyssey'], dev: { name: 'Ada' }, qa: null, assignee: null },
  { key: 'WOSMVP-200', title: 'A task', type: 'Task', labels: ['Odyssey'], dev: null, qa: null, assignee: { name: 'Bob' } },
]

const CACHED_DOCS = [
  { jiraKey: 'WOSMVP-100', title: 'A story', type: 'Story', labels: ['Odyssey'], dev: { name: 'Ada' }, qa: null, assignee: null, rank: 0 },
  { jiraKey: 'WOSMVP-200', title: 'A task', type: 'Task', labels: ['Odyssey'], dev: null, qa: null, assignee: { name: 'Bob' }, rank: 1 },
]

describe('getBacklog', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    BacklogCacheSync.findOneAndUpdate.mockResolvedValue(undefined)
  })

  it('serves the cache without calling Jira once the category has been synced', async () => {
    BacklogCacheSync.findOne.mockResolvedValue({ lastSyncedAt: new Date() })
    findSort.mockResolvedValue(CACHED_DOCS)

    const result = await getBacklog('team1', 'tech-ops', ['Odyssey'])

    expect(BacklogTicketCache.find).toHaveBeenCalledWith({ teamId: 'team1', category: 'tech-ops' })
    expect(searchBacklog).not.toHaveBeenCalled()
    expect(result).toEqual(TICKETS)
  })

  it('fetches from Jira and populates the cache when the category has never been synced', async () => {
    BacklogCacheSync.findOne.mockResolvedValue(null)
    searchBacklog.mockResolvedValue(TICKETS)

    const result = await getBacklog('team1', 'product', ['Odyssey'])

    expect(searchBacklog).toHaveBeenCalledWith('product', ['Odyssey'])
    expect(BacklogTicketCache.deleteMany).toHaveBeenCalledWith({ teamId: 'team1', category: 'product' })
    expect(BacklogTicketCache.insertMany).toHaveBeenCalledWith([
      expect.objectContaining({ teamId: 'team1', category: 'product', jiraKey: 'WOSMVP-100', rank: 0 }),
      expect.objectContaining({ teamId: 'team1', category: 'product', jiraKey: 'WOSMVP-200', rank: 1 }),
    ])
    expect(BacklogCacheSync.findOneAndUpdate).toHaveBeenCalledWith(
      { teamId: 'team1', category: 'product' },
      expect.objectContaining({ teamId: 'team1', category: 'product' }),
      { upsert: true },
    )
    expect(result).toEqual(TICKETS)
  })

  it('marks an empty Jira result as synced too, without calling insertMany', async () => {
    BacklogCacheSync.findOne.mockResolvedValue(null)
    searchBacklog.mockResolvedValue([])

    const result = await getBacklog('team1', 'bug', [])

    expect(BacklogTicketCache.insertMany).not.toHaveBeenCalled()
    expect(BacklogCacheSync.findOneAndUpdate).toHaveBeenCalledTimes(1)
    expect(result).toEqual([])
  })

  it('an empty-but-synced cache is served without re-hitting Jira on the next call', async () => {
    BacklogCacheSync.findOne.mockResolvedValue({ lastSyncedAt: new Date() })
    findSort.mockResolvedValue([])

    const result = await getBacklog('team1', 'bug', [])

    expect(searchBacklog).not.toHaveBeenCalled()
    expect(result).toEqual([])
  })

  it('returns null when the cache is cold and Jira cannot resolve the board/sprint', async () => {
    BacklogCacheSync.findOne.mockResolvedValue(null)
    searchBacklog.mockResolvedValue(null)

    const result = await getBacklog('team1', 'tech-ops', ['Odyssey'])

    expect(result).toBeNull()
    expect(BacklogTicketCache.deleteMany).not.toHaveBeenCalled()
    expect(BacklogCacheSync.findOneAndUpdate).not.toHaveBeenCalled()
  })
})

describe('refreshBacklog', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    BacklogCacheSync.findOneAndUpdate.mockResolvedValue(undefined)
  })

  it('always re-fetches from Jira, even when already synced, and replaces the cache', async () => {
    searchBacklog.mockResolvedValue(TICKETS)

    const result = await refreshBacklog('team1', 'tech-ops', ['Odyssey'])

    expect(BacklogCacheSync.findOne).not.toHaveBeenCalled()
    expect(searchBacklog).toHaveBeenCalledWith('tech-ops', ['Odyssey'])
    expect(BacklogTicketCache.deleteMany).toHaveBeenCalledWith({ teamId: 'team1', category: 'tech-ops' })
    expect(BacklogTicketCache.insertMany).toHaveBeenCalledTimes(1)
    expect(result).toEqual(TICKETS)
  })

  it('leaves the existing cache untouched when the Jira re-fetch fails to resolve the board', async () => {
    searchBacklog.mockResolvedValue(null)

    const result = await refreshBacklog('team1', 'tech-ops', ['Odyssey'])

    expect(result).toBeNull()
    expect(BacklogTicketCache.deleteMany).not.toHaveBeenCalled()
    expect(BacklogTicketCache.insertMany).not.toHaveBeenCalled()
    expect(BacklogCacheSync.findOneAndUpdate).not.toHaveBeenCalled()
  })
})
