import { useCallback, useEffect, useRef, useState } from 'react'
import { getId } from '../utils/getId'
import type { Sprint, SprintCapacity, SprintPlanEntry, TeamMembership, TeamSprintPlan } from '../types'

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

// The picked date range + holidays a saved TeamSprintPlan carries, minus its
// id/teamId/sprintId bookkeeping - what the period-picker form actually
// needs. `null` covers both "no plan saved yet" and the migration case (a
// legacy plan with workingDays but no stored startDate/endDate) - the form
// treats both the same way, defaulting from the selected Sprint's own dates.
export interface SprintPeriod {
  startDate: string
  endDate: string
  holidays: string[]
  workingDays: number
}

function toSprintPeriod(plan: TeamSprintPlan | null): SprintPeriod | null {
  if (!plan || !plan.startDate || !plan.endDate) return null
  return { startDate: plan.startDate, endDate: plan.endDate, holidays: plan.holidays, workingDays: plan.workingDays }
}

// GET /api/team-sprint-plans?teamId=&sprintId= - the plan doc itself (not
// the derived capacity), so the period-picker form can read back
// startDate/endDate/holidays and PlanningView.tsx knows whether to POST or
// PATCH on save. Tolerates its own 404 as "no plan yet", same as
// fetchCapacityAndEntries tolerates the capacity endpoint's 404.
async function fetchSprintPlan(teamId: string, sprintId: string): Promise<TeamSprintPlan | null> {
  const res = await fetch(`${API_URL}/api/team-sprint-plans?teamId=${teamId}&sprintId=${sprintId}`)
  if (res.status === 404) return null
  if (!res.ok) throw new Error(await parseErrorMessage(res))
  return (await res.json()) as TeamSprintPlan
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
  // Re-fetches GET /api/sprints (still cache-first server-side) - the
  // AddSprintPopover's post-import refresh so a just-imported sprint shows
  // up in `sprints`/SprintSelect without waiting on the 10-minute TTL.
  // `selectSprintId`, when given, is auto-selected once it appears in the
  // refetched list (falls back to the normal active/first-sprint pick if it
  // never shows up, e.g. the import itself failed).
  refreshSprints: (selectSprintId?: string) => void

  memberships: TeamMembership[]
  loadingMemberships: boolean

  planConfigured: boolean
  capacity: SprintCapacity[]
  entries: SprintPlanEntry[]
  loadingPlan: boolean
  planError: string | null

  // The saved period (date range + holidays + derived workingDays) for the
  // selected sprint - `null` before any plan exists, or when an existing
  // legacy plan has no stored startDate/endDate (see toSprintPeriod above).
  // Separate from planConfigured, which keeps reading the capacity
  // endpoint's own 404 exactly as before (capacity.ts is unmodified).
  sprintPeriod: SprintPeriod | null
  loadingSprintPeriod: boolean
  savingSprintPeriod: boolean
  // Branches POST-vs-PATCH internally on whether a plan already exists for
  // this team+sprint - the UI never has to know which. On success, refreshes
  // both the plan fetch (so sprintPeriod reflects what was just saved) and
  // refreshPlan() (capacity+entries), since a changed workingDays changes
  // every capacity card.
  setSprintPeriod: (period: { startDate: string; endDate: string; holidays: string[] }) => Promise<void>

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

  removingEntryId: string | null
  removeEntryError: string | null
  // DELETE /api/sprint-plan-entries/:id - undoes an accidental add-to-plan.
  // Optimistic like reorderEntries: removes the entry from local `entries`
  // immediately, rolling back on failure. A Split ticket's entry backs both
  // its dev-row and qa-row placements (PlacedEntry in PlanningView.tsx), so
  // removing it clears both at once.
  removeEntry: (entryId: string) => Promise<void>

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
  const [sprintsRefreshTick, setSprintsRefreshTick] = useState(0)
  const pendingSprintSelectionRef = useRef<string | null>(null)
  const refreshSprints = useCallback((selectSprintId?: string) => {
    pendingSprintSelectionRef.current = selectSprintId ?? null
    setSprintsRefreshTick((t) => t + 1)
  }, [])

  const [memberships, setMemberships] = useState<TeamMembership[]>([])
  const [loadingMemberships, setLoadingMemberships] = useState(true)

  const [planConfigured, setPlanConfigured] = useState(false)
  const [capacity, setCapacity] = useState<SprintCapacity[]>([])
  const [entries, setEntries] = useState<SprintPlanEntry[]>([])
  const [loadingPlan, setLoadingPlan] = useState(true)
  const [planError, setPlanError] = useState<string | null>(null)
  const [refreshTick, setRefreshTick] = useState(0)
  const refreshPlan = useCallback(() => setRefreshTick((t) => t + 1), [])

  // The plan doc itself (id + startDate/endDate/holidays/workingDays),
  // fetched independently of capacity+entries above - kept as the raw doc
  // (not just the derived SprintPeriod) so setSprintPeriod below can read
  // its id to decide POST vs PATCH. Its own refresh tick, separate from
  // refreshTick, since a period save needs to re-fetch this doc regardless
  // of whether it also calls refreshPlan().
  const [sprintPlanDoc, setSprintPlanDoc] = useState<TeamSprintPlan | null>(null)
  const [loadingSprintPeriod, setLoadingSprintPeriod] = useState(true)
  const [sprintPlanRefreshTick, setSprintPlanRefreshTick] = useState(0)

  const [savingSprintPeriod, setSavingSprintPeriod] = useState(false)
  const [addingTicket, setAddingTicket] = useState(false)
  const [addTicketError, setAddTicketError] = useState<string | null>(null)
  const [savingDevQaOverride, setSavingDevQaOverride] = useState(false)
  const [devQaOverrideError, setDevQaOverrideError] = useState<string | null>(null)
  const [syncingPlan, setSyncingPlan] = useState(false)
  const [syncPlanError, setSyncPlanError] = useState<string | null>(null)
  const [removingEntryId, setRemovingEntryId] = useState<string | null>(null)
  const [removeEntryError, setRemoveEntryError] = useState<string | null>(null)

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
        const pending = pendingSprintSelectionRef.current
        pendingSprintSelectionRef.current = null
        setSelectedSprintId((prev) => {
          if (pending && data.some((s) => getId(s) === pending)) return pending
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
  }, [teamId, sprintsRefreshTick])

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

  // The plan doc for the period-picker form - independent fetch, own
  // refresh trigger, same "parallel fetch" pattern as sprints/memberships/
  // capacity+entries above. Tolerates its own 404 (fetchSprintPlan resolves
  // to null) as "no plan yet", not an error.
  useEffect(() => {
    if (!teamId) {
      setSprintPlanDoc(null)
      setLoadingSprintPeriod(false)
      return
    }
    if (!selectedSprintId) {
      // The sprint list hasn't resolved yet (or the team has none) -
      // `selectedSprintId` will very shortly flip to a real id once the
      // sprints fetch lands. Deliberately does NOT flip loadingSprintPeriod
      // to false here: doing so would let the render where selectedSprintId
      // first becomes non-null read a stale "not loading" flag (this
      // effect's own true->false transition for THAT id hasn't run yet,
      // since effects run after commit) and mount SprintPeriodForm one tick
      // early, seeded from a still-null sprintPeriod - clobbering PlanningView's
      // key={selectedSprintId} remount guard against showing a "no plan"
      // default flash before a real saved plan's dates ever get a chance to
      // render. Staying "loading" through this transient null keeps that
      // first real render already showing the loading placeholder instead.
      setSprintPlanDoc(null)
      return
    }

    let ignore = false
    setLoadingSprintPeriod(true)

    fetchSprintPlan(teamId, selectedSprintId)
      .then((plan) => {
        if (!ignore) setSprintPlanDoc(plan)
      })
      .catch(() => {
        // Tolerated silently, same as memberships' fetch above - the form
        // just falls back to defaulting from the Sprint's own Jira dates.
        if (!ignore) setSprintPlanDoc(null)
      })
      .finally(() => {
        if (!ignore) setLoadingSprintPeriod(false)
      })

    return () => {
      ignore = true
    }
  }, [teamId, selectedSprintId, sprintPlanRefreshTick])

  const setSprintPeriod = useCallback(
    async (period: { startDate: string; endDate: string; holidays: string[] }) => {
      if (!teamId || !selectedSprintId) return
      setSavingSprintPeriod(true)
      try {
        const existingId = getId(sprintPlanDoc)
        const res = existingId
          ? await fetch(`${API_URL}/api/team-sprint-plans/${existingId}`, {
              method: 'PATCH',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(period),
            })
          : await fetch(`${API_URL}/api/team-sprint-plans`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ teamId, sprintId: selectedSprintId, ...period }),
            })
        if (!res.ok) throw new Error(await parseErrorMessage(res))
        setSprintPlanRefreshTick((t) => t + 1)
        refreshPlan()
      } finally {
        setSavingSprintPeriod(false)
      }
    },
    [teamId, selectedSprintId, sprintPlanDoc, refreshPlan],
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
          const entryId = getId(e) ?? ''
          const ownPatches = patches.filter((p) => p.entryId === entryId)
          return ownPatches.length > 0 ? { ...e, ...Object.fromEntries(ownPatches.map((p) => [p.field, p.value])) } : e
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

  const removeEntry = useCallback(
    async (entryId: string) => {
      const previous = entries
      setRemovingEntryId(entryId)
      setRemoveEntryError(null)
      setEntries((prev) => prev.filter((e) => getId(e) !== entryId))
      try {
        const res = await fetch(`${API_URL}/api/sprint-plan-entries/${entryId}`, { method: 'DELETE' })
        if (!res.ok && res.status !== 404) throw new Error(await parseErrorMessage(res))
      } catch (err) {
        setEntries(previous)
        setRemoveEntryError((err as Error).message)
        throw err
      } finally {
        setRemovingEntryId(null)
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
    refreshSprints,
    memberships,
    loadingMemberships,
    planConfigured,
    capacity,
    entries,
    loadingPlan,
    planError,
    sprintPeriod: toSprintPeriod(sprintPlanDoc),
    loadingSprintPeriod,
    savingSprintPeriod,
    setSprintPeriod,
    addingTicket,
    addTicketError,
    addTicket,
    savingDevQaOverride,
    devQaOverrideError,
    saveDevQaOverride,
    reorderEntries,
    removingEntryId,
    removeEntryError,
    removeEntry,
    syncingPlan,
    syncPlanError,
    syncPlan,
  }
}
