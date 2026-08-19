import { useCallback, useEffect, useState } from 'react'
import { localTodayISO } from '../utils/dateAgenda'
import { getId } from '../utils/getId'
import type { Standup, TeamMembership } from '../types'

const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:4100'

async function parseErrorMessage(res: Response): Promise<string> {
  try {
    const data = await res.json()
    return data?.error ?? `Request failed with status ${res.status}`
  } catch {
    return `Request failed with status ${res.status}`
  }
}

export interface UseStandupResult {
  standup: Standup | null
  loading: boolean
  error: string | null
  starting: boolean
  ending: boolean
  // The teamMembershipId whose timer start/stop request is in flight, or
  // null - lets a row disable just its own Play/Stop button rather than
  // freezing the whole roster while one request resolves.
  togglingMembershipId: string | null
  startStandup: (order: TeamMembership[]) => Promise<void>
  startTimer: (teamMembershipId: string) => Promise<void>
  stopTimer: (teamMembershipId: string) => Promise<void>
  endStandup: () => Promise<void>
}

// Backs the Sprint Status view's daily standup (StatusView.tsx), replacing
// the old ephemeral, unpersisted shuffle-only roster order. "Today" is
// tracked as local component state, recomputed off the browser's own clock
// every 60s rather than once at mount - there's no client-date header
// anywhere in this app (see backend/src/utils/localDate.ts's header
// comment), so a day rollover while the tab stays open is caught purely by
// this poll: `today` changes, the fetch effect below re-runs with the new
// date, the server 404s (nothing started yet for the new day), and the view
// naturally flips back to "Start standup".
export function useStandup(teamId: string | null): UseStandupResult {
  const [today, setToday] = useState(() => localTodayISO())
  const [standup, setStandup] = useState<Standup | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [starting, setStarting] = useState(false)
  const [ending, setEnding] = useState(false)
  const [togglingMembershipId, setTogglingMembershipId] = useState<string | null>(null)

  useEffect(() => {
    const interval = setInterval(() => setToday(localTodayISO()), 60_000)
    return () => clearInterval(interval)
  }, [])

  useEffect(() => {
    if (!teamId) {
      setStandup(null)
      setLoading(false)
      return
    }

    let ignore = false
    setLoading(true)
    setError(null)

    fetch(`${API_URL}/api/standups?teamId=${teamId}&date=${today}`)
      .then(async (res) => {
        if (res.status === 404) return null
        if (!res.ok) throw new Error(await parseErrorMessage(res))
        return (await res.json()) as Standup
      })
      .then((data) => {
        if (!ignore) setStandup(data)
      })
      .catch((err) => {
        if (!ignore) setError((err as Error).message)
      })
      .finally(() => {
        if (!ignore) setLoading(false)
      })

    return () => {
      ignore = true
    }
  }, [teamId, today])

  const startStandup = useCallback(
    async (order: TeamMembership[]) => {
      if (!teamId) return
      setStarting(true)
      setError(null)
      try {
        const res = await fetch(`${API_URL}/api/standups`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            teamId,
            date: today,
            teamMembershipIds: order.map((m) => getId(m)),
          }),
        })
        if (!res.ok) throw new Error(await parseErrorMessage(res))
        setStandup((await res.json()) as Standup)
      } catch (err) {
        setError((err as Error).message)
        throw err
      } finally {
        setStarting(false)
      }
    },
    [teamId, today],
  )

  const startTimer = useCallback(
    async (teamMembershipId: string) => {
      if (!standup) return
      setTogglingMembershipId(teamMembershipId)
      setError(null)
      try {
        const res = await fetch(`${API_URL}/api/standups/${getId(standup)}/timer/start`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ teamMembershipId }),
        })
        if (!res.ok) throw new Error(await parseErrorMessage(res))
        setStandup((await res.json()) as Standup)
      } catch (err) {
        setError((err as Error).message)
        throw err
      } finally {
        setTogglingMembershipId(null)
      }
    },
    [standup],
  )

  const stopTimer = useCallback(
    async (teamMembershipId: string) => {
      if (!standup) return
      setTogglingMembershipId(teamMembershipId)
      setError(null)
      try {
        const res = await fetch(`${API_URL}/api/standups/${getId(standup)}/timer/stop`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ teamMembershipId }),
        })
        if (!res.ok) throw new Error(await parseErrorMessage(res))
        setStandup((await res.json()) as Standup)
      } catch (err) {
        setError((err as Error).message)
        throw err
      } finally {
        setTogglingMembershipId(null)
      }
    },
    [standup],
  )

  const endStandup = useCallback(async () => {
    if (!standup) return
    setEnding(true)
    setError(null)
    try {
      const res = await fetch(`${API_URL}/api/standups/${getId(standup)}/end`, { method: 'POST' })
      if (!res.ok) throw new Error(await parseErrorMessage(res))
      setStandup((await res.json()) as Standup)
    } catch (err) {
      setError((err as Error).message)
      throw err
    } finally {
      setEnding(false)
    }
  }, [standup])

  return {
    standup,
    loading,
    error,
    starting,
    ending,
    togglingMembershipId,
    startStandup,
    startTimer,
    stopTimer,
    endStandup,
  }
}
