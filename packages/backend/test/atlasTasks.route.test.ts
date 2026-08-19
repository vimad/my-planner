import request from 'supertest'
import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest'

interface MockedAtlasTaskModel {
  findByIdAndUpdate: Mock
}

vi.mock('../src/models/AtlasTask.ts', () => ({ AtlasTask: { findByIdAndUpdate: vi.fn() } }))

const { AtlasTask } = (await import('../src/models/AtlasTask.ts')) as unknown as { AtlasTask: MockedAtlasTaskModel }
const { createApp } = await import('../src/app.ts')

describe('PATCH /api/atlas/tasks/:id', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('updates startDate/endDate and returns the updated task', async () => {
    AtlasTask.findByIdAndUpdate.mockResolvedValue({ _id: 't1', startDate: '2026-08-01', endDate: '2026-08-10' })

    const app = createApp()
    const res = await request(app)
      .patch('/api/atlas/tasks/t1')
      .send({ startDate: '2026-08-01', endDate: '2026-08-10' })

    expect(res.status).toBe(200)
    expect(res.body.startDate).toBe('2026-08-01')
    const [id, update] = AtlasTask.findByIdAndUpdate.mock.calls[0]
    expect(id).toBe('t1')
    expect(update).toEqual({ startDate: '2026-08-01', endDate: '2026-08-10' })
  })

  it('allows clearing a date back to null', async () => {
    AtlasTask.findByIdAndUpdate.mockResolvedValue({ _id: 't1', startDate: null })

    const app = createApp()
    const res = await request(app).patch('/api/atlas/tasks/t1').send({ startDate: null })

    expect(res.status).toBe(200)
    const [, update] = AtlasTask.findByIdAndUpdate.mock.calls[0]
    expect(update).toEqual({ startDate: null })
  })

  it('rejects a malformed startDate', async () => {
    const app = createApp()
    const res = await request(app).patch('/api/atlas/tasks/t1').send({ startDate: 'not-a-date' })

    expect(res.status).toBe(400)
    expect(AtlasTask.findByIdAndUpdate).not.toHaveBeenCalled()
  })

  it('rejects a malformed endDate', async () => {
    const app = createApp()
    const res = await request(app).patch('/api/atlas/tasks/t1').send({ endDate: '2026-13-40' })

    expect(res.status).toBe(400)
    expect(AtlasTask.findByIdAndUpdate).not.toHaveBeenCalled()
  })

  it('saves notes and derives notesText from the Tiptap JSON', async () => {
    AtlasTask.findByIdAndUpdate.mockResolvedValue({ _id: 't1' })
    const notes = { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Waiting on vendor' }] }] }

    const app = createApp()
    const res = await request(app).patch('/api/atlas/tasks/t1').send({ notes })

    expect(res.status).toBe(200)
    const [, update] = AtlasTask.findByIdAndUpdate.mock.calls[0]
    expect(update.notes).toEqual(notes)
    expect(update.notesText).toBe('Waiting on vendor')
  })

  it('clearing notes back to null also clears notesText', async () => {
    AtlasTask.findByIdAndUpdate.mockResolvedValue({ _id: 't1' })

    const app = createApp()
    const res = await request(app).patch('/api/atlas/tasks/t1').send({ notes: null })

    expect(res.status).toBe(200)
    const [, update] = AtlasTask.findByIdAndUpdate.mock.calls[0]
    expect(update.notes).toBeNull()
    expect(update.notesText).toBe('')
  })

  it('setting atRisk manually also flips atRiskOverride to true, making the override sticky', async () => {
    AtlasTask.findByIdAndUpdate.mockResolvedValue({ _id: 't1', atRisk: true, atRiskOverride: true })

    const app = createApp()
    const res = await request(app).patch('/api/atlas/tasks/t1').send({ atRisk: true })

    expect(res.status).toBe(200)
    const [, update] = AtlasTask.findByIdAndUpdate.mock.calls[0]
    expect(update).toEqual({ atRisk: true, atRiskOverride: true })
  })

  it('a request that never mentions atRisk never touches atRisk/atRiskOverride at all', async () => {
    AtlasTask.findByIdAndUpdate.mockResolvedValue({ _id: 't1' })

    const app = createApp()
    await request(app).patch('/api/atlas/tasks/t1').send({ startDate: '2026-08-01' })

    const [, update] = AtlasTask.findByIdAndUpdate.mock.calls[0]
    expect(update).not.toHaveProperty('atRisk')
    expect(update).not.toHaveProperty('atRiskOverride')
  })

  it('replaces blockedBy wholesale, with no cycle validation of any kind', async () => {
    AtlasTask.findByIdAndUpdate.mockResolvedValue({ _id: 't1', blockedBy: ['a', 'b'] })

    const app = createApp()
    const res = await request(app).patch('/api/atlas/tasks/t1').send({ blockedBy: ['a', 'b'] })

    expect(res.status).toBe(200)
    const [, update] = AtlasTask.findByIdAndUpdate.mock.calls[0]
    expect(update.blockedBy).toEqual(['a', 'b'])
  })

  it('returns 404 when the task does not exist', async () => {
    AtlasTask.findByIdAndUpdate.mockResolvedValue(null)

    const app = createApp()
    const res = await request(app).patch('/api/atlas/tasks/missing').send({ startDate: '2026-08-01' })

    expect(res.status).toBe(404)
  })

  it('passes an unexpected error to the error handler (500)', async () => {
    AtlasTask.findByIdAndUpdate.mockRejectedValue(new Error('boom'))

    const app = createApp()
    const res = await request(app).patch('/api/atlas/tasks/t1').send({ startDate: '2026-08-01' })

    expect(res.status).toBe(500)
  })
})
