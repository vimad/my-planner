import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest'

vi.mock('../src/services/jiraClient.ts', () => ({
  resolveBoard: vi.fn(),
  getBoardConfiguration: vi.fn(),
}))

interface MockedStatusModel {
  findOneAndUpdate: Mock
  deleteMany: Mock
}

vi.mock('../src/models/Status.ts', () => ({
  Status: {
    findOneAndUpdate: vi.fn(),
    deleteMany: vi.fn(),
  },
}))

const { resolveBoard, getBoardConfiguration } = (await import('../src/services/jiraClient.ts')) as unknown as {
  resolveBoard: Mock
  getBoardConfiguration: Mock
}
const { Status } = (await import('../src/models/Status.ts')) as unknown as { Status: MockedStatusModel }
const { refreshStatusSet } = await import('../src/services/statusSync.ts')

describe('refreshStatusSet', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    Status.findOneAndUpdate.mockResolvedValue(undefined)
    Status.deleteMany.mockResolvedValue(undefined)
  })

  it('does nothing when the board cannot be resolved', async () => {
    resolveBoard.mockResolvedValue(null)

    await refreshStatusSet()

    expect(getBoardConfiguration).not.toHaveBeenCalled()
    expect(Status.findOneAndUpdate).not.toHaveBeenCalled()
  })

  it('upserts one Status per board column, in column order, with category inferred from position', async () => {
    resolveBoard.mockResolvedValue({ id: 235, name: 'Odyssey', type: 'scrum' })
    getBoardConfiguration.mockResolvedValue({
      columnConfig: { columns: [{ name: 'To Do' }, { name: 'In Progress' }, { name: 'In Review' }, { name: 'Done' }] },
    })

    await refreshStatusSet()

    expect(resolveBoard).toHaveBeenCalledWith('WOSMVP', 'Odyssey')
    expect(getBoardConfiguration).toHaveBeenCalledWith(235)
    expect(Status.findOneAndUpdate).toHaveBeenCalledTimes(4)
    expect(Status.findOneAndUpdate).toHaveBeenCalledWith(
      { name: 'To Do' },
      expect.objectContaining({ name: 'To Do', order: 0, category: 'todo' }),
      { upsert: true },
    )
    expect(Status.findOneAndUpdate).toHaveBeenCalledWith(
      { name: 'In Progress' },
      expect.objectContaining({ name: 'In Progress', order: 1, category: 'in_progress' }),
      { upsert: true },
    )
    expect(Status.findOneAndUpdate).toHaveBeenCalledWith(
      { name: 'In Review' },
      expect.objectContaining({ name: 'In Review', order: 2, category: 'in_progress' }),
      { upsert: true },
    )
    expect(Status.findOneAndUpdate).toHaveBeenCalledWith(
      { name: 'Done' },
      expect.objectContaining({ name: 'Done', order: 3, category: 'done' }),
      { upsert: true },
    )
  })

  it('deletes any Status no longer present among the board columns (wholesale refresh)', async () => {
    resolveBoard.mockResolvedValue({ id: 235, name: 'Odyssey', type: 'scrum' })
    getBoardConfiguration.mockResolvedValue({ columnConfig: { columns: [{ name: 'To Do' }, { name: 'Done' }] } })

    await refreshStatusSet()

    expect(Status.deleteMany).toHaveBeenCalledWith({ name: { $nin: ['To Do', 'Done'] } })
  })
})
