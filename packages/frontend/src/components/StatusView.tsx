import { useEffect, useMemo, useState } from 'react'
import { Copy, Shuffle } from 'lucide-react'
import { useStatusView } from '../hooks/useStatusView'
import { SprintSelect } from './SprintSelect'
import { ExternalLink } from './ExternalLink'
import { jiraIssueUrl } from '../constants/jira'
import { getId } from '../utils/getId'
import { isPoEligibleTicket, ticketTypeAccent } from '../utils/ticketType'
import type { Team, TeamMembership, Ticket, TicketPoAssignmentSummary } from '../types'

// Fisher-Yates, new array each call - used to let the roster be shuffled for
// standups (different reading order on different days) without touching the
// server; order is plain component state so a page refresh drops back to
// `memberships`' fetched order.
function shuffled<T>(items: T[]): T[] {
  const next = [...items]
  for (let i = next.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[next[i], next[j]] = [next[j], next[i]]
  }
  return next
}

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

// Jira's board-column config (Status.name, services/statusSync.ts's
// refreshStatusSet) and an issue's actual workflow status (Ticket.status,
// straight off `fields.status.name`) are two independently-editable Jira
// surfaces that happen to describe "the same" status in the common case -
// but nothing guarantees matching casing between them. Confirmed live
// against wealthos.atlassian.net: a ticket's `status` came back "DEV WIP"
// while the mirrored board column's `name` is "Dev WIP" (and "Merged"
// tickets against a "MERGED" column) - an exact string match silently
// drops the ticket from every column, which reads as "nothing synced"
// even though the sync worked.
function sameStatus(ticketStatus: string, statusName: string): boolean {
  return ticketStatus.trim().toLowerCase() === statusName.trim().toLowerCase()
}

function exactTime(iso: string | null): string {
  return iso ? new Date(iso).toLocaleString() : 'never synced'
}

// Card background color-codes by Jira issue type, using the same red/green/
// blue families as PlanningView's ticket-badge coloring (ticketTypeAccent)
// so a ticket's color means the same thing on both surfaces - dark-mode fill
// is a lighter /10 opacity than the badge's /20 since this tints a whole
// card rather than a small pill. A "Sub-task" buckets as `task` (its type
// name contains "task"), which reads fine as the same light-blue family.
// Anything else (type unknown, epic, etc.) keeps the plain white/translucent
// card per docs/ui-conventions.md's card archetype.
function cardAccentClasses(type: string | null): string {
  const accent = ticketTypeAccent(type)
  if (accent === 'bug') return 'border-red-300 bg-red-100 dark:border-red-500/30 dark:bg-red-500/10'
  if (accent === 'story') return 'border-green-300 bg-green-100 dark:border-green-500/30 dark:bg-green-500/10'
  if (accent === 'task') return 'border-blue-300 bg-blue-100 dark:border-blue-500/30 dark:bg-blue-500/10'
  return 'border-slate-200 bg-white dark:border-white/10 dark:bg-white/5'
}

// A sub-task's own title says little on its own (e.g. "Fix the thing") -
// showing which Story/Bug it belongs to, above a divider, gives it context
// at a glance. `parent` comes from the same sprint's already-fetched
// `tickets` list (Ticket.parentKey is a bare key, see types.ts) - when the
// parent wasn't independently synced and so has no local Ticket doc, this
// still links out to Jira using the bare key rather than showing nothing.
function ParentStrip({ parentKey, parent }: { parentKey: string; parent: Ticket | undefined }) {
  return (
    <ExternalLink
      href={jiraIssueUrl(parentKey)}
      title={parent ? `Parent: ${parent.title}` : `Open parent ${parentKey} in Jira`}
      className="mb-1.5 flex items-center gap-1 border-b border-slate-200 pb-1.5 text-[11px] text-slate-500 hover:text-fuchsia-600 dark:border-white/10 dark:text-slate-400 dark:hover:text-fuchsia-300"
    >
      <span className="shrink-0">↳</span>
      <span className="truncate">{parent ? parent.title : parentKey}</span>
      <span className="shrink-0">↗</span>
    </ExternalLink>
  )
}

// A sub-task's own Jira type is always "Sub-task" - not the bug/story
// distinction that actually matters for at-a-glance triage, so a sub-task
// colors by its parent's type instead (falling back to its own type only
// when the parent wasn't independently synced locally, see ParentStrip).
function accentTypeFor(ticket: Ticket, parentTicket: Ticket | undefined): string | null {
  if (ticket.parentKey && parentTicket) return parentTicket.type
  return ticket.type
}

// A small icon button next to the ticket key that copies its full Jira URL
// (not just the bare key) so the clipboard contents are pasteable straight
// into Slack/etc. as a working link. "Copied!" only shows once the write
// actually resolves (see docs/ui-conventions.md's "click-triggered variant"
// of the hover-tooltip archetype for the confirmation styling).
function CopyLinkButton({ jiraKey }: { jiraKey: string }) {
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    if (!copied) return
    const timer = setTimeout(() => setCopied(false), 1200)
    return () => clearTimeout(timer)
  }, [copied])

  return (
    <span className="relative inline-flex shrink-0">
      <button
        type="button"
        onClick={() => {
          navigator.clipboard
            .writeText(jiraIssueUrl(jiraKey))
            .then(() => setCopied(true))
            .catch(() => {})
        }}
        aria-label={`Copy link to ${jiraKey}`}
        title="Copy Jira link"
        className="rounded-full p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-white/10 dark:hover:text-slate-200"
      >
        <Copy size={11} />
      </button>
      {copied && (
        <span
          role="status"
          className="pointer-events-none absolute left-1/2 top-full z-10 mt-1 -translate-x-1/2 whitespace-nowrap rounded-lg border border-slate-200 bg-white px-2 py-1 text-[11px] font-normal normal-case text-slate-700 shadow-lg dark:border-white/10 dark:bg-[#1a1229] dark:text-slate-200"
        >
          Copied!
        </span>
      )}
    </span>
  )
}

// `estimateHours` is only ever passed for a PO's board (StatusView's
// selectedMembership.role === 'PO') - the user's own request ("for POs only
// in this view show the estimated hours as well in the ticket card"), so
// every other role's card renders exactly as before (prop omitted, nothing
// shown).
function TicketCard({
  ticket,
  parentTicket,
  estimateHours,
}: {
  ticket: Ticket
  parentTicket: Ticket | undefined
  estimateHours?: number | null
}) {
  return (
    <div
      className={`rounded-xl border p-3 shadow-sm dark:shadow-none dark:backdrop-blur-md ${cardAccentClasses(accentTypeFor(ticket, parentTicket))}`}
    >
      {ticket.parentKey && <ParentStrip parentKey={ticket.parentKey} parent={parentTicket} />}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-0.5">
          <span className="font-mono text-[11px] font-semibold text-fuchsia-600 dark:text-fuchsia-300">
            {ticket.jiraKey}
          </span>
          <CopyLinkButton jiraKey={ticket.jiraKey} />
        </div>
        <ExternalLink
          href={jiraIssueUrl(ticket.jiraKey)}
          aria-label={`Open ${ticket.jiraKey} in Jira`}
          title="Open in Jira"
          className="shrink-0 rounded-full px-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-white/10 dark:hover:text-slate-200"
        >
          ↗
        </ExternalLink>
      </div>
      <p className="mt-1.5 text-sm text-slate-800 dark:text-slate-100">{ticket.title}</p>
      <div className="mt-2 flex items-center justify-between">
        {estimateHours != null ? (
          <span className="shrink-0 text-[10px] text-slate-500 dark:text-slate-400">{estimateHours}h est</span>
        ) : (
          <span />
        )}
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
    poAssignments,
    selectedPersonId,
    setSelectedPersonId,
    syncingPersonId,
    syncError,
    syncPerson,
  } = useStatusView(teamId)

  // Client-side-only display order for the roster (standup reading order) -
  // reset whenever the fetched roster itself changes, otherwise left alone
  // so shuffling doesn't get clobbered by unrelated re-renders.
  const [rosterOrder, setRosterOrder] = useState<TeamMembership[]>(memberships)
  useEffect(() => {
    setRosterOrder(memberships)
  }, [memberships])

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

  // PO assignment join, keyed by ticket id - app-side data (never Jira's
  // real assignee, CLAUDE.md/CONTEXT.md), so a PO's board can't be built
  // from ticketsByAccountId the way everyone else's is.
  const poAssignmentByTicketId = useMemo(() => {
    const map = new Map<string, TicketPoAssignmentSummary>()
    for (const a of poAssignments) map.set(a.ticketId, a)
    return map
  }, [poAssignments])

  // Same shape as ticketsByAccountId above, but for a PO's Story tickets -
  // keyed by the assigned PO's Person id (poPersonId) rather than a Jira
  // assigneeAccountId, since that's the only match key a PO assignment has.
  const ticketsByPoPersonId = useMemo(() => {
    const map = new Map<string, Ticket[]>()
    for (const t of tickets) {
      if (!isPoEligibleTicket(t.type)) continue
      const poPersonId = poAssignmentByTicketId.get(getId(t) ?? '')?.poPersonId
      if (!poPersonId) continue
      const list = map.get(poPersonId) ?? []
      list.push(t)
      map.set(poPersonId, list)
    }
    return map
  }, [tickets, poAssignmentByTicketId])

  // Lookup for a sub-task's ParentStrip - the parent Story/Bug's own Ticket
  // doc, if the sprint/team-scoped `tickets` fetch (route's query isn't
  // assignee-filtered) happened to include it. Built from the same flat
  // list as ticketsByAccountId above, just keyed differently.
  const ticketsByKey = useMemo(() => {
    const map = new Map<string, Ticket>()
    for (const t of tickets) map.set(t.jiraKey, t)
    return map
  }, [tickets])

  // A PO's roster-row summary/board is sourced from ticketsByPoPersonId (app-
  // side Story assignment), never ticketsByAccountId - a PO's own
  // jiraAccountId is irrelevant here (CLAUDE.md: "no assignee pieces about
  // it, it's just data from this app side").
  function summaryFor(membership: TeamMembership): { count: number; lastSyncedAt: string | null } {
    const list =
      membership.role === 'PO'
        ? (ticketsByPoPersonId.get(getId(membership.personId) ?? '') ?? [])
        : (ticketsByAccountId.get(membership.personId.jiraAccountId) ?? [])
    const lastSyncedAt = list.reduce<string | null>((latest, t) => {
      if (!latest || new Date(t.lastSyncedAt) > new Date(latest)) return t.lastSyncedAt
      return latest
    }, null)
    return { count: list.length, lastSyncedAt }
  }

  const selectedMembership = memberships.find((m) => getId(m.personId) === selectedPersonId) ?? null
  const isPoSelected = selectedMembership?.role === 'PO'
  const selectedTickets = selectedMembership
    ? isPoSelected
      ? (ticketsByPoPersonId.get(selectedPersonId ?? '') ?? [])
      : (ticketsByAccountId.get(selectedMembership.personId.jiraAccountId) ?? [])
    : []

  // A sub-task's card already surfaces its parent via ParentStrip - if that
  // parent is also assigned to this same person, it would otherwise also get
  // its own separate board card, duplicating the same ticket. Excluded from
  // the board here; still counted in the roster's per-person ticket count
  // (summaryFor, above `selectedTickets` untouched).
  const boardTickets = useMemo(() => {
    const parentKeys = new Set(selectedTickets.filter((t) => t.parentKey).map((t) => t.parentKey as string))
    return selectedTickets.filter((t) => !parentKeys.has(t.jiraKey))
  }, [selectedTickets])

  // ADR 0003: only ever render a column the selected person actually has a
  // ticket in right now - an empty-but-possible column (e.g. "Merged" with
  // nothing there) is omitted entirely, not shown blank.
  const occupiedColumns = useMemo(
    () =>
      statuses
        .map((status) => ({ status, tickets: boardTickets.filter((t) => sameStatus(t.status, status.name)) }))
        .filter((column) => column.tickets.length > 0),
    [statuses, boardTickets],
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
          <SprintSelect
            id="status-sprint-select"
            sprints={sprints}
            selectedSprintId={selectedSprintId}
            onSelect={setSelectedSprintId}
          />
        )}
      </div>

      {selectedSprintId && (
        <div className="flex flex-wrap items-start gap-5">
          <div className="w-64 shrink-0 rounded-2xl border border-slate-200 bg-white p-3 shadow-sm dark:border-white/10 dark:bg-white/5 dark:shadow-none dark:backdrop-blur-md">
            <div className="flex items-center justify-between px-1 pb-2">
              <h2 className="text-xs font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                Team
              </h2>
              {rosterOrder.length > 1 && (
                <button
                  type="button"
                  onClick={() => setRosterOrder((prev) => shuffled(prev))}
                  aria-label="Shuffle team order"
                  title="Shuffle team order"
                  className="shrink-0 rounded-full p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-white/10 dark:hover:text-slate-200"
                >
                  <Shuffle size={14} />
                </button>
              )}
            </div>
            {loadingMemberships ? (
              <p className="px-1 text-sm text-slate-400 dark:text-slate-500">Loading roster…</p>
            ) : rosterOrder.length === 0 ? (
              <p className="px-1 text-sm text-slate-400 dark:text-slate-500">No one on this team yet.</p>
            ) : (
              <ul aria-label="Team roster" className="space-y-0.5">
                {rosterOrder.map((membership) => {
                  const personId = getId(membership.personId) ?? ''
                  const active = personId === selectedPersonId
                  const syncing = syncingPersonId === personId
                  const summary = summaryFor(membership)
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
                  {isPoSelected
                    ? `No stories assigned to ${selectedMembership.personId.name} yet — assign them as PO from a Story's popup in Planning.`
                    : `No tickets discovered yet — sync ${selectedMembership.personId.name} from the roster to fetch them.`}
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
                        <TicketCard
                          key={t.jiraKey}
                          ticket={t}
                          parentTicket={t.parentKey ? ticketsByKey.get(t.parentKey) : undefined}
                          estimateHours={isPoSelected ? (poAssignmentByTicketId.get(getId(t) ?? '')?.poEstimateHours ?? null) : undefined}
                        />
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
