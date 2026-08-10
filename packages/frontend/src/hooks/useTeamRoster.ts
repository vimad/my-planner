import { useCallback, useEffect, useState } from 'react'
import type { JiraUserSuggestion, Person, Role, TeamMembership } from '../types'

const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:4100'

async function parseErrorMessage(res: Response): Promise<string> {
  try {
    const data = await res.json()
    return data?.error ?? `Request failed with status ${res.status}`
  } catch {
    return `Request failed with status ${res.status}`
  }
}

// GET /api/team-memberships?teamId= populates Person; POST's response does
// not (see routes/teamMemberships.ts - only the PATCH handler populates).
// Re-fetching the whole roster after a create is simpler and less
// error-prone than reconstructing the populated shape client-side from the
// `people` list.
function fetchMemberships(teamId: string): Promise<TeamMembership[]> {
  return fetch(`${API_URL}/api/team-memberships?teamId=${teamId}`).then(async (res) => {
    if (!res.ok) throw new Error(await parseErrorMessage(res))
    return res.json()
  })
}

export interface NewPersonInput {
  name: string
  email: string
  jiraAccountId: string
}

export interface UseTeamRosterResult {
  memberships: TeamMembership[]
  people: Person[]
  loading: boolean
  error: string | null
  addExistingPerson: (personId: string, role: Role, capacityPercentOverride?: number | null) => Promise<void>
  addNewPerson: (person: NewPersonInput, role: Role, capacityPercentOverride?: number | null) => Promise<void>
  updateMembership: (id: string, patch: { role?: Role; capacityPercentOverride?: number | null }) => Promise<void>
  removeMembership: (id: string) => Promise<void>
  searchJiraUsers: (query: string) => Promise<JiraUserSuggestion[] | null>
}

// Backs ticket 17's roster sub-view: a team's TeamMembership rows (Person
// populated, per ticket 12's GET contract) plus the full, not-team-scoped
// Person list the "add existing person" autocomplete searches over. Both
// are fetched together since the roster panel that mounts this hook only
// ever needs them as a pair - there's no standalone "just the roster"
// consumer yet.
export function useTeamRoster(teamId: string | null): UseTeamRosterResult {
  const [memberships, setMemberships] = useState<TeamMembership[]>([])
  const [people, setPeople] = useState<Person[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!teamId) {
      setMemberships([])
      setPeople([])
      setLoading(false)
      return
    }

    let ignore = false

    async function load() {
      setLoading(true)
      setError(null)
      try {
        const [membershipsData, peopleRes] = await Promise.all([
          fetchMemberships(teamId as string),
          fetch(`${API_URL}/api/people`),
        ])
        if (!peopleRes.ok) throw new Error(await parseErrorMessage(peopleRes))
        const peopleData: Person[] = await peopleRes.json()
        if (ignore) return
        setMemberships(membershipsData)
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
  }, [teamId])

  const addExistingPerson = useCallback(
    async (personId: string, role: Role, capacityPercentOverride?: number | null) => {
      if (!teamId) return
      setError(null)
      try {
        const res = await fetch(`${API_URL}/api/team-memberships`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ teamId, personId, role, capacityPercentOverride }),
        })
        if (!res.ok) throw new Error(await parseErrorMessage(res))
        const refreshed = await fetchMemberships(teamId)
        setMemberships(refreshed)
      } catch (err) {
        setError((err as Error).message)
        throw err
      }
    },
    [teamId],
  )

  // Creates the Person first (POST /api/people), then the membership -
  // "in the same step" per the ticket. If the membership POST fails (e.g. a
  // duplicate that raced with another tab), the Person still exists and is
  // picked up by a subsequent addExistingPerson via the roster's autocomplete;
  // no rollback attempted here.
  const addNewPerson = useCallback(
    async (person: NewPersonInput, role: Role, capacityPercentOverride?: number | null) => {
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
        await addExistingPerson(personId, role, capacityPercentOverride)
      } catch (err) {
        setError((err as Error).message)
        throw err
      }
    },
    [addExistingPerson],
  )

  const updateMembership = useCallback(
    async (id: string, patch: { role?: Role; capacityPercentOverride?: number | null }) => {
      setError(null)
      try {
        const res = await fetch(`${API_URL}/api/team-memberships/${id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(patch),
        })
        if (!res.ok) throw new Error(await parseErrorMessage(res))
        const updated: TeamMembership = await res.json()
        setMemberships((prev) => prev.map((m) => ((m._id ?? m.id) === id ? updated : m)))
      } catch (err) {
        setError((err as Error).message)
        throw err
      }
    },
    [],
  )

  const removeMembership = useCallback(async (id: string) => {
    setError(null)
    try {
      const res = await fetch(`${API_URL}/api/team-memberships/${id}`, { method: 'DELETE' })
      if (!res.ok) throw new Error(await parseErrorMessage(res))
      setMemberships((prev) => prev.filter((m) => (m._id ?? m.id) !== id))
    } catch (err) {
      setError((err as Error).message)
      throw err
    }
  }, [])

  // Never throws - a missing "Browse users and groups" permission surfaces
  // as a 200 with a `null` body (see routes/people.ts), and this must
  // degrade the caller's autocomplete silently rather than raising an error
  // banner for what's explicitly an optional convenience (spec).
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
    memberships,
    people,
    loading,
    error,
    addExistingPerson,
    addNewPerson,
    updateMembership,
    removeMembership,
    searchJiraUsers,
  }
}
