import { useCallback, useEffect, useState } from 'react'
import { getId } from '../utils/getId'
import type { Profile } from '../types'

const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:4100'
const STORAGE_KEY = 'planner-active-profile-id'

async function parseErrorMessage(res: Response): Promise<string> {
  try {
    const data = await res.json()
    return data?.error ?? `Request failed with status ${res.status}`
  } catch {
    return `Request failed with status ${res.status}`
  }
}

function readStoredProfileId(): string | null {
  try {
    return localStorage.getItem(STORAGE_KEY)
  } catch {
    // Persistence is best-effort - see applyTheme's identical guard in
    // utils/theme.ts.
    return null
  }
}

function writeStoredProfileId(id: string): void {
  try {
    localStorage.setItem(STORAGE_KEY, id)
  } catch {
    // Best-effort; the in-memory selection still works for this session.
  }
}

export interface UseActiveProfileResult {
  profiles: Profile[]
  activeProfileId: string | null
  loading: boolean
  error: string | null
  setActiveProfileId: (id: string) => void
  createProfile: (name: string) => Promise<void>
}

// Owns the active-profile selection that the rest of the app (category
// list/counts/create today; todos/tags/search/scratchpad in later tickets)
// scopes itself to. Per the Profiles spec, the active profile is pure
// client-side state - there is no server-side "current profile" concept -
// so this hook is the single source of truth: it fetches the profile list,
// restores the last-chosen profile from localStorage (falling back to the
// first profile if nothing's stored or the stored id no longer exists among
// the fetched profiles), and persists every subsequent change back to
// localStorage. Callers thread `activeProfileId` through their own
// profile-scoped fetches explicitly (e.g. as a `?profileId=` query param).
export function useActiveProfile(): UseActiveProfileResult {
  const [profiles, setProfiles] = useState<Profile[]>([])
  const [activeProfileId, setActiveProfileIdState] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const setActiveProfileId = useCallback((id: string) => {
    setActiveProfileIdState(id)
    writeStoredProfileId(id)
  }, [])

  useEffect(() => {
    let ignore = false

    async function load() {
      setLoading(true)
      setError(null)
      try {
        const res = await fetch(`${API_URL}/api/profiles`)
        if (!res.ok) throw new Error(await parseErrorMessage(res))
        const data: Profile[] = await res.json()
        if (ignore) return

        setProfiles(data)

        const stored = readStoredProfileId()
        const storedStillExists = stored !== null && data.some((profile) => getId(profile) === stored)
        const resolved = storedStillExists ? stored : (getId(data[0]) ?? null)

        setActiveProfileIdState(resolved)
        if (resolved) writeStoredProfileId(resolved)
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

  // Creating a profile immediately switches into it - there's nothing else
  // useful to do with a brand-new, empty profile, and it's what makes "add a
  // profile from the switcher" feel like one action rather than two.
  const createProfile = useCallback(
    async (name: string) => {
      setError(null)
      try {
        const res = await fetch(`${API_URL}/api/profiles`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name }),
        })
        if (!res.ok) throw new Error(await parseErrorMessage(res))
        const created: Profile = await res.json()
        setProfiles((prev) => [...prev, created])
        const createdId = getId(created)
        if (createdId) setActiveProfileId(createdId)
      } catch (err) {
        setError((err as Error).message)
        throw err
      }
    },
    [setActiveProfileId],
  )

  return { profiles, activeProfileId, loading, error, setActiveProfileId, createProfile }
}
