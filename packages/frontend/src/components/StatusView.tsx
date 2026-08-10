import { useMemo } from 'react'
import { useStatusView } from '../hooks/useStatusView'
import { getId } from '../utils/getId'
import type { Team, Ticket } from '../types'

const JIRA_BASE_URL = import.meta.env.VITE_JIRA_BASE_URL ?? 'https://wealthos.atlassian.net'

function relativeTime(iso: string | null): string {
  if (!iso) return 'Never synced'
  const diffMs = Date.now() - new Date(iso).getTime()
  const diffMin = Math.round(diffMs / 60000)
  if (diffMin < 1) return 'Synced just now'
  if (diffMin < 60) return `Synced ${diffMin}m ago`
  const diffHr = Math.round(diffMin / 60)
  if (diffHr < 24) return `Synced ${diffHr}h ago`
  const diffDay = Math.round(diffHr / 24)
  return `Synced ${diffDay}d ago`
}

function exactTime(iso: string | null): string {
  return iso ? new Date(iso).toLocaleString() : 'never synced'
}

// `type` is `null` only for a ticket discovered exclusively via Lightweight
// sync (search/jql's fields=summary,status doesn't include issuetype) - see
// models/Ticket.ts. Renders a muted "?" until some Full sync (Planning)
// fills it in. Anything else is rendered as-is, no fixed color-per-type
// mapping (Ticket.type is a free-form Jira issue type name, not a closed
// union).
function TypeBadge({ type }: { type: string | null }) {
  if (!type) {
    return (
      <span
        title="Type unknown — only Lightweight-synced so far"
        className="rounded-full bg-slate-100 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-slate-400 dark:bg-white/10 dark:text-slate-500"
      >
        ?
      </span>
    )
  }
  return (
    <span className="rounded-full bg-slate-200 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-slate-600 dark:bg-white/10 dark:text-slate-300">
      {type}
    </span>
  )
}

function TicketCard({ ticket }: { ticket: Ticket }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm dark:border-white/10 dark:bg-white/5 dark:shadow-none dark:backdrop-blur-md">
      <div className="flex items-center justify-between gap-2">
        <span className="font-mono text-[11px] font-semibold text-fuchsia-600 dark:text-fuchsia-300">
          {ticket.jiraKey}
        </span>
        <a
          href={`${JIRA_BASE_URL}/browse/${ticket.jiraKey}`}
          target="_blank"
          rel="noreferrer"
          aria-label={`Open ${ticket.jiraKey} in Jira`}
          title="Open in Jira"
          className="shrink-0 rounded-full px-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-white/10 dark:hover:text-slate-200"
        >
          ↗
        </a>
      </div>
      <p className="mt-1.5 text-sm text-slate-800 dark:text-slate-100">{ticket.title}</p>
      <div className="mt-2 flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5">
          <TypeBadge type={ticket.type} />
          {ticket.stream && (
            <span className="rounded-full bg-slate-100 px-1.5 py-0.5 text-[10px] font-medium text-slate-500 dark:bg-white/10 dark:text-slate-400">
              {ticket.stream}
            </span>
          )}
        </div>
        <span className="shrink-0 text-[10px] text-slate-400" title={exactTime(ticket.lastSyncedAt)}>
          {relativeTime(ticket.lastSyncedAt)}
        </span>
      </div>
    </div>
  )
}

const CATEGORY_ACCENT: Record<string, string> = {
  todo: 'border-t-slate-300 dark:border-t-slate-500/40',
  in_progress: 'border-t-fuchsia-400 dark:border-t-fuchsia-400/60',
  done: 'border-t-emerald-500 dark:border-t-emerald-400/70',
}

// Ticket 21's Status view: a sprint selector, a left-hand roster sidebar
// (per-person cached ticket count/last-synced/sync icon), and a
// Jira-board-style board for whichever person is selected, showing only
// the status columns they currently occupy (ADR 0003). Mounted by
// SprintShell at /sprint/:teamSlug/status once a team is resolved.
export function StatusView({ team }: { team: Team }) {
  const teamId = getId(team) ?? null
  const {
    sprints,
    loadingSprints,
    sprintsError,
    selectedSprintId,
    setSelectedSprintId,
    memberships,
    loadingMemberships,
    statuses,
    tickets,
    loadingTickets,
    ticketsError,
    selectedPersonId,
    setSelectedPersonId,
    syncingPersonId,
    syncError,
    syncPerson,
  } = useStatusView(teamId)

  // Cached tickets grouped by assignee - the roster's per-row summary and
  // the selected person's board are both derived from this one grouping,
  // rather than filtering the flat `tickets` list twice.
  const ticketsByAccountId = useMemo(() => {
    const map = new Map<string, Ticket[]>()
    for (const t of tickets) {
      if (!t.assigneeAccountId) continue
      const list = map.get(t.assigneeAccountId) ?? []
      list.push(t)
      map.set(t.assigneeAccountId, list)
    }
    return map
  }, [tickets])

  function summaryFor(accountId: string): { count: number; lastSyncedAt: string | null } {
    const list = ticketsByAccountId.get(accountId) ?? []
    const lastSyncedAt = list.reduce<string | null>((latest, t) => {
      if (!latest || new Date(t.lastSyncedAt) > new Date(latest)) return t.lastSyncedAt
      return latest
    }, null)
    return { count: list.length, lastSyncedAt }
  }

  const selectedMembership = memberships.find((m) => getId(m.personId) === selectedPersonId) ?? null
  const selectedTickets = selectedMembership
    ? (ticketsByAccountId.get(selectedMembership.personId.jiraAccountId) ?? [])
    : []

  // ADR 0003: only ever render a column the selected person actually has a
  // ticket in right now - an empty-but-possible column (e.g. "Merged" with
  // nothing there) is omitted entirely, not shown blank.
  const occupiedColumns = useMemo(
    () =>
      statuses
        .map((status) => ({ status, tickets: selectedTickets.filter((t) => t.status === status.name) }))
        .filter((column) => column.tickets.length > 0),
    [statuses, selectedTickets],
  )

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center gap-3">
        <label htmlFor="status-sprint-select" className="text-xs font-medium text-slate-500 dark:text-slate-300">
          Sprint
        </label>
        {loadingSprints ? (
          <span className="text-sm text-slate-400 dark:text-slate-500">Loading sprints…</span>
        ) : sprintsError ? (
          <span className="text-sm text-red-600 dark:text-red-400">Error: {sprintsError}</span>
        ) : sprints.length === 0 ? (
          <span className="text-sm text-slate-400 dark:text-slate-500">No sprints found for this team&apos;s board.</span>
        ) : (
          <select
            id="status-sprint-select"
            value={selectedSprintId ?? ''}
            onChange={(e) => setSelectedSprintId(e.target.value)}
            className="rounded-lg border border-slate-200 bg-slate-50 px-2 py-1.5 text-sm text-slate-700 focus:border-fuchsia-400/60 focus:outline-none dark:border-white/10 dark:bg-white/5 dark:text-slate-200"
          >
            {sprints.map((sprint) => (
              <option key={getId(sprint)} value={getId(sprint)}>
                {sprint.name} ({sprint.state})
              </option>
            ))}
          </select>
        )}
      </div>

      {selectedSprintId && (
        <div className="flex flex-wrap items-start gap-5">
          <div className="w-64 shrink-0 rounded-2xl border border-slate-200 bg-white p-3 shadow-sm dark:border-white/10 dark:bg-white/5 dark:shadow-none dark:backdrop-blur-md">
            <h2 className="px-1 pb-2 text-xs font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">
              Team
            </h2>
            {loadingMemberships ? (
              <p className="px-1 text-sm text-slate-400 dark:text-slate-500">Loading roster…</p>
            ) : memberships.length === 0 ? (
              <p className="px-1 text-sm text-slate-400 dark:text-slate-500">No one on this team yet.</p>
            ) : (
              <ul aria-label="Team roster" className="space-y-0.5">
                {memberships.map((membership) => {
                  const personId = getId(membership.personId) ?? ''
                  const active = personId === selectedPersonId
                  const syncing = syncingPersonId === personId
                  const summary = summaryFor(membership.personId.jiraAccountId)
                  return (
                    <li key={getId(membership)}>
                      <div
                        className={`flex items-center gap-1.5 rounded-lg px-1.5 py-1.5 ${
                          active
                            ? 'bg-gradient-to-r from-violet-500/10 to-fuchsia-500/10'
                            : 'hover:bg-slate-100 dark:hover:bg-white/5'
                        }`}
                      >
                        <button
                          type="button"
                          onClick={() => setSelectedPersonId(personId)}
                          aria-label={membership.personId.name}
                          className="min-w-0 flex-1 text-left"
                        >
                          <div
                            className={`truncate text-sm font-medium ${
                              active ? 'text-fuchsia-700 dark:text-fuchsia-300' : 'text-slate-700 dark:text-slate-200'
                            }`}
                          >
                            {membership.personId.name}
                          </div>
                          <div className="text-[10px] text-slate-400" title={exactTime(summary.lastSyncedAt)}>
                            {summary.count} ticket{summary.count === 1 ? '' : 's'} &middot; {relativeTime(summary.lastSyncedAt)}
                          </div>
                        </button>
                        <button
                          type="button"
                          onClick={() => syncPerson(personId).catch(() => {})}
                          disabled={syncing}
                          aria-label={`Sync ${membership.personId.name}'s tickets`}
                          title={`Sync ${membership.personId.name}'s tickets`}
                          className="shrink-0 rounded-full p-1 text-slate-400 hover:bg-slate-200 hover:text-slate-700 disabled:opacity-40 dark:hover:bg-white/10 dark:hover:text-slate-200"
                        >
                          {syncing ? '…' : '↻'}
                        </button>
                      </div>
                    </li>
                  )
                })}
              </ul>
            )}
            {syncError && <p className="mt-2 px-1 text-xs text-red-600 dark:text-red-400">Error: {syncError}</p>}
          </div>

          <div className="min-w-0 flex-1 space-y-3">
            {loadingTickets ? (
              <p className="text-sm text-slate-400 dark:text-slate-500">Loading tickets…</p>
            ) : ticketsError ? (
              <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-300">
                Error: {ticketsError}
              </p>
            ) : !selectedMembership ? (
              <p className="text-sm text-slate-400 dark:text-slate-500">
                No one on this team yet — use &quot;Manage teams&quot; to add people.
              </p>
            ) : occupiedColumns.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-slate-300 p-8 text-center dark:border-white/10">
                <p className="text-sm text-slate-500 dark:text-slate-400">
                  No tickets discovered yet — sync {selectedMembership.personId.name} from the roster to fetch them.
                </p>
              </div>
            ) : (
              <div
                aria-label={`${selectedMembership.personId.name}'s board`}
                className="flex gap-3 overflow-x-auto pb-2"
              >
                {occupiedColumns.map(({ status, tickets: columnTickets }) => (
                  <div key={status.name} className="w-56 shrink-0">
                    <div
                      className={`rounded-t-lg border-t-2 bg-slate-50 px-3 py-1.5 text-xs font-bold uppercase tracking-wide text-slate-500 dark:bg-white/5 dark:text-slate-400 ${CATEGORY_ACCENT[status.category]}`}
                    >
                      {status.name} <span className="text-slate-400 dark:text-slate-500">({columnTickets.length})</span>
                    </div>
                    <div className="flex min-h-16 flex-col gap-2 rounded-b-lg border border-t-0 border-slate-200 bg-slate-50/50 p-2 dark:border-white/10 dark:bg-white/[0.02]">
                      {columnTickets.map((t) => (
                        <TicketCard key={t.jiraKey} ticket={t} />
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
