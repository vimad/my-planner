import { useCallback, useEffect, useState } from 'react'
import type { AtlasPlanningHoliday } from '../types'
import { getId } from '../utils/getId'

const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:4100'

async function parseErrorMessage(res: Response): Promise<string> {
  try {
    const data = await res.json()
    return data?.error ?? `Request failed with status ${res.status}`
  } catch {
    return `Request failed with status ${res.status}`
  }
}

export interface UseAtlasPlanningHolidaysResult {
  holidays: AtlasPlanningHoliday[]
  loading: boolean
  error: string | null
  toggling: boolean
  toggleError: string | null
  // Toggles one date on/off for the whole roster - the chip row's whole
  // interaction in a single call, same shape as SprintPeriodForm's
  // toggleHoliday but backed by a real POST/DELETE round trip instead of
  // local-only draft state (this feature has no "Save" step).
  toggleHoliday: (date: string) => Promise<void>
}

// Atlas Planning tab's holiday hook (.scratch/atlas-planning-tab, ticket 02)
// - fetches/mutates AtlasPlanningHoliday (`/api/atlas-planning-holidays`)
// only, independent of Sprint Planning's TeamSprintPlan.holidays and of this
// feature's own leave/ticket-attachment hooks. GET already returns only
// holidays inside the current rolling window (read-time reconciliation on
// the backend).
export function useAtlasPlanningHolidays(): UseAtlasPlanningHolidaysResult {
  const [holidays, setHolidays] = useState<AtlasPlanningHoliday[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [toggling, setToggling] = useState(false)
  const [toggleError, setToggleError] = useState<string | null>(null)

  useEffect(() => {
    let ignore = false

    async function load() {
      setLoading(true)
      setError(null)
      try {
        const res = await fetch(`${API_URL}/api/atlas-planning-holidays`)
        if (!res.ok) throw new Error(await parseErrorMessage(res))
        const data: AtlasPlanningHoliday[] = await res.json()
        if (!ignore) setHolidays(data)
      } catch (err) {
        if (!ignore) setError((err as Error).message)
      } finally {
        if (!ignore) setLoading(false)
      }
    }

    load()

    return () => {
      ignore = true
    }
  }, [])

  const toggleHoliday = useCallback(
    async (date: string) => {
      setToggling(true)
      setToggleError(null)
      try {
        const existing = holidays.find((h) => h.date === date)

        if (existing) {
          const id = getId(existing)!
          const res = await fetch(`${API_URL}/api/atlas-planning-holidays/${id}`, { method: 'DELETE' })
          if (!res.ok) throw new Error(await parseErrorMessage(res))
          setHolidays((prev) => prev.filter((h) => getId(h) !== id))
          return
        }

        const res = await fetch(`${API_URL}/api/atlas-planning-holidays`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ date }),
        })
        if (!res.ok) throw new Error(await parseErrorMessage(res))
        const created: AtlasPlanningHoliday = await res.json()
        setHolidays((prev) => [...prev, created])
      } catch (err) {
        setToggleError((err as Error).message)
        throw err
      } finally {
        setToggling(false)
      }
    },
    [holidays],
  )

  return { holidays, loading, error, toggling, toggleError, toggleHoliday }
}
