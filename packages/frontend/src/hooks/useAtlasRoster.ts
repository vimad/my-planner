import { useCallback, useEffect, useState } from 'react'
import type { AtlasRosterMember, JiraUserSuggestion, Person } from '../types'

const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:4100'

async function parseErrorMessage(res: Response): Promise<string> {
  try {
    const data = await res.json()
    return data?.error ?? `Request failed with status ${res.status}`
  } catch {
    return `Request failed with status ${res.status}`
  }
}

// GET /api/atlas/roster populates Person; POST's response does not (see
// routes/atlasRoster.ts - only GET populates). Re-fetching the whole roster
// after a create is simpler and less error-prone than reconstructing the
// populated shape client-side - same convention as useTeamRoster.ts's
// fetchMemberships.
function fetchRoster(): Promise<AtlasRosterMember[]> {
  return fetch(`${API_URL}/api/atlas/roster`).then(async (res) => {
    if (!res.ok) throw new Error(await parseErrorMessage(res))
    return res.json()
  })
}

export interface NewAtlasPersonInput {
  name: string
  email: string
  jiraAccountId: string
}

export interface UseAtlasRosterResult {
  roster: AtlasRosterMember[]
  people: Person[]
  loading: boolean
  error: string | null
  addExistingPerson: (personId: string) => Promise<void>
  addNewPerson: (person: NewAtlasPersonInput) => Promise<void>
  removeMember: (id: string) => Promise<void>
  searchJiraUsers: (query: string) => Promise<JiraUserSuggestion[] | null>
}

// Backs the "Atlas people" panel (AtlasPeopleButton.tsx) - Atlas's own
// roster (AtlasRosterMember rows, Person populated) plus the full,
// not-team-scoped Person list the "add existing person" autocomplete
// searches over. Mirrors useTeamRoster.ts's pairing but with no teamId
// (there is exactly one Atlas roster) and no role/capacity mutation surface
// - Atlas only needs identity (utils/atlasAssignee.ts).
export function useAtlasRoster(): UseAtlasRosterResult {
  const [roster, setRoster] = useState<AtlasRosterMember[]>([])
  const [people, setPeople] = useState<Person[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let ignore = false

    async function load() {
      setLoading(true)
      setError(null)
      try {
        const [rosterData, peopleRes] = await Promise.all([fetchRoster(), fetch(`${API_URL}/api/people`)])
        if (!peopleRes.ok) throw new Error(await parseErrorMessage(peopleRes))
        const peopleData: Person[] = await peopleRes.json()
        if (ignore) return
        setRoster(rosterData)
        setPeople(peopleData)
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

  const addExistingPerson = useCallback(async (personId: string) => {
    setError(null)
    try {
      const res = await fetch(`${API_URL}/api/atlas/roster`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ personId }),
      })
      if (!res.ok) throw new Error(await parseErrorMessage(res))
      const refreshed = await fetchRoster()
      setRoster(refreshed)
    } catch (err) {
      setError((err as Error).message)
      throw err
    }
  }, [])

  // Creates the Person first (POST /api/people), then the roster entry - in
  // the same step, same convention as useTeamRoster.ts's addNewPerson.
  const addNewPerson = useCallback(
    async (person: NewAtlasPersonInput) => {
      setError(null)
      try {
        const personRes = await fetch(`${API_URL}/api/people`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(person),
        })
        if (!personRes.ok) throw new Error(await parseErrorMessage(personRes))
        const createdPerson: Person = await personRes.json()
        setPeople((prev) => [...prev, createdPerson])

        const personId = createdPerson._id ?? createdPerson.id
        if (!personId) throw new Error('Created person has no id')
        await addExistingPerson(personId)
      } catch (err) {
        setError((err as Error).message)
        throw err
      }
    },
    [addExistingPerson],
  )

  const removeMember = useCallback(async (id: string) => {
    setError(null)
    try {
      const res = await fetch(`${API_URL}/api/atlas/roster/${id}`, { method: 'DELETE' })
      if (!res.ok) throw new Error(await parseErrorMessage(res))
      setRoster((prev) => prev.filter((m) => (m._id ?? m.id) !== id))
    } catch (err) {
      setError((err as Error).message)
      throw err
    }
  }, [])

  // Never throws - a missing "Browse users and groups" permission surfaces
  // as a 200 with a `null` body (see routes/people.ts), and this must
  // degrade the caller's autocomplete silently rather than raising an error
  // banner for what's explicitly an optional convenience.
  const searchJiraUsers = useCallback(async (query: string): Promise<JiraUserSuggestion[] | null> => {
    try {
      const res = await fetch(`${API_URL}/api/people/jira-search?query=${encodeURIComponent(query)}`)
      if (!res.ok) return null
      return (await res.json()) as JiraUserSuggestion[] | null
    } catch {
      return null
    }
  }, [])

  return {
    roster,
    people,
    loading,
    error,
    addExistingPerson,
    addNewPerson,
    removeMember,
    searchJiraUsers,
  }
}
