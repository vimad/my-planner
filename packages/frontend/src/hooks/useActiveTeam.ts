import { useCallback, useEffect, useState } from 'react'
import { getId } from '../utils/getId'
import type { Team } from '../types'

const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:4100'
const STORAGE_KEY = 'planner-active-team-id'

async function parseErrorMessage(res: Response): Promise<string> {
  try {
    const data = await res.json()
    return data?.error ?? `Request failed with status ${res.status}`
  } catch {
    return `Request failed with status ${res.status}`
  }
}

function readStoredTeamId(): string | null {
  try {
    return localStorage.getItem(STORAGE_KEY)
  } catch {
    // Persistence is best-effort - see applyTheme's identical guard in
    // utils/theme.ts.
    return null
  }
}

function writeStoredTeamId(id: string): void {
  try {
    localStorage.setItem(STORAGE_KEY, id)
  } catch {
    // Best-effort; the in-memory selection still works for this session.
  }
}

export interface UseActiveTeamResult {
  teams: Team[]
  activeTeamId: string | null
  loading: boolean
  error: string | null
  setActiveTeamId: (id: string) => void
  createTeam: (name: string, jiraLabels: string[]) => Promise<void>
  updateTeam: (id: string, patch: { name?: string; jiraLabels?: string[] }) => Promise<void>
  deleteTeam: (id: string) => Promise<void>
}

// Structurally parallel to useActiveProfile.ts: fetches the team list,
// resolves the active id from localStorage (falling back to the first team
// if unset/stale), and persists every subsequent change back to
// localStorage. Unlike profiles, the team list may legitimately be empty
// (no "last remaining team" guard on the backend - see routes/teams.ts) -
// callers must tolerate activeTeamId resolving to null.
export function useActiveTeam(): UseActiveTeamResult {
  const [teams, setTeams] = useState<Team[]>([])
  const [activeTeamId, setActiveTeamIdState] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const setActiveTeamId = useCallback((id: string) => {
    setActiveTeamIdState(id)
    writeStoredTeamId(id)
  }, [])

  useEffect(() => {
    let ignore = false

    async function load() {
      setLoading(true)
      setError(null)
      try {
        const res = await fetch(`${API_URL}/api/teams`)
        if (!res.ok) throw new Error(await parseErrorMessage(res))
        const data: Team[] = await res.json()
        if (ignore) return

        setTeams(data)

        const stored = readStoredTeamId()
        const storedStillExists = stored !== null && data.some((team) => getId(team) === stored)
        const resolved = storedStillExists ? stored : (getId(data[0]) ?? null)

        setActiveTeamIdState(resolved)
        if (resolved) writeStoredTeamId(resolved)
      } catch (err) {
        if (!ignore) setError((err as Error).message)
      } finally {
        if (!ignore) setLoading(false)
      }
    }

    load()

    return () => {
      ignore = true
    }
  }, [])

  // Deliberately does not switch into the newly created team - "Manage
  // teams" bundles create/rename/delete into one panel behind the gear icon
  // (unlike ProfileSwitcher's inline "+Profile", which does auto-switch),
  // so switching afterward is its own explicit action via the tab row.
  const createTeam = useCallback(async (name: string, jiraLabels: string[]) => {
    setError(null)
    try {
      const res = await fetch(`${API_URL}/api/teams`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, jiraLabels }),
      })
      if (!res.ok) throw new Error(await parseErrorMessage(res))
      const created: Team = await res.json()
      setTeams((prev) => [...prev, created])
    } catch (err) {
      setError((err as Error).message)
      throw err
    }
  }, [])

  // Single entry point for both rename and jiraLabels edits (mirrors the
  // backend's PATCH /api/teams/:id, which accepts either field
  // independently) rather than two near-identical functions.
  const updateTeam = useCallback(async (id: string, patch: { name?: string; jiraLabels?: string[] }) => {
    setError(null)
    try {
      const res = await fetch(`${API_URL}/api/teams/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(patch),
      })
      if (!res.ok) throw new Error(await parseErrorMessage(res))
      const updated: Team = await res.json()
      setTeams((prev) => prev.map((team) => (getId(team) === id ? updated : team)))
    } catch (err) {
      setError((err as Error).message)
      throw err
    }
  }, [])

  // Mirrors deleteProfile's active-id fallback: if the deleted team was the
  // active one, lands on whichever team is now first in the remaining list
  // (or null, if none remain) and persists that choice.
  const deleteTeam = useCallback(
    async (id: string) => {
      setError(null)
      try {
        const res = await fetch(`${API_URL}/api/teams/${id}`, { method: 'DELETE' })
        if (!res.ok) throw new Error(await parseErrorMessage(res))
        setTeams((prev) => {
          const remaining = prev.filter((team) => getId(team) !== id)
          if (id === activeTeamId) {
            const fallback = getId(remaining[0]) ?? null
            setActiveTeamIdState(fallback)
            if (fallback) writeStoredTeamId(fallback)
          }
          return remaining
        })
      } catch (err) {
        setError((err as Error).message)
        throw err
      }
    },
    [activeTeamId],
  )

  return {
    teams,
    activeTeamId,
    loading,
    error,
    setActiveTeamId,
    createTeam,
    updateTeam,
    deleteTeam,
  }
}
