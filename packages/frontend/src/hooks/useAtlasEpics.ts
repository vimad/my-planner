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
}

// Backs AtlasView's tracked-epics list (GET /api/atlas/epics) and its
// epic-key entry form (POST /api/atlas/epics). Ticket 07's initial-sync
// scope only - no per-epic "Sync now"/un-track/archive yet (ticket 10), no
// polling/staleness (spec §4.2: refresh is always manual-only).
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

  return { epics, loading, loadError, tracking, trackError, trackEpic }
}
