import { useCallback, useEffect, useState } from 'react'
import { getId } from '../utils/getId'
import type { Sprint, Status, TeamMembership, Ticket } from '../types'

const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:4100'

async function parseErrorMessage(res: Response): Promise<string> {
  try {
    const data = await res.json()
    return data?.error ?? `Request failed with status ${res.status}`
  } catch {
    return `Request failed with status ${res.status}`
  }
}

export interface UseStatusViewResult {
  sprints: Sprint[]
  loadingSprints: boolean
  sprintsError: string | null
  selectedSprintId: string | null
  setSelectedSprintId: (id: string) => void

  memberships: TeamMembership[]
  loadingMemberships: boolean

  statuses: Status[]
  loadingStatuses: boolean

  // Every cached Ticket in the team's label filter + selected sprint (GET
  // /api/tickets?teamId=&sprintId=, ticket 21's backend gap-fill alongside
  // ticket 15's Status model/Lightweight sync) - the roster's per-person
  // ticket count/last-synced and the selected person's board are both
  // derived from this one list client-side, never a second per-person
  // fetch.
  tickets: Ticket[]
  loadingTickets: boolean
  ticketsError: string | null

  // A Person id (matches TeamMembership.personId's populated _id, and the
  // POST /api/status-sync body's `personId`) - auto-selects the roster's
  // first member once memberships load, same "fall back to first" default
  // as useSprintPlan's sprint selection.
  selectedPersonId: string | null
  setSelectedPersonId: (id: string) => void

  syncingPersonId: string | null
  syncError: string | null
  // POST /api/status-sync (ticket 15) for one roster row's sync icon.
  // Refetches `tickets` on success rather than merging the response
  // in-place - same "always re-read from GET" convention as
  // useSprintPlan's refreshPlan - so a reassignment or newly-discovered
  // ticket lands correctly without bespoke merge logic.
  syncPerson: (personId: string) => Promise<void>
}

// Backs ticket 21's Status view: sprint selector, roster sidebar (ticket
// count/last-synced/per-person sync), and the selected person's
// occupied-columns-only board (ADR 0003). Four independent fetches
// (sprints, memberships, statuses, tickets), same "each has its own
// loading/error lifecycle" convention as useSprintPlan.
export function useStatusView(teamId: string | null): UseStatusViewResult {
  const [sprints, setSprints] = useState<Sprint[]>([])
  const [loadingSprints, setLoadingSprints] = useState(true)
  const [sprintsError, setSprintsError] = useState<string | null>(null)
  const [selectedSprintId, setSelectedSprintId] = useState<string | null>(null)

  const [memberships, setMemberships] = useState<TeamMembership[]>([])
  const [loadingMemberships, setLoadingMemberships] = useState(true)
  const [selectedPersonId, setSelectedPersonId] = useState<string | null>(null)

  const [statuses, setStatuses] = useState<Status[]>([])
  const [loadingStatuses, setLoadingStatuses] = useState(true)

  const [tickets, setTickets] = useState<Ticket[]>([])
  const [loadingTickets, setLoadingTickets] = useState(true)
  const [ticketsError, setTicketsError] = useState<string | null>(null)
  const [refreshTick, setRefreshTick] = useState(0)

  const [syncingPersonId, setSyncingPersonId] = useState<string | null>(null)
  const [syncError, setSyncError] = useState<string | null>(null)

  // Sprint list - mirrors useSprintPlan's sprint effect exactly (re-selects
  // an active sprint, falling back to the first, whenever the previously
  // selected id is missing from the fresh list - also covers a team switch).
  useEffect(() => {
    if (!teamId) {
      setSprints([])
      setSelectedSprintId(null)
      setLoadingSprints(false)
      return
    }

    let ignore = false
    setLoadingSprints(true)
    setSprintsError(null)

    fetch(`${API_URL}/api/sprints?teamId=${teamId}`)
      .then(async (res) => {
        if (!res.ok) throw new Error(await parseErrorMessage(res))
        return (await res.json()) as Sprint[]
      })
      .then((data) => {
        if (ignore) return
        setSprints(data)
        setSelectedSprintId((prev) => {
          if (prev && data.some((s) => getId(s) === prev)) return prev
          const active = data.find((s) => s.state === 'active')
          return getId(active ?? data[0]) ?? null
        })
      })
      .catch((err) => {
        if (!ignore) setSprintsError((err as Error).message)
      })
      .finally(() => {
        if (!ignore) setLoadingSprints(false)
      })

    return () => {
      ignore = true
    }
  }, [teamId])

  // Team roster - independent of which sprint is selected. Auto-selects the
  // first member (falling back the same way if the previously selected
  // person left the roster) so the board has something to show without
  // requiring an explicit first click.
  useEffect(() => {
    if (!teamId) {
      setMemberships([])
      setSelectedPersonId(null)
      setLoadingMemberships(false)
      return
    }

    let ignore = false
    setLoadingMemberships(true)

    fetch(`${API_URL}/api/team-memberships?teamId=${teamId}`)
      .then(async (res) => {
        if (!res.ok) throw new Error(await parseErrorMessage(res))
        return (await res.json()) as TeamMembership[]
      })
      .then((data) => {
        if (ignore) return
        setMemberships(data)
        setSelectedPersonId((prev) => {
          if (prev && data.some((m) => getId(m.personId) === prev)) return prev
          return getId(data[0]?.personId) ?? null
        })
      })
      .catch(() => {
        // Surfaced via the tickets error path instead of a second banner -
        // the roster just renders empty until it settles.
      })
      .finally(() => {
        if (!ignore) setLoadingMemberships(false)
      })

    return () => {
      ignore = true
    }
  }, [teamId])

  // Locally-mirrored workflow-status set - global (not team/sprint scoped),
  // fetched once. Refreshed server-side as a side effect of every sync
  // action (services/statusSync.ts); re-fetching here on every sync isn't
  // needed for the board to render correctly (a brand-new status column
  // would only ever appear alongside a ticket that's also freshly synced).
  useEffect(() => {
    let ignore = false
    setLoadingStatuses(true)

    fetch(`${API_URL}/api/statuses`)
      .then(async (res) => {
        if (!res.ok) throw new Error(await parseErrorMessage(res))
        return (await res.json()) as Status[]
      })
      .then((data) => {
        if (!ignore) setStatuses(data)
      })
      .catch(() => {
        // No dedicated banner for this - an empty/stale status set just
        // means no columns render, same end state as "nothing synced yet".
      })
      .finally(() => {
        if (!ignore) setLoadingStatuses(false)
      })

    return () => {
      ignore = true
    }
  }, [])

  // Cached tickets in scope - re-run on team/sprint change or an explicit
  // sync (refreshTick).
  useEffect(() => {
    if (!teamId || !selectedSprintId) {
      setTickets([])
      setLoadingTickets(false)
      return
    }

    let ignore = false
    setLoadingTickets(true)
    setTicketsError(null)

    fetch(`${API_URL}/api/tickets?teamId=${teamId}&sprintId=${selectedSprintId}`)
      .then(async (res) => {
        if (!res.ok) throw new Error(await parseErrorMessage(res))
        return (await res.json()) as Ticket[]
      })
      .then((data) => {
        if (!ignore) setTickets(data)
      })
      .catch((err) => {
        if (!ignore) setTicketsError((err as Error).message)
      })
      .finally(() => {
        if (!ignore) setLoadingTickets(false)
      })

    return () => {
      ignore = true
    }
  }, [teamId, selectedSprintId, refreshTick])

  const syncPerson = useCallback(
    async (personId: string) => {
      if (!teamId || !selectedSprintId) return
      setSyncingPersonId(personId)
      setSyncError(null)
      try {
        const res = await fetch(`${API_URL}/api/status-sync`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ teamId, personId, sprintId: selectedSprintId }),
        })
        if (!res.ok) throw new Error(await parseErrorMessage(res))
        setRefreshTick((t) => t + 1)
      } catch (err) {
        setSyncError((err as Error).message)
        throw err
      } finally {
        setSyncingPersonId(null)
      }
    },
    [teamId, selectedSprintId],
  )

  return {
    sprints,
    loadingSprints,
    sprintsError,
    selectedSprintId,
    setSelectedSprintId,
    memberships,
    loadingMemberships,
    statuses,
    loadingStatuses,
    tickets,
    loadingTickets,
    ticketsError,
    selectedPersonId,
    setSelectedPersonId,
    syncingPersonId,
    syncError,
    syncPerson,
  }
}
