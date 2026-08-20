import { useEffect, useState } from 'react'
import type { AtlasRosterMember, Person } from '../types'

const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:4100'

// Read-only view of the Atlas roster (see useAtlasRoster.ts for the full
// CRUD hook backing the management panel) - just the Person list, for
// AtlasTaskBoard.tsx to resolve an assigneeAccountId to a name
// (utils/atlasAssignee.ts). Deliberately scoped to Atlas's own roster, not
// the full /api/people directory - a person not added to Atlas shows as
// "Unmapped" on the board even if they exist as a Person elsewhere in the
// app, since being on Atlas's roster is what "relevant to this task board"
// means (per the feature's own spec: bound to Atlas, not to any team).
export function useAtlasRosterPeople(): Person[] {
  const [people, setPeople] = useState<Person[]>([])

  useEffect(() => {
    let ignore = false
    fetch(`${API_URL}/api/atlas/roster`)
      .then((res) => (res.ok ? res.json() : []))
      .then((data: AtlasRosterMember[]) => {
        if (!ignore) setPeople(data.map((m) => m.personId))
      })
      .catch(() => {})
    return () => {
      ignore = true
    }
  }, [])

  return people
}
