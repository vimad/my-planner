import { useMemo, useState, type FormEvent } from 'react'
import { useSprintPlan } from '../hooks/useSprintPlan'
import { getId } from '../utils/getId'
import type { SprintCapacity, SprintPlanEntry, Team } from '../types'

function relativeTime(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime()
  const diffMin = Math.round(diffMs / 60000)
  if (diffMin < 1) return 'just now'
  if (diffMin < 60) return `${diffMin}m ago`
  const diffHr = Math.round(diffMin / 60)
  if (diffHr < 24) return `${diffHr}h ago`
  const diffDay = Math.round(diffHr / 24)
  return `${diffDay}d ago`
}

function formatHours(hours: number): string {
  return `${Math.round(hours * 10) / 10}h`
}

function ProgressBar({ planned, available }: { planned: number; available: number }) {
  const pct = available > 0 ? Math.min(100, (planned / available) * 100) : 0
  const over = planned > available
  return (
    <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-100 dark:bg-white/10">
      <div
        className={`h-full rounded-full ${over ? 'bg-red-500' : 'bg-gradient-to-r from-violet-500 to-fuchsia-500'}`}
        style={{ width: `${pct}%` }}
      />
    </div>
  )
}

// One compact card per current TeamMembership, sourced straight from
// GET /api/teams/:teamId/sprints/:sprintId/capacity - see ticket 14.
function CapacityCard({ capacity }: { capacity: SprintCapacity }) {
  return (
    <div className="w-44 shrink-0 rounded-xl border border-slate-200 bg-white p-3 shadow-sm dark:border-white/10 dark:bg-white/5 dark:shadow-none">
      <div className="flex items-baseline justify-between gap-1">
        <span className="truncate text-sm font-semibold text-slate-900 dark:text-slate-100">{capacity.personName}</span>
        <span className="shrink-0 text-[10px] font-semibold uppercase text-slate-400">{capacity.role}</span>
      </div>
      <div className="mt-2">
        <ProgressBar planned={capacity.planned} available={capacity.available} />
        <div className="mt-1 flex justify-between text-[11px] text-slate-500 dark:text-slate-400">
          <span>{formatHours(capacity.planned)} planned</span>
          <span>{formatHours(capacity.available)} avail</span>
        </div>
      </div>
      <div
        className={`mt-1 text-xs font-semibold ${
          capacity.remaining < 0 ? 'text-red-600 dark:text-red-400' : 'text-slate-600 dark:text-slate-300'
        }`}
      >
        {formatHours(capacity.remaining)} remaining
      </div>
      {capacity.leaveDays > 0 && <div className="mt-0.5 text-[11px] text-slate-400">{capacity.leaveDays}d leave</div>}
    </div>
  )
}

// The capacity strip 404s (planConfigured=false) until someone has entered
// this sprint's working days at least once - no dedicated ticket owns that
// input, so it lives here as the minimal thing needed to unblock the strip
// this ticket is actually responsible for rendering.
function WorkingDaysForm({ saving, onSave }: { saving: boolean; onSave: (days: number) => Promise<void> }) {
  const [value, setValue] = useState('10')
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    const parsed = Number(value)
    if (!Number.isFinite(parsed) || parsed <= 0) {
      setError('Enter a positive number of working days')
      return
    }
    setError(null)
    try {
      await onSave(parsed)
    } catch (err) {
      setError((err as Error).message)
    }
  }

  return (
    <form
      onSubmit={handleSubmit}
      aria-label="Set working days for this sprint"
      className="flex flex-wrap items-center gap-2 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-white/10 dark:bg-white/5 dark:shadow-none dark:backdrop-blur-md"
    >
      <span className="text-sm text-slate-500 dark:text-slate-400">
        No working days set for this sprint yet — capacity can&apos;t be computed until they are.
      </span>
      <input
        type="number"
        min={1}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        aria-label="Working days"
        className="w-20 rounded-lg border border-slate-200 bg-slate-50 px-2 py-1 text-sm focus:border-fuchsia-400/60 focus:outline-none dark:border-white/10 dark:bg-white/5 dark:text-slate-100"
      />
      <button
        type="submit"
        disabled={saving}
        className="rounded-lg bg-gradient-to-r from-violet-500 to-fuchsia-500 px-3 py-1.5 text-sm font-semibold text-white hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {saving ? 'Saving…' : 'Save'}
      </button>
      {error && <span className="text-xs text-red-600 dark:text-red-400">{error}</span>}
    </form>
  )
}

function AddToPlanForm({
  value,
  onChange,
  onSubmit,
  loading,
  error,
}: {
  value: string
  onChange: (v: string) => void
  onSubmit: (e: FormEvent) => void
  loading: boolean
  error: string | null
}) {
  return (
    <form
      onSubmit={onSubmit}
      aria-label="Add to plan"
      className="flex flex-wrap items-center gap-2 rounded-xl border border-dashed border-slate-300 bg-white/60 px-3 py-2 dark:border-white/15 dark:bg-white/5"
    >
      <span className="text-sm text-slate-400 dark:text-slate-500">Add to plan — WOSMVP-</span>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="14802"
        disabled={loading}
        aria-label="Ticket number to add to plan"
        className="w-32 rounded-lg border border-slate-200 bg-slate-50 px-2 py-1 text-sm focus:border-fuchsia-400/60 focus:outline-none dark:border-white/10 dark:bg-white/5 dark:text-slate-100"
      />
      <button
        type="submit"
        disabled={loading || !value.trim()}
        className="rounded-lg border border-slate-200 px-3 py-1 text-sm hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-50 dark:border-white/10 dark:hover:bg-white/5"
      >
        {loading ? 'Loading…' : 'Add'}
      </button>
      {error && <span className="text-xs text-red-600 dark:text-red-400">{error}</span>}
    </form>
  )
}

// A read-only ticket-number pill (drag-reorder is ticket 19). The full
// title/status/staleness lives in the title tooltip rather than on the face
// of the badge, per the ticket's "enough to identify the ticket".
function TicketBadge({ entry, unmapped }: { entry: SprintPlanEntry; unmapped?: boolean }) {
  const ticket = entry.ticketId
  const tooltip = `${ticket.title} — ${ticket.status}, synced ${relativeTime(ticket.lastSyncedAt)}`
  return (
    <span
      title={tooltip}
      className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 font-mono text-[11px] font-semibold shadow-sm ${
        unmapped
          ? 'border-amber-300 bg-amber-100 text-amber-700 dark:border-amber-500/30 dark:bg-amber-500/20 dark:text-amber-300'
          : 'border-slate-200 bg-slate-100 text-slate-600 dark:border-white/10 dark:bg-white/10 dark:text-slate-300'
      }`}
    >
      {ticket.jiraKey.replace(/^WOSMVP-/, '')}
      {ticket.type && (
        <span className="font-sans text-[9px] font-normal uppercase tracking-wide opacity-70">{ticket.type}</span>
      )}
    </span>
  )
}

function PersonRow({ name, entries, unmapped = false }: { name: string; entries: SprintPlanEntry[]; unmapped?: boolean }) {
  return (
    <div
      aria-label={`Tickets for ${name}`}
      className="grid grid-cols-[10rem_1fr] items-start gap-3 border-b border-slate-100 py-2.5 last:border-0 dark:border-white/5"
    >
      <span
        className={`pt-0.5 text-sm font-medium ${
          unmapped ? 'text-amber-700 dark:text-amber-300' : 'text-slate-800 dark:text-slate-100'
        }`}
      >
        {unmapped ? `⚠ ${name}` : name}
      </span>
      {entries.length === 0 ? (
        <span className={`pt-0.5 text-xs ${unmapped ? 'text-amber-600/70 dark:text-amber-300/60' : 'text-slate-400'}`}>
          No tickets planned
        </span>
      ) : (
        <div className="flex flex-wrap gap-1.5">
          {entries.map((entry) => (
            <TicketBadge key={getId(entry) ?? entry.ticketId.jiraKey} entry={entry} unmapped={unmapped} />
          ))}
        </div>
      )}
    </div>
  )
}

// Ticket 18's core Planning surface: sprint selector, capacity strip, the
// "Add to plan" entry bar, and the "Tickets by person" table - all
// read-only towards drag order (ticket 19) and epics (ticket 20). Mounted
// by SprintShell at /sprint/:teamSlug/planning once a team is resolved.
export function PlanningView({ team }: { team: Team }) {
  const teamId = getId(team) ?? null
  const {
    sprints,
    loadingSprints,
    sprintsError,
    selectedSprintId,
    setSelectedSprintId,
    memberships,
    loadingMemberships,
    planConfigured,
    capacity,
    entries,
    loadingPlan,
    planError,
    savingWorkingDays,
    setWorkingDays,
    addingTicket,
    addTicketError,
    addTicket,
  } = useSprintPlan(teamId)

  const [entryValue, setEntryValue] = useState('')

  async function handleAdd(e: FormEvent) {
    e.preventDefault()
    try {
      await addTicket(entryValue)
      setEntryValue('')
    } catch {
      // addTicketError already surfaces the failure - keep the typed value
      // so the user can correct/retry without retyping it.
    }
  }

  // One bucket of SprintPlanEntry per current TeamMembership, keyed by that
  // membership's Person.jiraAccountId (the current-assignee match, ADR
  // 0001) - plus whatever's left over as "unmapped". Recomputed whenever
  // either input changes, not per-render.
  const { ticketsByMembershipId, unmappedEntries } = useMemo(() => {
    const byMembership = new Map<string, SprintPlanEntry[]>()
    const mappedAccountIds = new Set<string>()

    for (const membership of memberships) {
      const accountId = membership.personId.jiraAccountId
      mappedAccountIds.add(accountId)
      const rows = entries
        .filter((entry) => entry.ticketId.assigneeAccountId === accountId)
        .sort((a, b) => a.order - b.order)
      byMembership.set(getId(membership) ?? '', rows)
    }

    const unmapped = entries
      .filter((entry) => !entry.ticketId.assigneeAccountId || !mappedAccountIds.has(entry.ticketId.assigneeAccountId))
      .sort((a, b) => a.order - b.order)

    return { ticketsByMembershipId: byMembership, unmappedEntries: unmapped }
  }, [memberships, entries])

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center gap-3">
        <label htmlFor="planning-sprint-select" className="text-xs font-medium text-slate-500 dark:text-slate-300">
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
            id="planning-sprint-select"
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
        <>
          {loadingPlan ? (
            <p className="text-sm text-slate-400 dark:text-slate-500">Loading capacity…</p>
          ) : planError ? (
            <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-300">
              Error: {planError}
            </p>
          ) : !planConfigured ? (
            <WorkingDaysForm saving={savingWorkingDays} onSave={setWorkingDays} />
          ) : (
            <div className="flex gap-3 overflow-x-auto pb-1">
              {capacity.length === 0 ? (
                <span className="text-sm text-slate-400 dark:text-slate-500">No one on this team yet.</span>
              ) : (
                capacity.map((c) => <CapacityCard key={c.teamMembershipId} capacity={c} />)
              )}
            </div>
          )}

          <AddToPlanForm
            value={entryValue}
            onChange={setEntryValue}
            onSubmit={handleAdd}
            loading={addingTicket}
            error={addTicketError}
          />

          <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-white/10 dark:bg-white/5 dark:shadow-none dark:backdrop-blur-md">
            <h2 className="mb-3 text-lg font-semibold text-slate-900 dark:text-slate-100">Tickets by person</h2>
            {loadingMemberships ? (
              <p className="text-sm text-slate-400 dark:text-slate-500">Loading roster…</p>
            ) : memberships.length === 0 ? (
              <p className="text-sm text-slate-400 dark:text-slate-500">
                No one on this team yet — use &quot;Manage teams&quot; to add people.
              </p>
            ) : (
              <div>
                {memberships.map((membership) => (
                  <PersonRow
                    key={getId(membership)}
                    name={membership.personId.name}
                    entries={ticketsByMembershipId.get(getId(membership) ?? '') ?? []}
                  />
                ))}
                <PersonRow name="Unmapped" entries={unmappedEntries} unmapped />
              </div>
            )}
          </div>
        </>
      )}
    </div>
  )
}
