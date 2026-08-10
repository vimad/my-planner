import { useEffect, useState } from 'react'
import type { Epic } from '../types'

const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:4100'

async function parseErrorMessage(res: Response): Promise<string> {
  try {
    const data = await res.json()
    return data?.error ?? `Request failed with status ${res.status}`
  } catch {
    return `Request failed with status ${res.status}`
  }
}

export interface UseEpicsResult {
  epics: Epic[]
  loadingEpics: boolean
  epicsError: string | null
}

// Ticket 20's epics pill strip data source - GET /api/epics?sprintId=
// (ticket 13). Independent of useSprintPlan's fetches (its own
// loading/error lifecycle, doesn't affect capacity/entries), same
// "several independent fetches" convention as that hook.
export function useEpics(sprintId: string | null): UseEpicsResult {
  const [epics, setEpics] = useState<Epic[]>([])
  const [loadingEpics, setLoadingEpics] = useState(true)
  const [epicsError, setEpicsError] = useState<string | null>(null)

  useEffect(() => {
    if (!sprintId) {
      setEpics([])
      setLoadingEpics(false)
      return
    }

    let ignore = false
    setLoadingEpics(true)
    setEpicsError(null)

    fetch(`${API_URL}/api/epics?sprintId=${sprintId}`)
      .then(async (res) => {
        if (!res.ok) throw new Error(await parseErrorMessage(res))
        return (await res.json()) as Epic[]
      })
      .then((data) => {
        if (!ignore) setEpics(data)
      })
      .catch((err) => {
        if (!ignore) setEpicsError((err as Error).message)
      })
      .finally(() => {
        if (!ignore) setLoadingEpics(false)
      })

    return () => {
      ignore = true
    }
  }, [sprintId])

  return { epics, loadingEpics, epicsError }
}
