import { act, renderHook } from '@testing-library/react'
import { afterEach, describe, expect, it, vi, type Mock } from 'vitest'
import { useStandup } from './useStandup'
import type { Standup } from '../types'

// Scoped to this hook's own polling/date-rollover behavior - the request/
// response flow for starting a standup and running a person's timer is
// already covered end-to-end through the component in
// components/StatusView.test.tsx. What's unique here (and awkward to drive
// through that component test's real-timer-based `waitFor`) is proving the
// 60s poll actually flips `today` and re-fetches once the client's clock
// crosses midnight, dropping a stale day's standup.

interface FakeResponse {
  ok: boolean
  status: number
  json: () => Promise<unknown>
}

function jsonResponse(body: unknown, status = 200): Promise<FakeResponse> {
  return Promise.resolve({ ok: status < 400, status, json: () => Promise.resolve(body) })
}

function stubFetch(standupsByDate: Record<string, Standup>): Mock {
  const mock = vi.fn((url: string) => {
    const href = String(url)
    const date = new URL(href).searchParams.get('date') ?? ''
    const standup = standupsByDate[date]
    return standup ? jsonResponse(standup) : jsonResponse({ error: 'No standup started for this day' }, 404)
  })
  vi.stubGlobal('fetch', mock)
  return mock
}

describe('useStandup', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.useRealTimers()
  })

  it("re-fetches with the client's new local date once the clock rolls into the next day, dropping a stale standup", async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-08-19T23:59:00'))

    const standupAug19: Standup = { _id: 'standup-1', teamId: 't1', date: '2026-08-19', entries: [], endedAt: null }
    const fetchMock = stubFetch({ '2026-08-19': standupAug19 })

    const { result } = renderHook(() => useStandup('t1'))

    await act(async () => {
      await vi.advanceTimersByTimeAsync(0)
    })
    expect(result.current.standup).toEqual(standupAug19)
    expect(fetchMock).toHaveBeenCalledWith('http://localhost:4100/api/standups?teamId=t1&date=2026-08-19')

    vi.setSystemTime(new Date('2026-08-20T00:02:00'))
    await act(async () => {
      await vi.advanceTimersByTimeAsync(60_000)
    })

    expect(fetchMock).toHaveBeenCalledWith('http://localhost:4100/api/standups?teamId=t1&date=2026-08-20')
    expect(result.current.standup).toBeNull()
  })
})
