import { useCallback, useEffect, useState } from 'react'
import { getId } from '../utils/getId'
import type { Sprint, SprintCapacity, SprintPlanEntry, TeamMembership } from '../types'

const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:4100'

async function parseErrorMessage(res: Response): Promise<string> {
  try {
    const data = await res.json()
    return data?.error ?? `Request failed with status ${res.status}`
  } catch {
    return `Request failed with status ${res.status}`
  }
}

// Accepts a bare number ("14802"), a full key ("WOSMVP-14802"), or a
// lowercase/no-dash variant, and normalizes to the full key - mirrors the
// prototype's useSprintPlanState.normalizeInput. Returns null for blank
// input.
function normalizeJiraKey(raw: string): string | null {
  const trimmed = raw
    .trim()
    .toUpperCase()
    .replace(/^WOSMVP-?/, '')
  return trimmed ? `WOSMVP-${trimmed}` : null
}

interface PlanFetchResult {
  planConfigured: boolean
  capacity: SprintCapacity[]
  entries: SprintPlanEntry[]
}

// One row-reorder's worth of a save-on-drop PATCH (ticket 19): `field` picks
// which of SprintPlanEntry's three independent order namespaces this
// placement belongs to (see SprintPlanEntry.ts) - a non-split placement
// always patches `order`, a Split ticket's dev-row or qa-row placement
// patches only that role's own devOrder/qaOrder.
export interface SprintPlanEntryOrderPatch {
  entryId: string
  field: 'order' | 'devOrder' | 'qaOrder'
  value: number
}

// Fetched together since the Planning view always renders them side by side
// - the capacity strip and the "Tickets by person" table read from entries
// too (Planned is derived from the same SprintPlanEntry list).
async function fetchCapacityAndEntries(teamId: string, sprintId: string): Promise<PlanFetchResult> {
  const [capacityRes, entriesRes] = await Promise.all([
    fetch(`${API_URL}/api/teams/${teamId}/sprints/${sprintId}/capacity`),
    fetch(`${API_URL}/api/sprint-plan-entries?teamId=${teamId}&sprintId=${sprintId}`),
  ])

  let planConfigured = true
  let capacity: SprintCapacity[] = []
  if (capacityRes.status === 404) {
    // No TeamSprintPlan (working days) entered for this sprint yet - a
    // valid, expected state (spec never assumes one exists), not an error.
    planConfigured = false
  } else if (!capacityRes.ok) {
    throw new Error(await parseErrorMessage(capacityRes))
  } else {
    capacity = await capacityRes.json()
  }

  if (!entriesRes.ok) throw new Error(await parseErrorMessage(entriesRes))
  const entries: SprintPlanEntry[] = await entriesRes.json()

  return { planConfigured, capacity, entries }
}

export interface UseSprintPlanResult {
  sprints: Sprint[]
  loadingSprints: boolean
  sprintsError: string | null
  selectedSprintId: string | null
  setSelectedSprintId: (id: string) => void

  memberships: TeamMembership[]
  loadingMemberships: boolean

  planConfigured: boolean
  capacity: SprintCapacity[]
  entries: SprintPlanEntry[]
  loadingPlan: boolean
  planError: string | null

  savingWorkingDays: boolean
  setWorkingDays: (workingDays: number) => Promise<void>

  addingTicket: boolean
  addTicketError: string | null
  // Returns the created entry (sans `devQa` - the POST response isn't
  // decorated with it, only GET is, see routes/sprintPlanEntries.ts) so a
  // caller can identify which ticket was just added; `null` when the input
  // was blank/no-op. PlanningView uses the returned ticket id to watch for
  // the entry reappearing (now `devQa`-decorated) in `entries` after the
  // post-add refreshPlan(), to decide whether to auto-open the Dev/QA
  // assignment popup.
  addTicket: (rawInput: string) => Promise<SprintPlanEntry | null>

  savingDevQaOverride: boolean
  devQaOverrideError: string | null
  // PUT /api/tickets/:ticketId/dev-qa-override (ticket 23) - ticket 24's
  // DevQaAssignmentPopup save action. Refreshes the plan on success so the
  // badge moves into the newly-picked person's row.
  saveDevQaOverride: (ticketId: string, body: { devPersonId?: string | null; qaPersonId?: string | null }) => Promise<void>

  // PATCH /api/sprint-plan-entries/:id per patch (ticket 19's drag-reorder
  // save-on-drop) - optimistic, patching local `entries` state immediately
  // so the reorder feels instant, then rolling every patch in the drop back
  // to its pre-drag value if any PATCH fails (mirrors TodoDetail.tsx's
  // linked-todo drag-reorder). No separate loading/error state exposed -
  // same minimal-UX convention as that existing reorder.
  reorderEntries: (patches: SprintPlanEntryOrderPatch[]) => Promise<void>

  syncingPlan: boolean
  syncPlanError: string | null
  // POST /api/sprint-plan-entries/sync (ticket 13) - ticket 19's global
  // "Sync plan" button. Refreshes capacity+entries together on success via
  // refreshPlan(), same as every other plan-mutating action in this hook,
  // rather than patching local state from the sync response directly.
  syncPlan: () => Promise<void>
}

// Backs ticket 18's Planning view: the sprint selector, capacity strip, and
// "Tickets by person" table, all scoped to one team. Three independent
// fetches (sprints, memberships, capacity+entries) since each has its own
// loading/error lifecycle and the view renders progressively as they land
// (e.g. the roster table doesn't need to wait on the Jira-backed sprint
// list).
export function useSprintPlan(teamId: string | null): UseSprintPlanResult {
  const [sprints, setSprints] = useState<Sprint[]>([])
  const [loadingSprints, setLoadingSprints] = useState(true)
  const [sprintsError, setSprintsError] = useState<string | null>(null)
  const [selectedSprintId, setSelectedSprintId] = useState<string | null>(null)

  const [memberships, setMemberships] = useState<TeamMembership[]>([])
  const [loadingMemberships, setLoadingMemberships] = useState(true)

  const [planConfigured, setPlanConfigured] = useState(false)
  const [capacity, setCapacity] = useState<SprintCapacity[]>([])
  const [entries, setEntries] = useState<SprintPlanEntry[]>([])
  const [loadingPlan, setLoadingPlan] = useState(true)
  const [planError, setPlanError] = useState<string | null>(null)
  const [refreshTick, setRefreshTick] = useState(0)
  const refreshPlan = useCallback(() => setRefreshTick((t) => t + 1), [])

  const [savingWorkingDays, setSavingWorkingDays] = useState(false)
  const [addingTicket, setAddingTicket] = useState(false)
  const [addTicketError, setAddTicketError] = useState<string | null>(null)
  const [savingDevQaOverride, setSavingDevQaOverride] = useState(false)
  const [devQaOverrideError, setDevQaOverrideError] = useState<string | null>(null)
  const [syncingPlan, setSyncingPlan] = useState(false)
  const [syncPlanError, setSyncPlanError] = useState<string | null>(null)

  // Sprint list - resolves the team's Jira board and re-selects an active
  // sprint (falling back to the first) whenever the previously-selected id
  // is missing from the fresh list, which also covers a team switch (the
  // old team's sprint id never appears in the new team's list).
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

  // Team roster - independent of which sprint is selected.
  useEffect(() => {
    if (!teamId) {
      setMemberships([])
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
        if (!ignore) setMemberships(data)
      })
      .catch(() => {
        // Surfaced via the capacity/entries error path instead of a second
        // banner - the roster table just renders empty until it settles.
      })
      .finally(() => {
        if (!ignore) setLoadingMemberships(false)
      })

    return () => {
      ignore = true
    }
  }, [teamId])

  // Capacity + plan entries - re-run on team/sprint change or an explicit
  // refreshPlan() call (after adding a ticket or setting working days).
  useEffect(() => {
    if (!teamId || !selectedSprintId) {
      setPlanConfigured(false)
      setCapacity([])
      setEntries([])
      setLoadingPlan(false)
      return
    }

    let ignore = false
    setLoadingPlan(true)
    setPlanError(null)

    fetchCapacityAndEntries(teamId, selectedSprintId)
      .then((result) => {
        if (ignore) return
        setPlanConfigured(result.planConfigured)
        setCapacity(result.capacity)
        setEntries(result.entries)
      })
      .catch((err) => {
        if (!ignore) setPlanError((err as Error).message)
      })
      .finally(() => {
        if (!ignore) setLoadingPlan(false)
      })

    return () => {
      ignore = true
    }
  }, [teamId, selectedSprintId, refreshTick])

  const setWorkingDays = useCallback(
    async (workingDays: number) => {
      if (!teamId || !selectedSprintId) return
      setSavingWorkingDays(true)
      try {
        const res = await fetch(`${API_URL}/api/team-sprint-plans`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ teamId, sprintId: selectedSprintId, workingDays }),
        })
        if (!res.ok) throw new Error(await parseErrorMessage(res))
        refreshPlan()
      } finally {
        setSavingWorkingDays(false)
      }
    },
    [teamId, selectedSprintId, refreshPlan],
  )

  const addTicket = useCallback(
    async (rawInput: string): Promise<SprintPlanEntry | null> => {
      if (!teamId || !selectedSprintId) return null
      const jiraKey = normalizeJiraKey(rawInput)
      if (!jiraKey) return null

      setAddingTicket(true)
      setAddTicketError(null)
      try {
        const res = await fetch(`${API_URL}/api/sprint-plan-entries`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ teamId, sprintId: selectedSprintId, jiraKey }),
        })
        if (!res.ok) throw new Error(await parseErrorMessage(res))
        const created: SprintPlanEntry = await res.json()
        refreshPlan()
        return created
      } catch (err) {
        setAddTicketError((err as Error).message)
        throw err
      } finally {
        setAddingTicket(false)
      }
    },
    [teamId, selectedSprintId, refreshPlan],
  )

  const saveDevQaOverride = useCallback(
    async (ticketId: string, body: { devPersonId?: string | null; qaPersonId?: string | null }) => {
      setSavingDevQaOverride(true)
      setDevQaOverrideError(null)
      try {
        const res = await fetch(`${API_URL}/api/tickets/${ticketId}/dev-qa-override`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        })
        if (!res.ok) throw new Error(await parseErrorMessage(res))
        refreshPlan()
      } catch (err) {
        setDevQaOverrideError((err as Error).message)
        throw err
      } finally {
        setSavingDevQaOverride(false)
      }
    },
    [refreshPlan],
  )

  const reorderEntries = useCallback(
    async (patches: SprintPlanEntryOrderPatch[]) => {
      if (patches.length === 0) return
      const previous = entries
      setEntries((prev) =>
        prev.map((e) => {
          const patch = patches.find((p) => p.entryId === (getId(e) ?? ''))
          return patch ? { ...e, [patch.field]: patch.value } : e
        }),
      )
      try {
        await Promise.all(
          patches.map(async (p) => {
            const res = await fetch(`${API_URL}/api/sprint-plan-entries/${p.entryId}`, {
              method: 'PATCH',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ [p.field]: p.value }),
            })
            if (!res.ok) throw new Error(await parseErrorMessage(res))
          }),
        )
      } catch {
        setEntries(previous)
      }
    },
    [entries],
  )

  const syncPlan = useCallback(async () => {
    if (!teamId || !selectedSprintId) return
    setSyncingPlan(true)
    setSyncPlanError(null)
    try {
      const res = await fetch(`${API_URL}/api/sprint-plan-entries/sync`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ teamId, sprintId: selectedSprintId }),
      })
      if (!res.ok) throw new Error(await parseErrorMessage(res))
      refreshPlan()
    } catch (err) {
      setSyncPlanError((err as Error).message)
      throw err
    } finally {
      setSyncingPlan(false)
    }
  }, [teamId, selectedSprintId, refreshPlan])

  return {
    sprints,
    loadingSprints,
    sprintsError,
    selectedSprintId,
    setSelectedSprintId,
    memberships,
    loadingMemberships,
    planConfigured,
    capacity,
    entries,
    loadingPlan,
    planError,
    savingWorkingDays,
    setWorkingDays,
    addingTicket,
    addTicketError,
    addTicket,
    savingDevQaOverride,
    devQaOverrideError,
    saveDevQaOverride,
    reorderEntries,
    syncingPlan,
    syncPlanError,
    syncPlan,
  }
}
