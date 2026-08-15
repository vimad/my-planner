import { Inbox, RefreshCw } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { Avatar } from './Avatar'
import { isSplitTicket } from '../utils/ticketType'
import type { BacklogCategory, BacklogTicket } from '../types'

const CATEGORY_TABS: { key: BacklogCategory; label: string }[] = [
  { key: 'tech-ops', label: 'Technical' },
  { key: 'product', label: 'Product' },
  { key: 'bug', label: 'Bugs' },
]

interface AddFromBacklogPopoverProps {
  // Wraps GET /api/tickets/backlog (useSprintPlan.ts) - deliberately never
  // called with a `q` param here: the search box below filters the
  // already-fetched category client-side, so typing never triggers an
  // extra round-trip (spec ".scratch/add-from-backlog/spec.md"). Server-side
  // this is served from a cache, populated from Jira only the first time a
  // category is browsed - see refreshBacklog below for forcing a re-fetch.
  fetchBacklog: (category: BacklogCategory) => Promise<BacklogTicket[]>
  // Wraps POST /api/tickets/backlog/refresh - forces a live Jira re-fetch
  // for the current category and replaces the server-side cache, so a
  // ticket added/reordered/removed on the real Jira backlog shows up here
  // without waiting on anything else to invalidate the cache first.
  refreshBacklog: (category: BacklogCategory) => Promise<BacklogTicket[]>
  // Reuses the exact existing add-and-assign pipeline (useSprintPlan.ts's
  // addFromBacklog, which delegates to addTicket) - this component's own
  // job ends at "which ticket was picked", not the add itself.
  onPick: (jiraKey: string) => void
}

// Archetype A anchored popover (docs/ui-conventions.md) - same
// trigger-button + absolute-positioned-panel + outside-click-to-close shape
// as AddSprintPopover.tsx. Browses the team's Jira backlog (Technical/
// Product/Bugs tabs, scoped to Team.jiraLabels server-side) so a ticket can
// be added without already knowing its key.
export function AddFromBacklogPopover({ fetchBacklog, refreshBacklog, onPick }: AddFromBacklogPopoverProps) {
  const [open, setOpen] = useState(false)
  const [category, setCategory] = useState<BacklogCategory>('tech-ops')
  const [query, setQuery] = useState('')
  const [tickets, setTickets] = useState<BacklogTicket[]>([])
  const [loading, setLoading] = useState(false)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (open) inputRef.current?.focus()
  }, [open])

  // Live, uncached fetch on open and on every category-tab change only -
  // never on a keystroke (mirrors AddSprintPopover's "don't call Jira until
  // there's something to show" convention, per the ticket's checklist).
  useEffect(() => {
    if (!open) return
    let ignore = false
    setLoading(true)
    setError(null)
    fetchBacklog(category)
      .then((data) => {
        if (!ignore) setTickets(data)
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
  }, [open, category, fetchBacklog])

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
  }

  function handlePick(ticket: BacklogTicket) {
    closeAndReset()
    onPick(ticket.key)
  }

  // Forces a live Jira re-fetch for the current category, replacing the
  // server-side cache and the list shown here - unlike the open/category
  // effect above, this is only ever triggered by an explicit click, never
  // automatically.
  async function handleRefresh() {
    setRefreshing(true)
    setError(null)
    try {
      const data = await refreshBacklog(category)
      setTickets(data)
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setRefreshing(false)
    }
  }

  const trimmedQuery = query.trim().toLowerCase()
  const filteredTickets = trimmedQuery
    ? tickets.filter(
        (t) => t.key.toLowerCase().includes(trimmedQuery) || t.title.toLowerCase().includes(trimmedQuery),
      )
    : tickets

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label="Add from backlog"
        title="Add from backlog"
        className="rounded-lg px-2 py-1.5 text-sm text-slate-400 hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-white/10 dark:hover:text-slate-200"
      >
        <Inbox className="h-4 w-4" />
      </button>

      {open && (
        <div className="absolute left-0 top-[calc(100%+4px)] z-10 w-96 rounded-lg border border-slate-200 bg-white py-1 shadow-lg dark:border-white/10 dark:bg-[#1a1229]">
          <div className="flex items-center gap-1 px-3 pb-2 pt-1">
            {CATEGORY_TABS.map((tab) => (
              <button
                key={tab.key}
                type="button"
                onClick={() => setCategory(tab.key)}
                className={
                  category === tab.key
                    ? 'rounded-full bg-gradient-to-r from-violet-500 to-fuchsia-500 px-2.5 py-1 text-[11px] font-semibold text-white'
                    : 'rounded-full border border-slate-200 px-2.5 py-1 text-[11px] font-semibold text-slate-600 hover:bg-slate-100 dark:border-white/10 dark:text-slate-300 dark:hover:bg-white/10'
                }
              >
                {tab.label}
              </button>
            ))}
            <button
              type="button"
              onClick={handleRefresh}
              disabled={refreshing}
              aria-label="Refresh backlog from Jira"
              title="Refresh backlog from Jira"
              className="ml-auto shrink-0 rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600 disabled:opacity-50 dark:hover:bg-white/10 dark:hover:text-slate-200"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${refreshing ? 'animate-spin' : ''}`} />
            </button>
          </div>

          <div className="px-3 pb-1">
            <input
              ref={inputRef}
              type="text"
              aria-label="Search backlog"
              placeholder="Search key or title…"
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

          <div className="max-h-72 overflow-y-auto">
            {loading ? (
              <p className="px-3 py-1.5 text-sm text-slate-400 dark:text-slate-500">Loading backlog…</p>
            ) : error ? (
              <p className="px-3 py-1.5 text-sm text-red-600 dark:text-red-400">Error: {error}</p>
            ) : filteredTickets.length === 0 ? (
              <p className="px-3 py-1.5 text-sm text-slate-400 dark:text-slate-500">No tickets match.</p>
            ) : (
              filteredTickets.map((ticket) => (
                <button
                  key={ticket.key}
                  type="button"
                  onClick={() => handlePick(ticket)}
                  className="flex w-full items-center gap-2 px-3 py-1.5 text-left hover:bg-slate-100 dark:hover:bg-white/10"
                >
                  <span className="w-24 shrink-0 truncate text-[11px] font-semibold text-slate-500 dark:text-slate-400">
                    {ticket.key}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-sm text-slate-700 dark:text-slate-200">{ticket.title}</span>
                  <span className="flex shrink-0 -space-x-1">
                    {isSplitTicket(ticket.type) ? (
                      <>
                        <Avatar name={ticket.dev?.name ?? null} size="sm" />
                        <Avatar name={ticket.qa?.name ?? null} size="sm" />
                      </>
                    ) : (
                      <Avatar name={ticket.assignee?.name ?? null} size="sm" />
                    )}
                  </span>
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  )
}
