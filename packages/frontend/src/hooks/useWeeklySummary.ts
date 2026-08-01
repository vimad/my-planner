import { useCallback, useEffect, useState } from 'react'
import { localTodayISO } from '../utils/dateAgenda'
import { addDays, mondayOf } from '../utils/weekDates'
import type { WeeklySummaryResponse } from '../types'

const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:4100'

async function parseErrorMessage(res: Response): Promise<string> {
  try {
    const data = await res.json()
    return data?.error ?? `Request failed with status ${res.status}`
  } catch {
    return `Request failed with status ${res.status}`
  }
}

export interface UseWeeklySummaryResult {
  data: WeeklySummaryResponse | null
  loading: boolean
  error: string | null
  // Whether the week currently being viewed is the one containing today -
  // drives SummaryView's "This week" jump button, which only renders when
  // this is false.
  isCurrentWeek: boolean
  goToPrevWeek: () => void
  goToNextWeek: () => void
  goToThisWeek: () => void
}

// Fetch-on-mount/on-profile-change data source for weekly progress
// (WeeklyProgressPanel's compact view and its SummaryView slide-over, both
// in App.tsx's Agenda section), mirroring hooks/useBoards' profile-keyed
// effect. Week navigation state (`date`) also lives here rather than in
// SummaryView, same "fetch-triggering state lives
// in the hook" convention - prev/next/this-week just move `date` by a week
// and let the effect below re-fetch.
export function useWeeklySummary(activeProfileId: string | null): UseWeeklySummaryResult {
  // Any day within the currently viewed week - only its Monday-snapped week
  // matters (the backend re-snaps it anyway), so plain 7-day shifts from
  // today keep this in step with `currentWeekStart` below without needing to
  // separately track "the" Monday.
  const [date, setDate] = useState(() => localTodayISO())
  const [data, setData] = useState<WeeklySummaryResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const currentWeekStart = mondayOf(localTodayISO())
  const isCurrentWeek = mondayOf(date) === currentWeekStart

  const loadSummary = useCallback(async (profileId: string, forDate: string) => {
    setError(null)
    try {
      const res = await fetch(
        `${API_URL}/api/todos/weekly-summary?profileId=${encodeURIComponent(profileId)}&date=${encodeURIComponent(forDate)}`,
      )
      if (!res.ok) throw new Error(await parseErrorMessage(res))
      setData(await res.json())
    } catch (err) {
      setError((err as Error).message)
    }
  }, [])

  useEffect(() => {
    if (!activeProfileId) return
    setLoading(true)
    loadSummary(activeProfileId, date).finally(() => setLoading(false))
  }, [activeProfileId, date, loadSummary])

  const goToPrevWeek = useCallback(() => setDate((d) => addDays(d, -7)), [])
  const goToNextWeek = useCallback(() => setDate((d) => addDays(d, 7)), [])
  const goToThisWeek = useCallback(() => setDate(localTodayISO()), [])

  return { data, loading, error, isCurrentWeek, goToPrevWeek, goToNextWeek, goToThisWeek }
}
