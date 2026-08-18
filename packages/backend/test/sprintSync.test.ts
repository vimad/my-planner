import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest'

vi.mock('../src/services/jiraClient.ts', () => ({
  resolveBoard: vi.fn(),
  listSprints: vi.fn(),
  getSprint: vi.fn(),
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

vi.mock('../src/models/SprintSearchCache.ts', () => ({
  SprintSearchCache: {
    findOne: vi.fn(),
    findOneAndUpdate: vi.fn(),
  },
}))

const { resolveBoard, listSprints, getSprint } = (await import('../src/services/jiraClient.ts')) as unknown as {
  resolveBoard: Mock
  listSprints: Mock
  getSprint: Mock
}
const { Sprint } = (await import('../src/models/Sprint.ts')) as unknown as {
  Sprint: { findOne: Mock; find: Mock; findOneAndUpdate: Mock }
}
const { SprintSearchCache } = (await import('../src/models/SprintSearchCache.ts')) as unknown as {
  SprintSearchCache: { findOne: Mock; findOneAndUpdate: Mock }
}
const { getSprints, searchJiraSprints, importSprint } = await import('../src/services/sprintSync.ts')

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

describe('searchJiraSprints', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    SprintSearchCache.findOneAndUpdate.mockResolvedValue(undefined)
  })

  it('lists the Product Delivery Board from Jira and filters by name, case-insensitively, when the search cache is cold', async () => {
    resolveBoard.mockResolvedValue({ id: 29, name: 'Product Delivery Board', type: 'scrum' })
    SprintSearchCache.findOne.mockResolvedValue(null)
    listSprints.mockResolvedValue([
      { id: 132, name: 'WOSMVP Sprint 132', state: 'active' },
      { id: 133, name: 'WOSMVP Sprint 133', state: 'future' },
      { id: 130, name: 'WOSMVP Sprint 130', state: 'closed' },
    ])

    const result = await searchJiraSprints('sprint 133')

    // Deliberately a different board than getSprints'/syncFromJira's Odyssey
    // (id 235) - future sprints live on Product Delivery Board instead.
    expect(resolveBoard).toHaveBeenCalledWith('WOSMVP', 'Product Delivery Board')
    expect(listSprints).toHaveBeenCalledWith(29, ['active', 'future', 'closed'])
    expect(result).toEqual([{ id: 133, name: 'WOSMVP Sprint 133', state: 'future' }])
    expect(Sprint.findOneAndUpdate).not.toHaveBeenCalled()
    expect(Sprint.find).not.toHaveBeenCalled()
  })

  it('populates the search cache after a cold-cache Jira fetch', async () => {
    resolveBoard.mockResolvedValue({ id: 29, name: 'Product Delivery Board', type: 'scrum' })
    SprintSearchCache.findOne.mockResolvedValue(null)
    const jiraSprints = [{ id: 132, name: 'WOSMVP Sprint 132', state: 'active' }]
    listSprints.mockResolvedValue(jiraSprints)

    await searchJiraSprints('')

    expect(SprintSearchCache.findOneAndUpdate).toHaveBeenCalledWith(
      { boardId: 29 },
      expect.objectContaining({ boardId: 29, sprints: jiraSprints }),
      { upsert: true },
    )
  })

  it('serves the search cache without calling Jira when it is fresh', async () => {
    resolveBoard.mockResolvedValue({ id: 29, name: 'Product Delivery Board', type: 'scrum' })
    SprintSearchCache.findOne.mockResolvedValue({
      boardId: 29,
      fetchedAt: new Date(),
      sprints: [{ id: 133, name: 'WOSMVP Sprint 133', state: 'future' }],
    })

    const result = await searchJiraSprints('')

    expect(listSprints).not.toHaveBeenCalled()
    expect(SprintSearchCache.findOneAndUpdate).not.toHaveBeenCalled()
    expect(result).toEqual([{ id: 133, name: 'WOSMVP Sprint 133', state: 'future' }])
  })

  it('re-fetches from Jira and refreshes the search cache once it is older than its TTL', async () => {
    resolveBoard.mockResolvedValue({ id: 29, name: 'Product Delivery Board', type: 'scrum' })
    SprintSearchCache.findOne.mockResolvedValue({
      boardId: 29,
      fetchedAt: new Date(Date.now() - 3 * 60 * 1000),
      sprints: [{ id: 130, name: 'WOSMVP Sprint 130', state: 'closed' }],
    })
    listSprints.mockResolvedValue([{ id: 134, name: 'WOSMVP Sprint 134', state: 'future' }])

    const result = await searchJiraSprints('')

    expect(listSprints).toHaveBeenCalledWith(29, ['active', 'future', 'closed'])
    expect(result).toEqual([{ id: 134, name: 'WOSMVP Sprint 134', state: 'future' }])
  })

  it('returns every board sprint for a blank query', async () => {
    resolveBoard.mockResolvedValue({ id: 29, name: 'Product Delivery Board', type: 'scrum' })
    SprintSearchCache.findOne.mockResolvedValue(null)
    const jiraSprints = [{ id: 132, name: 'WOSMVP Sprint 132', state: 'active' }]
    listSprints.mockResolvedValue(jiraSprints)

    const result = await searchJiraSprints('')

    expect(result).toEqual(jiraSprints)
  })

  it('returns null when the board cannot be resolved', async () => {
    resolveBoard.mockResolvedValue(null)

    const result = await searchJiraSprints('anything')

    expect(result).toBeNull()
    expect(listSprints).not.toHaveBeenCalled()
    expect(SprintSearchCache.findOne).not.toHaveBeenCalled()
  })
})

describe('importSprint', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('fetches the sprint by id and upserts it via findOneAndUpdate with upsert:true', async () => {
    getSprint.mockResolvedValue({ id: 134, name: 'WOSMVP Sprint 134', state: 'future' })
    Sprint.findOneAndUpdate.mockResolvedValue({ jiraSprintId: '134', name: 'WOSMVP Sprint 134', state: 'future' })

    const result = await importSprint(134)

    expect(getSprint).toHaveBeenCalledWith(134)
    expect(Sprint.findOneAndUpdate).toHaveBeenCalledTimes(1)
    expect(Sprint.findOneAndUpdate).toHaveBeenCalledWith(
      { jiraSprintId: '134' },
      expect.objectContaining({ jiraSprintId: '134', name: 'WOSMVP Sprint 134', state: 'future' }),
      expect.objectContaining({ upsert: true }),
    )
    expect(result).toEqual({ jiraSprintId: '134', name: 'WOSMVP Sprint 134', state: 'future' })
  })

  it('calling it twice for the same id only ever upserts, never creating a second doc', async () => {
    getSprint.mockResolvedValue({ id: 134, name: 'WOSMVP Sprint 134', state: 'future' })
    Sprint.findOneAndUpdate.mockResolvedValue({ jiraSprintId: '134', name: 'WOSMVP Sprint 134', state: 'future' })

    await importSprint(134)
    await importSprint(134)

    expect(Sprint.findOneAndUpdate).toHaveBeenCalledTimes(2)
    for (const call of Sprint.findOneAndUpdate.mock.calls) {
      expect(call[0]).toEqual({ jiraSprintId: '134' })
      expect(call[2]).toEqual(expect.objectContaining({ upsert: true }))
    }
  })

  it('propagates a Jira error when the sprint id does not exist', async () => {
    getSprint.mockRejectedValue(new Error('Jira request failed: 404 Not Found (/rest/agile/1.0/sprint/999999)'))

    await expect(importSprint(999999)).rejects.toThrow('404')
    expect(Sprint.findOneAndUpdate).not.toHaveBeenCalled()
  })
})
