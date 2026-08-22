import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest'

interface MockedAtlasRosterMemberModel {
  find: Mock
}
interface MockedAtlasTaskModel {
  find: Mock
}
interface MockedAtlasPlanningEntryModel {
  find: Mock
  deleteMany: Mock
  updateOne: Mock
  create: Mock
}

vi.mock('../src/models/AtlasRosterMember.ts', () => ({ AtlasRosterMember: { find: vi.fn() } }))
vi.mock('../src/models/AtlasTask.ts', () => ({ AtlasTask: { find: vi.fn() } }))
vi.mock('../src/models/AtlasPlanningEntry.ts', () => ({
  AtlasPlanningEntry: { find: vi.fn(), deleteMany: vi.fn(), updateOne: vi.fn(), create: vi.fn() },
}))

const { AtlasRosterMember } = (await import('../src/models/AtlasRosterMember.ts')) as unknown as {
  AtlasRosterMember: MockedAtlasRosterMemberModel
}
const { AtlasTask } = (await import('../src/models/AtlasTask.ts')) as unknown as { AtlasTask: MockedAtlasTaskModel }
const { AtlasPlanningEntry } = (await import('../src/models/AtlasPlanningEntry.ts')) as unknown as {
  AtlasPlanningEntry: MockedAtlasPlanningEntryModel
}
const { reconcilePlanningEntries } = await import('../src/services/atlasPlanningSync.ts')

function rosterMember(id: string, jiraAccountId: string) {
  return { _id: id, personId: { _id: `p-${id}`, jiraAccountId } }
}

function task(id: string, jiraKey: string, status: 'To Do' | 'In Progress' | 'Done', assigneeAccountId: string | null) {
  return { _id: id, jiraKey, status, assigneeAccountId }
}

function entry(id: string, rosterMemberId: string, taskId: string, order: number) {
  return { _id: id, rosterMemberId, taskId, jiraKey: `key-${taskId}`, order, startDate: null, endDate: null }
}

function stubRoster(members: ReturnType<typeof rosterMember>[]) {
  AtlasRosterMember.find.mockReturnValue({ populate: vi.fn().mockResolvedValue(members) })
}

describe('reconcilePlanningEntries', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    AtlasPlanningEntry.create.mockResolvedValue(undefined)
    AtlasPlanningEntry.updateOne.mockResolvedValue(undefined)
    AtlasPlanningEntry.deleteMany.mockResolvedValue(undefined)
  })

  it('is a no-op with no roster and no tasks', async () => {
    stubRoster([])
    AtlasTask.find.mockResolvedValue([])
    AtlasPlanningEntry.find.mockResolvedValue([])

    await reconcilePlanningEntries()

    expect(AtlasPlanningEntry.create).not.toHaveBeenCalled()
    expect(AtlasPlanningEntry.deleteMany).not.toHaveBeenCalled()
  })

  it('initial load: seeds a person with no prior entries, In Progress tickets ordered before To Do', async () => {
    stubRoster([rosterMember('m1', 'acc1')])
    AtlasTask.find.mockResolvedValue([
      task('t1', 'WOSMVP-1', 'To Do', 'acc1'),
      task('t2', 'WOSMVP-2', 'In Progress', 'acc1'),
      task('t3', 'WOSMVP-3', 'Done', 'acc1'),
    ])
    AtlasPlanningEntry.find.mockResolvedValue([])

    await reconcilePlanningEntries()

    // Done tickets are never seeded.
    expect(AtlasPlanningEntry.create).toHaveBeenCalledTimes(2)
    const created = AtlasPlanningEntry.create.mock.calls.map((c) => c[0])
    expect(created[0]).toMatchObject({ rosterMemberId: 'm1', taskId: 't2', order: 0 })
    expect(created[1]).toMatchObject({ rosterMemberId: 'm1', taskId: 't1', order: 1 })
  })

  it('leaves a stationary entry (task still active, same assignee) untouched', async () => {
    stubRoster([rosterMember('m1', 'acc1')])
    AtlasTask.find.mockResolvedValue([task('t1', 'WOSMVP-1', 'In Progress', 'acc1')])
    AtlasPlanningEntry.find.mockResolvedValue([entry('e1', 'm1', 't1', 0)])

    await reconcilePlanningEntries()

    expect(AtlasPlanningEntry.create).not.toHaveBeenCalled()
    expect(AtlasPlanningEntry.updateOne).not.toHaveBeenCalled()
    expect(AtlasPlanningEntry.deleteMany).not.toHaveBeenCalled()
  })

  it('appends a newly-synced ticket at the end of a person who already has entries', async () => {
    stubRoster([rosterMember('m1', 'acc1')])
    AtlasTask.find.mockResolvedValue([
      task('t1', 'WOSMVP-1', 'To Do', 'acc1'),
      task('t2', 'WOSMVP-2', 'To Do', 'acc1'),
    ])
    AtlasPlanningEntry.find.mockResolvedValue([entry('e1', 'm1', 't1', 0)])

    await reconcilePlanningEntries()

    expect(AtlasPlanningEntry.create).toHaveBeenCalledWith(
      expect.objectContaining({ rosterMemberId: 'm1', taskId: 't2', order: 1 }),
    )
  })

  it('removes an entry once its ticket reaches Done', async () => {
    stubRoster([rosterMember('m1', 'acc1')])
    AtlasTask.find.mockResolvedValue([task('t1', 'WOSMVP-1', 'Done', 'acc1')])
    AtlasPlanningEntry.find.mockResolvedValue([entry('e1', 'm1', 't1', 0)])

    await reconcilePlanningEntries()

    expect(AtlasPlanningEntry.deleteMany).toHaveBeenCalledWith({ _id: { $in: ['e1'] } })
    expect(AtlasPlanningEntry.create).not.toHaveBeenCalled()
  })

  it('removes an entry whose task is archived/deleted from the board', async () => {
    stubRoster([rosterMember('m1', 'acc1')])
    AtlasTask.find.mockResolvedValue([]) // archived tasks are excluded by the { archived: false } query
    AtlasPlanningEntry.find.mockResolvedValue([entry('e1', 'm1', 't1', 0)])

    await reconcilePlanningEntries()

    expect(AtlasPlanningEntry.deleteMany).toHaveBeenCalledWith({ _id: { $in: ['e1'] } })
  })

  it('removes an entry whose assignee no longer maps to anyone on the roster', async () => {
    stubRoster([]) // acc1 is no longer on the roster
    AtlasTask.find.mockResolvedValue([task('t1', 'WOSMVP-1', 'To Do', 'acc1')])
    AtlasPlanningEntry.find.mockResolvedValue([entry('e1', 'm1', 't1', 0)])

    await reconcilePlanningEntries()

    expect(AtlasPlanningEntry.deleteMany).toHaveBeenCalledWith({ _id: { $in: ['e1'] } })
  })

  it('follows a Jira-side reassignment, appending the moved entry at the end of the new person\'s row', async () => {
    stubRoster([rosterMember('m1', 'acc1'), rosterMember('m2', 'acc2')])
    AtlasTask.find.mockResolvedValue([
      task('t1', 'WOSMVP-1', 'To Do', 'acc2'), // now assigned to acc2
      task('t9', 'WOSMVP-9', 'To Do', 'acc2'), // m2's existing ticket, still active/still theirs
    ])
    AtlasPlanningEntry.find.mockResolvedValue([
      entry('e1', 'm1', 't1', 0), // was on m1
      entry('e2', 'm2', 't9', 0), // m2 already has one ticket
    ])

    await reconcilePlanningEntries()

    expect(AtlasPlanningEntry.updateOne).toHaveBeenCalledWith(
      { _id: 'e1' },
      { $set: { rosterMemberId: 'm2', jiraKey: 'WOSMVP-1', order: 1 } },
    )
    expect(AtlasPlanningEntry.deleteMany).not.toHaveBeenCalled()
  })

  it('never seeds a task with no assignee or an unmapped assignee', async () => {
    stubRoster([rosterMember('m1', 'acc1')])
    AtlasTask.find.mockResolvedValue([
      task('t1', 'WOSMVP-1', 'To Do', null),
      task('t2', 'WOSMVP-2', 'To Do', 'acc-unmapped'),
    ])
    AtlasPlanningEntry.find.mockResolvedValue([])

    await reconcilePlanningEntries()

    expect(AtlasPlanningEntry.create).not.toHaveBeenCalled()
  })
})
