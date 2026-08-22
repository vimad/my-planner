import { useCallback, useEffect, useState } from 'react'
import type { AtlasPlanningEntry } from '../types'
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

export interface UseAtlasPlanningResult {
  entries: AtlasPlanningEntry[]
  loading: boolean
  error: string | null
  attaching: boolean
  attachError: string | null
  attachTicket: (rosterMemberId: string, jiraKey: string) => Promise<void>
  reassignError: string | null
  reassignTicket: (entryId: string, rosterMemberId: string) => Promise<void>
  removeError: string | null
  removeTicket: (entryId: string) => Promise<void>
}

// Atlas Planning tab's own data hook (.scratch/atlas-planning-tab, ticket
// 01) - fetches/mutates AtlasPlanningEntry (`/api/atlas-planning-entries`)
// only. Deliberately independent of useAtlasEpics.ts (Board/Summary's own
// hook) and useSprintPlan.ts (Sprint Planning's people-wise hook) per the
// spec's module-boundary decision: switching Board/Summary/Planning tabs
// must never block on another tab's fetch, and this module owns no code from
// either. The one shared piece of infrastructure this feature does reuse -
// Atlas's roster - is fetched separately by whichever component composes
// this hook with useAtlasRoster.ts.
export function useAtlasPlanning(): UseAtlasPlanningResult {
  const [entries, setEntries] = useState<AtlasPlanningEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [attaching, setAttaching] = useState(false)
  const [attachError, setAttachError] = useState<string | null>(null)
  const [reassignError, setReassignError] = useState<string | null>(null)
  const [removeError, setRemoveError] = useState<string | null>(null)

  useEffect(() => {
    let ignore = false

    async function load() {
      setLoading(true)
      setError(null)
      try {
        const res = await fetch(`${API_URL}/api/atlas-planning-entries`)
        if (!res.ok) throw new Error(await parseErrorMessage(res))
        const data: AtlasPlanningEntry[] = await res.json()
        if (!ignore) setEntries(data)
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

  // Attaches a ticket key to a person's row. No Jira call is ever made here
  // (spec: "zero Jira API calls in this whole ticket") - jiraKey is stored
  // exactly as passed in, validated only for shape by the caller
  // (AtlasPlanningView's client-side normalizeJiraKey check) before this is
  // called.
  const attachTicket = useCallback(async (rosterMemberId: string, jiraKey: string) => {
    setAttaching(true)
    setAttachError(null)
    try {
      const res = await fetch(`${API_URL}/api/atlas-planning-entries`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rosterMemberId, jiraKey }),
      })
      if (!res.ok) throw new Error(await parseErrorMessage(res))
      const created: AtlasPlanningEntry = await res.json()
      setEntries((prev) => [...prev, created])
    } catch (err) {
      setAttachError((err as Error).message)
      throw err
    } finally {
      setAttaching(false)
    }
  }, [])

  // Reassigns an already-attached ticket to a different roster member - the
  // badge/row's person-picker control (spec story 13), not drag-and-drop.
  const reassignTicket = useCallback(async (entryId: string, rosterMemberId: string) => {
    setReassignError(null)
    try {
      const res = await fetch(`${API_URL}/api/atlas-planning-entries/${entryId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rosterMemberId }),
      })
      if (!res.ok) throw new Error(await parseErrorMessage(res))
      const updated: AtlasPlanningEntry = await res.json()
      setEntries((prev) => prev.map((e) => (getId(e) === entryId ? updated : e)))
    } catch (err) {
      setReassignError((err as Error).message)
      throw err
    }
  }, [])

  const removeTicket = useCallback(async (entryId: string) => {
    setRemoveError(null)
    try {
      const res = await fetch(`${API_URL}/api/atlas-planning-entries/${entryId}`, { method: 'DELETE' })
      if (!res.ok) throw new Error(await parseErrorMessage(res))
      setEntries((prev) => prev.filter((e) => getId(e) !== entryId))
    } catch (err) {
      setRemoveError((err as Error).message)
      throw err
    }
  }, [])

  return {
    entries,
    loading,
    error,
    attaching,
    attachError,
    attachTicket,
    reassignError,
    reassignTicket,
    removeError,
    removeTicket,
  }
}
