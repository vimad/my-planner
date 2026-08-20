import { useEffect, useState } from 'react'
import type { Person } from '../types'

const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:4100'

// The full, not-team-scoped Person directory (GET /api/people) - the same
// list useTeamRoster.ts's "add existing person" autocomplete searches over.
// Fetched independently here rather than via useTeamRoster since Atlas has
// no team scoping at all (spec.md §1), so there's no team-scoped roster to
// piggyback on. Silently degrades to an empty list on failure - used only to
// resolve a nicer assignee label (utils/atlasAssignee.ts), never to gate
// anything load-bearing.
export function usePeopleDirectory(): Person[] {
  const [people, setPeople] = useState<Person[]>([])

  useEffect(() => {
    let ignore = false
    fetch(`${API_URL}/api/people`)
      .then((res) => (res.ok ? res.json() : []))
      .then((data: Person[]) => {
        if (!ignore) setPeople(data)
      })
      .catch(() => {})
    return () => {
      ignore = true
    }
  }, [])

  return people
}
