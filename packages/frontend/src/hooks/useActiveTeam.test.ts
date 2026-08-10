import { act, renderHook, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from 'vitest'
import { useActiveTeam } from './useActiveTeam'
import type { Team } from '../types'

interface FakeResponse {
  ok: boolean
  status: number
  json: () => Promise<unknown>
}

function jsonResponse(body: unknown, ok = true): Promise<FakeResponse> {
  return Promise.resolve({
    ok,
    status: ok ? 200 : 500,
    json: () => Promise.resolve(body),
  })
}

const teamA: Team = { _id: 'team-a', name: 'Team A', jiraLabels: ['team-a-label'] }
const teamB: Team = { _id: 'team-b', name: 'Team B', jiraLabels: ['team-b-label'] }

// Mirrors App.test.tsx's stubFetch pattern (there's no existing
// useActiveProfile.test.ts to copy from - see ticket 16) so this hook's
// fallback/persistence behavior is verified the same way ProfileSwitcher's
// equivalent behavior already is, end-to-end, in App.test.tsx.
function stubFetch(teams: Team[]): Mock {
  const mock = vi.fn((url: string, init?: { method?: string; body?: string }) => {
    if (init?.method === 'POST') {
      const body = JSON.parse(init.body ?? '{}')
      return jsonResponse({ _id: 'team-new', name: body.name, jiraLabels: body.jiraLabels }, true)
    }
    if (init?.method === 'PATCH') {
      const body = JSON.parse(init.body ?? '{}')
      const id = String(url).split('/').pop()
      const existing = teams.find((t) => t._id === id)
      return jsonResponse({ ...existing, ...body }, true)
    }
    if (init?.method === 'DELETE') {
      return jsonResponse({}, true)
    }
    return jsonResponse(teams)
  })
  vi.stubGlobal('fetch', mock)
  return mock
}

describe('useActiveTeam', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    localStorage.clear()
  })

  it('falls back to the first team when nothing is stored', async () => {
    stubFetch([teamA, teamB])

    const { result } = renderHook(() => useActiveTeam())

    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.activeTeamId).toBe('team-a')
    expect(localStorage.getItem('planner-active-team-id')).toBe('team-a')
  })

  it('falls back to the first team when the stored id no longer exists', async () => {
    localStorage.setItem('planner-active-team-id', 'a-deleted-team-id')
    stubFetch([teamA, teamB])

    const { result } = renderHook(() => useActiveTeam())

    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.activeTeamId).toBe('team-a')
  })

  it('restores the stored team id when it still exists', async () => {
    localStorage.setItem('planner-active-team-id', 'team-b')
    stubFetch([teamA, teamB])

    const { result } = renderHook(() => useActiveTeam())

    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.activeTeamId).toBe('team-b')
  })

  it('resolves to null (not an error) when there are no teams at all', async () => {
    stubFetch([])

    const { result } = renderHook(() => useActiveTeam())

    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.activeTeamId).toBeNull()
    expect(result.current.error).toBeNull()
  })

  it('persists setActiveTeamId to localStorage', async () => {
    stubFetch([teamA, teamB])

    const { result } = renderHook(() => useActiveTeam())
    await waitFor(() => expect(result.current.loading).toBe(false))

    act(() => {
      result.current.setActiveTeamId('team-b')
    })

    expect(result.current.activeTeamId).toBe('team-b')
    expect(localStorage.getItem('planner-active-team-id')).toBe('team-b')
  })

  it('creates a team without switching into it', async () => {
    stubFetch([teamA])

    const { result } = renderHook(() => useActiveTeam())
    await waitFor(() => expect(result.current.loading).toBe(false))

    await act(async () => {
      await result.current.createTeam('Team C', ['team-c-label'])
    })

    expect(result.current.teams.map((t) => t.name)).toContain('Team C')
    expect(result.current.activeTeamId).toBe('team-a')
  })

  it('reassigns activeTeamId and localStorage after deleting the active team', async () => {
    stubFetch([teamA, teamB])

    const { result } = renderHook(() => useActiveTeam())
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.activeTeamId).toBe('team-a')

    await act(async () => {
      await result.current.deleteTeam('team-a')
    })

    expect(result.current.teams.map((t) => t._id)).toEqual(['team-b'])
    expect(result.current.activeTeamId).toBe('team-b')
    expect(localStorage.getItem('planner-active-team-id')).toBe('team-b')
  })

  it('falls back to null when deleting the last remaining team', async () => {
    stubFetch([teamA])

    const { result } = renderHook(() => useActiveTeam())
    await waitFor(() => expect(result.current.loading).toBe(false))

    await act(async () => {
      await result.current.deleteTeam('team-a')
    })

    expect(result.current.teams).toEqual([])
    expect(result.current.activeTeamId).toBeNull()
  })

  it('updates name and jiraLabels via updateTeam', async () => {
    stubFetch([teamA])

    const { result } = renderHook(() => useActiveTeam())
    await waitFor(() => expect(result.current.loading).toBe(false))

    await act(async () => {
      await result.current.updateTeam('team-a', { name: 'Renamed', jiraLabels: ['new-label'] })
    })

    const updated = result.current.teams.find((t) => t._id === 'team-a')
    expect(updated?.name).toBe('Renamed')
    expect(updated?.jiraLabels).toEqual(['new-label'])
  })
})
