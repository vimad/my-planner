import type { JSONContent } from '@tiptap/core'
import { useCallback, useEffect, useState } from 'react'
import type { AtlasEpic } from '../types'

const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:4100'

async function parseErrorMessage(res: Response): Promise<string> {
  try {
    const data = await res.json()
    return data?.error ?? `Request failed with status ${res.status}`
  } catch {
    return `Request failed with status ${res.status}`
  }
}

export interface UseAtlasEpicsResult {
  epics: AtlasEpic[]
  loading: boolean
  loadError: string | null
  // True while a track/sync POST is in flight - the Atlas empty-state
  // input's "immediate, synchronous sync" loading state (ticket 07, spec
  // §4.1).
  tracking: boolean
  trackError: string | null
  // Resolves true on a successful track (caller clears its input), false on
  // a rejected key (unresolvable/non-Epic) - trackError is set either way,
  // never thrown, so a component doesn't need its own try/catch.
  trackEpic: (jiraKey: string) => Promise<boolean>
  // Ticket 09's task-editing PATCH: partial-update a single task's
  // dates/notes/at-risk-override/blocked-by, then re-fetch the whole list
  // (same "re-GET rather than splice locally" rationale as trackEpic above -
  // the row-level caller doesn't need to reconstruct the nested tree shape
  // itself). Throws on failure (network or non-2xx) rather than swallowing
  // it into a hook-level error field, since edits happen row-by-row and
  // inline - the calling row is what owns showing its own save error, not
  // one shared hook-wide slot that many simultaneously-open rows would fight
  // over.
  updateTask: (taskId: string, patch: UpdateAtlasTaskPatch) => Promise<void>
  // Ticket 10's epic-level PATCH: partial-update an epic's notes and/or its
  // archived flag (un-track / restore - spec §4.4). Same "throw, let the
  // caller own its own error state" contract as updateTask above - a row's
  // notes editor or its archive/restore button each manage their own local
  // busy/error state rather than sharing one hook-wide slot.
  updateEpic: (epicId: string, patch: UpdateAtlasEpicPatch) => Promise<void>
  // Ticket 10's per-epic "Sync now" - re-runs the same immediate/synchronous
  // sync ticket 07 used for the initial track, scoped to just this one
  // epic's tree (spec §4.2: the only way data updates post-initial-sync).
  // Throws on failure, same row-owns-its-own-error contract as updateTask/
  // updateEpic.
  syncEpic: (epicId: string) => Promise<void>
  // Ticket 10's global "Sync all" - resyncs every tracked, non-archived
  // epic server-side in one call (routes/atlasEpics.ts's POST /sync-all).
  // Throws on failure so the caller (AtlasView's own local state) owns
  // showing the error, same convention as every other mutation here.
  syncAll: () => Promise<void>
}

export interface UpdateAtlasTaskPatch {
  startDate?: string | null
  endDate?: string | null
  notes?: JSONContent | null
  atRisk?: boolean
  blockedBy?: string[]
}

export interface UpdateAtlasEpicPatch {
  notes?: JSONContent | null
  archived?: boolean
}

// Backs AtlasView's tracked-epics list (GET /api/atlas/epics), its
// epic-key entry form (POST /api/atlas/epics - ticket 07), task/epic editing
// (PATCH .../tasks/:id, .../epics/:id - tickets 09/10), and ticket 10's
// per-epic/global "Sync now" actions. No polling/staleness anywhere (spec
// §4.2: refresh is always manual-only) - every mutation here re-fetches the
// whole list via `refresh` rather than trying to splice a partial response
// into local state.
export function useAtlasEpics(): UseAtlasEpicsResult {
  const [epics, setEpics] = useState<AtlasEpic[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [tracking, setTracking] = useState(false)
  const [trackError, setTrackError] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    setLoading(true)
    setLoadError(null)
    try {
      const res = await fetch(`${API_URL}/api/atlas/epics`)
      if (!res.ok) throw new Error(await parseErrorMessage(res))
      setEpics((await res.json()) as AtlasEpic[])
    } catch (err) {
      setLoadError((err as Error).message)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    refresh()
  }, [refresh])

  const trackEpic = useCallback(
    async (jiraKey: string) => {
      setTracking(true)
      setTrackError(null)
      try {
        const res = await fetch(`${API_URL}/api/atlas/epics`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ jiraKey }),
        })
        if (!res.ok) throw new Error(await parseErrorMessage(res))
        // Re-fetch the whole list rather than splicing the POST response in
        // locally - the POST returns a flat task list (trackAndSyncEpic's
        // shape), while the list view needs the server's nested tree
        // (buildTaskTree, GET-only) - simplest to let GET be the one place
        // that ever builds that shape.
        await refresh()
        return true
      } catch (err) {
        setTrackError((err as Error).message)
        return false
      } finally {
        setTracking(false)
      }
    },
    [refresh],
  )

  const updateTask = useCallback(
    async (taskId: string, patch: UpdateAtlasTaskPatch) => {
      const res = await fetch(`${API_URL}/api/atlas/tasks/${taskId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(patch),
      })
      if (!res.ok) throw new Error(await parseErrorMessage(res))
      await refresh()
    },
    [refresh],
  )

  const updateEpic = useCallback(
    async (epicId: string, patch: UpdateAtlasEpicPatch) => {
      const res = await fetch(`${API_URL}/api/atlas/epics/${epicId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(patch),
      })
      if (!res.ok) throw new Error(await parseErrorMessage(res))
      await refresh()
    },
    [refresh],
  )

  const syncEpic = useCallback(
    async (epicId: string) => {
      const res = await fetch(`${API_URL}/api/atlas/epics/${epicId}/sync`, { method: 'POST' })
      if (!res.ok) throw new Error(await parseErrorMessage(res))
      await refresh()
    },
    [refresh],
  )

  const syncAll = useCallback(async () => {
    const res = await fetch(`${API_URL}/api/atlas/epics/sync-all`, { method: 'POST' })
    if (!res.ok) throw new Error(await parseErrorMessage(res))
    await refresh()
  }, [refresh])

  return { epics, loading, loadError, tracking, trackError, trackEpic, updateTask, updateEpic, syncEpic, syncAll }
}
