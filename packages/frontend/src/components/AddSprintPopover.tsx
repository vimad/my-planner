import { useEffect, useRef, useState } from 'react'
import { getId } from '../utils/getId'
import type { JiraSprintSearchResult, Sprint } from '../types'

const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:4100'
const SEARCH_DEBOUNCE_MS = 300

interface AddSprintPopoverProps {
  teamId: string
  cachedSprints: Sprint[]
  // Sprint doc id (getId(sprint), i.e. Mongo _id) - matches what
  // useSprintPlan's selectedSprintId/refreshSprints expect, not the Jira
  // numeric sprint id.
  onImported: (sprintId: string) => void
}

async function parseErrorMessage(res: Response): Promise<string> {
  try {
    const data = await res.json()
    return data?.error ?? `Request failed with status ${res.status}`
  } catch {
    return `Request failed with status ${res.status}`
  }
}

// Planning-only "+" next to the Sprint picker (Status view deliberately
// excluded, per the feature request): lets the user pull a sprint that
// exists in Jira right now - e.g. a future sprint already planned there -
// into our cache immediately, without waiting on GET /api/sprints' 10-minute
// TTL (services/sprintSync.ts). Live search only, never reads the cache;
// "Add" hits the idempotent POST /api/sprints import route. Styled per
// docs/ui-conventions.md archetype A (small anchored dropdown/popover).
export function AddSprintPopover({ teamId, cachedSprints, onImported }: AddSprintPopoverProps) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<JiraSprintSearchResult[]>([])
  const [searching, setSearching] = useState(false)
  const [searchError, setSearchError] = useState<string | null>(null)
  const [addingId, setAddingId] = useState<number | null>(null)
  const [addError, setAddError] = useState<string | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (open) inputRef.current?.focus()
  }, [open])

  // Live Jira search, debounced as the user types (never on every
  // keystroke) - lazy: a blank query fetches nothing (the board's full
  // sprint list, including years of closed sprints, isn't worth a Jira call
  // just for opening the popover), so results only appear once there's
  // something to actually search for.
  useEffect(() => {
    if (!open || !query.trim()) {
      setResults([])
      setSearching(false)
      setSearchError(null)
      return
    }
    let ignore = false
    setSearching(true)
    setSearchError(null)
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(`${API_URL}/api/sprints/search?teamId=${teamId}&q=${encodeURIComponent(query)}`)
        if (!res.ok) throw new Error(await parseErrorMessage(res))
        const data: JiraSprintSearchResult[] = await res.json()
        if (!ignore) setResults(data)
      } catch (err) {
        if (!ignore) setSearchError((err as Error).message)
      } finally {
        if (!ignore) setSearching(false)
      }
    }, SEARCH_DEBOUNCE_MS)
    return () => {
      ignore = true
      clearTimeout(timer)
    }
  }, [open, query, teamId])

  useEffect(() => {
    if (!open) return
    function onMouseDown(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    window.addEventListener('mousedown', onMouseDown)
    return () => window.removeEventListener('mousedown', onMouseDown)
  }, [open])

  function closeAndReset() {
    setOpen(false)
    setQuery('')
    setResults([])
    setAddError(null)
  }

  async function handleAdd(sprint: JiraSprintSearchResult) {
    setAddingId(sprint.id)
    setAddError(null)
    try {
      const res = await fetch(`${API_URL}/api/sprints`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ teamId, jiraSprintId: sprint.id }),
      })
      if (!res.ok) throw new Error(await parseErrorMessage(res))
      const created: Sprint = await res.json()
      const createdId = getId(created)
      if (createdId) onImported(createdId)
      closeAndReset()
    } catch (err) {
      setAddError((err as Error).message)
    } finally {
      setAddingId(null)
    }
  }

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label="Add sprint from Jira"
        title="Add sprint from Jira"
        className="rounded-full border border-dashed border-slate-300 px-2 py-0.5 text-sm font-semibold text-slate-500 hover:bg-slate-100 dark:border-white/20 dark:text-slate-300 dark:hover:bg-white/10"
      >
        +
      </button>

      {open && (
        <div className="absolute left-0 top-[calc(100%+4px)] z-10 w-80 rounded-lg border border-slate-200 bg-white py-1 shadow-lg dark:border-white/10 dark:bg-[#1a1229]">
          <div className="px-2 pb-1">
            <input
              ref={inputRef}
              type="text"
              aria-label="Search Jira sprints"
              placeholder="Search Jira sprints…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Escape') {
                  e.preventDefault()
                  closeAndReset()
                }
              }}
              className="w-full rounded-lg border border-slate-200 bg-slate-50 px-2 py-1 text-sm text-slate-900 placeholder:text-slate-400 focus:border-fuchsia-400/60 focus:outline-none dark:border-white/10 dark:bg-white/5 dark:text-slate-100 dark:placeholder:text-slate-500"
            />
          </div>

          {addError && (
            <p className="px-3 pb-1 text-xs text-red-600 dark:text-red-400">Error: {addError}</p>
          )}

          <div className="max-h-64 overflow-y-auto">
            {searching ? (
              <p className="px-3 py-1.5 text-sm text-slate-400 dark:text-slate-500">Searching Jira…</p>
            ) : searchError ? (
              <p className="px-3 py-1.5 text-sm text-red-600 dark:text-red-400">Error: {searchError}</p>
            ) : !query.trim() ? (
              <p className="px-3 py-1.5 text-sm text-slate-400 dark:text-slate-500">Type a sprint name to search Jira…</p>
            ) : results.length === 0 ? (
              <p className="px-3 py-1.5 text-sm text-slate-400 dark:text-slate-500">No sprints match.</p>
            ) : (
              results.map((sprint) => {
                const cached = cachedSprints.some((s) => s.jiraSprintId === String(sprint.id))
                return (
                  <div
                    key={sprint.id}
                    className="flex items-center justify-between gap-2 px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-white/10"
                  >
                    <span className="truncate">
                      {sprint.name} <span className="opacity-70">({sprint.state})</span>
                      {cached && (
                        <span className="ml-1 text-[11px] font-semibold uppercase tracking-wide text-emerald-600 dark:text-emerald-400">
                          in cache
                        </span>
                      )}
                    </span>
                    <button
                      type="button"
                      onClick={() => handleAdd(sprint)}
                      disabled={addingId === sprint.id}
                      className="shrink-0 rounded-lg bg-gradient-to-r from-violet-500 to-fuchsia-500 px-2 py-0.5 text-xs font-semibold text-white hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {addingId === sprint.id ? 'Adding…' : cached ? 'Re-sync' : 'Add'}
                    </button>
                  </div>
                )
              })
            )}
          </div>
        </div>
      )}
    </div>
  )
}
