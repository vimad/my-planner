import request from 'supertest'
import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest'

interface MockedSettingsModel {
  findOneAndUpdate: Mock
}

vi.mock('../src/models/Settings.ts', () => {
  return {
    Settings: {
      findOneAndUpdate: vi.fn(),
    },
  }
})

const { Settings } = (await import('../src/models/Settings.ts')) as unknown as {
  Settings: MockedSettingsModel
}
const { createApp } = await import('../src/app.ts')

describe('Settings routes', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('GET /api/settings', () => {
    it('returns the singleton settings document, upserting it into existence', async () => {
      Settings.findOneAndUpdate.mockResolvedValue({ nextOfficeDay: null })

      const app = createApp()
      const res = await request(app).get('/api/settings')

      expect(res.status).toBe(200)
      expect(res.body).toEqual({ nextOfficeDay: null })
      expect(Settings.findOneAndUpdate).toHaveBeenCalledWith(
        {},
        {},
        { upsert: true, new: true, setDefaultsOnInsert: true },
      )
    })
  })

  describe('PATCH /api/settings', () => {
    it('sets nextOfficeDay', async () => {
      Settings.findOneAndUpdate.mockResolvedValue({ nextOfficeDay: '2026-07-29' })

      const app = createApp()
      const res = await request(app).patch('/api/settings').send({ nextOfficeDay: '2026-07-29' })

      expect(res.status).toBe(200)
      expect(res.body.nextOfficeDay).toBe('2026-07-29')
      expect(Settings.findOneAndUpdate).toHaveBeenCalledWith(
        {},
        { nextOfficeDay: '2026-07-29' },
        { upsert: true, new: true, setDefaultsOnInsert: true },
      )
    })

    it('clears nextOfficeDay by passing null', async () => {
      Settings.findOneAndUpdate.mockResolvedValue({ nextOfficeDay: null })

      const app = createApp()
      const res = await request(app).patch('/api/settings').send({ nextOfficeDay: null })

      expect(res.status).toBe(200)
      expect(res.body.nextOfficeDay).toBeNull()
      expect(Settings.findOneAndUpdate).toHaveBeenCalledWith(
        {},
        { nextOfficeDay: null },
        { upsert: true, new: true, setDefaultsOnInsert: true },
      )
    })
  })
})
