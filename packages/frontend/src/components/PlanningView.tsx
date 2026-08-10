import { DndContext, KeyboardSensor, PointerSensor, closestCenter, useSensor, useSensors } from '@dnd-kit/core'
import type { DragEndEvent } from '@dnd-kit/core'
import { SortableContext, arrayMove, rectSortingStrategy, sortableKeyboardCoordinates, useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { useEpics } from '../hooks/useEpics'
import { useSprintPlan, type SprintPlanEntryOrderPatch } from '../hooks/useSprintPlan'
import { DevQaAssignmentPopup } from './DevQaAssignmentPopup'
import { EpicPillStrip } from './EpicPillStrip'
import { getId } from '../utils/getId'
import type { SprintCapacity, SprintPlanEntry, Team } from '../types'

// A ticket's placement within one "Tickets by person" row. `role` is set
// only for a Split ticket's dev or qa sub-placement (CONTEXT.md "Split
// ticket") - the same SprintPlanEntry can appear as two placements, one per
// resolved role. A non-split entry has exactly one placement, `role`
// omitted.
interface PlacedEntry {
  entry: SprintPlanEntry
  role?: 'dev' | 'qa'
}

function placementKey(p: PlacedEntry): string {
  return `${getId(p.entry) ?? p.entry.ticketId.jiraKey}-${p.role ?? 'main'}`
}

// Which of SprintPlanEntry's three independent order namespaces (ticket 23's
// devOrder/qaOrder alongside the original order) a placement belongs to -
// see SprintPlanEntry.ts. A non-split placement (`role` unset) always uses
// `order`; a Split ticket's dev-row or qa-row placement uses only its own
// role's field.
function placementField(p: PlacedEntry): 'order' | 'devOrder' | 'qaOrder' {
  if (p.role === 'dev') return 'devOrder'
  if (p.role === 'qa') return 'qaOrder'
  return 'order'
}

function placementFieldValue(p: PlacedEntry): number {
  const field = placementField(p)
  if (field === 'devOrder') return p.entry.devOrder ?? 0
  if (field === 'qaOrder') return p.entry.qaOrder ?? 0
  return p.entry.order
}

// Ticket 19's drag-reorder save-on-drop: reorders `placements` per the drag
// result, then re-numbers each field-type group (order / devOrder / qaOrder)
// within the row independently, 0-indexed by its new position among only
// its own group - mirroring nextOrderForAssignee/nextOrderForRole's
// server-side placement math. Only entries whose field value actually
// changed are returned, so a drop that doesn't cross a group boundary
// doesn't PATCH unrelated entries.
function computeReorderPatches(placements: PlacedEntry[], oldIndex: number, newIndex: number): SprintPlanEntryOrderPatch[] {
  const reordered = arrayMove(placements, oldIndex, newIndex)
  const counters: Record<'order' | 'devOrder' | 'qaOrder', number> = { order: 0, devOrder: 0, qaOrder: 0 }
  const patches: SprintPlanEntryOrderPatch[] = []
  for (const p of reordered) {
    const field = placementField(p)
    const value = counters[field]++
    if (placementFieldValue(p) !== value) {
      patches.push({ entryId: getId(p.entry) ?? '', field, value })
    }
  }
  return patches
}

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

// Ticket 19's global full-resync action - deliberately the only resync
// affordance anywhere in the Planning view (no per-ticket resync button, per
// the spec). Full syncs every ticket already in the plan (POST
// /api/sprint-plan-entries/sync, ticket 13) then refetches capacity+entries
// together, so every ticket's staleness (TicketBadge's title tooltip) and
// any reassignment-driven row move land in one pass.
function SyncPlanButton({ syncing, error, onSync }: { syncing: boolean; error: string | null; onSync: () => void }) {
  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        onClick={onSync}
        disabled={syncing}
        className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm font-semibold text-slate-600 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-50 dark:border-white/10 dark:text-slate-300 dark:hover:bg-white/5"
      >
        {syncing ? 'Syncing…' : 'Sync plan'}
      </button>
      {error && <span className="text-xs text-red-600 dark:text-red-400">{error}</span>}
    </div>
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

// A ticket-number pill, wrapped by SortableTicketBadge (below) for drag-
// reorder within a real per-person row (ticket 19) - the Unmapped/Needs
// dev/qa catch-all rows render it bare, undraggable, since their placements
// don't share a single meaningful order group (see PersonRow). In its
// `needsAssignment` variant (ticket 24) it's itself the click target
// that opens DevQaAssignmentPopup for that ticket. The full title/status/
// staleness lives in the title tooltip rather than on the face of the
// badge, per the ticket's "enough to identify the ticket". `role` renders a
// small "DEV"/"QA" sub-label alongside the existing type sub-label,
// distinguishing a Split ticket's two placements (ticket 24) - omitted
// entirely for a non-split entry's single placement.
function TicketBadge({
  entry,
  role,
  unmapped,
  needsAssignment,
  onFlagClick,
}: {
  entry: SprintPlanEntry
  role?: 'dev' | 'qa'
  unmapped?: boolean
  needsAssignment?: boolean
  onFlagClick?: () => void
}) {
  const ticket = entry.ticketId
  const tooltip = `${ticket.title} — ${ticket.status}, synced ${relativeTime(ticket.lastSyncedAt)}`
  // needsAssignment gets its own sky treatment (docs/ui-conventions.md
  // "needs attention, click to resolve" flag) - deliberately distinct from
  // the amber Unmapped treatment, which stays pixel-for-pixel unchanged for
  // a real-but-off-roster Jira assignee.
  const colorClasses = needsAssignment
    ? 'border-sky-300 bg-sky-100 text-sky-700 dark:border-sky-500/30 dark:bg-sky-500/20 dark:text-sky-300'
    : unmapped
      ? 'border-amber-300 bg-amber-100 text-amber-700 dark:border-amber-500/30 dark:bg-amber-500/20 dark:text-amber-300'
      : 'border-slate-200 bg-slate-100 text-slate-600 dark:border-white/10 dark:bg-white/10 dark:text-slate-300'
  const baseClasses = `inline-flex items-center gap-1 rounded-full border px-2 py-0.5 font-mono text-[11px] font-semibold shadow-sm ${colorClasses}`

  const content = (
    <>
      {ticket.jiraKey.replace(/^WOSMVP-/, '')}
      {role && (
        <span className="font-sans text-[9px] font-normal uppercase tracking-wide opacity-70">{role.toUpperCase()}</span>
      )}
      {ticket.type && (
        <span className="font-sans text-[9px] font-normal uppercase tracking-wide opacity-70">{ticket.type}</span>
      )}
    </>
  )

  if (needsAssignment) {
    return (
      <button
        type="button"
        title={tooltip}
        onClick={onFlagClick}
        aria-label={`Assign dev/qa for ${ticket.jiraKey}`}
        className={`${baseClasses} cursor-pointer hover:opacity-80`}
      >
        {content}
      </button>
    )
  }

  return (
    <span title={tooltip} className={baseClasses}>
      {content}
    </span>
  )
}

// Makes one badge draggable/sortable via dnd-kit, mirroring TodoDetail's
// SortableLinkedTodoRow / BoardsView's SortableBoardCard: a small separate
// drag-handle button (not the badge itself) owns useSortable's
// listeners/attributes, keeping the needsAssignment variant's own onClick
// (never used here - only a resolved, non-flagged placement ever lands in a
// real per-person row, see ticketsByMembershipId) conflict-free by
// construction.
function SortableTicketBadge({ placement }: { placement: PlacedEntry }) {
  const key = placementKey(placement)
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: key })
  const style = { transform: CSS.Transform.toString(transform), transition }
  const label = placement.role ? `${placement.entry.ticketId.jiraKey} (${placement.role})` : placement.entry.ticketId.jiraKey

  return (
    <span ref={setNodeRef} style={style} className={`inline-flex items-center gap-0.5 ${isDragging ? 'opacity-50' : ''}`}>
      <button
        type="button"
        aria-label={`Reorder ${label}`}
        {...attributes}
        {...listeners}
        className="shrink-0 cursor-grab touch-none rounded px-0.5 text-[10px] leading-none text-slate-400 hover:bg-slate-200 hover:text-slate-700 active:cursor-grabbing dark:hover:bg-white/10 dark:hover:text-slate-200"
      >
        ⠿
      </button>
      <TicketBadge entry={placement.entry} role={placement.role} />
    </span>
  )
}

function PersonRow({
  name,
  placements,
  variant = 'normal',
  onOpenPopup,
  onReorder,
}: {
  name: string
  placements: PlacedEntry[]
  variant?: 'normal' | 'unmapped' | 'needsAssignment'
  onOpenPopup?: (ticketId: string) => void
  // Save-on-drop reorder within this row only (ticket 19) - undefined for
  // the Unmapped/Needs dev/qa catch-all rows, which stay undraggable (see
  // TicketBadge's comment above).
  onReorder?: (patches: SprintPlanEntryOrderPatch[]) => void
}) {
  const unmapped = variant === 'unmapped'
  const needsAssignment = variant === 'needsAssignment'
  const flagged = unmapped || needsAssignment

  const nameClass = unmapped
    ? 'text-amber-700 dark:text-amber-300'
    : needsAssignment
      ? 'text-sky-700 dark:text-sky-300'
      : 'text-slate-800 dark:text-slate-100'
  const emptyClass = unmapped
    ? 'text-amber-600/70 dark:text-amber-300/60'
    : needsAssignment
      ? 'text-sky-600/70 dark:text-sky-300/60'
      : 'text-slate-400'

  // Only a real per-person row is sortable: dragging within Unmapped mixes
  // placements from unrelated real Jira assignees whose `order` values
  // aren't a meaningful group together (SprintPlanEntry.ts's "meaningful
  // only relative to other entries sharing this ticket's current
  // assignee"), and Needs dev/qa's badges are already the popup's own click
  // target. `sortable` gates DndContext/SortableContext below, not the
  // hooks (dnd-kit's own hooks aren't used unconditionally here - only
  // useSensors, safe to call every render regardless).
  const sortable = variant === 'normal' && !!onReorder
  const dragSensors = useSensors(useSensor(PointerSensor), useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }))

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event
    if (!over || active.id === over.id) return
    const oldIndex = placements.findIndex((p) => placementKey(p) === active.id)
    const newIndex = placements.findIndex((p) => placementKey(p) === over.id)
    if (oldIndex === -1 || newIndex === -1) return
    onReorder?.(computeReorderPatches(placements, oldIndex, newIndex))
  }

  return (
    <div
      aria-label={`Tickets for ${name}`}
      className="grid grid-cols-[10rem_1fr] items-start gap-3 border-b border-slate-100 py-2.5 last:border-0 dark:border-white/5"
    >
      <span className={`pt-0.5 text-sm font-medium ${nameClass}`}>{flagged ? `${unmapped ? '⚠' : '❓'} ${name}` : name}</span>
      {placements.length === 0 ? (
        <span className={`pt-0.5 text-xs ${emptyClass}`}>No tickets planned</span>
      ) : sortable ? (
        <DndContext sensors={dragSensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
          <SortableContext items={placements.map(placementKey)} strategy={rectSortingStrategy}>
            <div className="flex flex-wrap gap-1.5">
              {placements.map((p) => (
                <SortableTicketBadge key={placementKey(p)} placement={p} />
              ))}
            </div>
          </SortableContext>
        </DndContext>
      ) : (
        <div className="flex flex-wrap gap-1.5">
          {placements.map(({ entry, role }) => (
            <TicketBadge
              key={placementKey({ entry, role })}
              entry={entry}
              role={role}
              unmapped={unmapped}
              needsAssignment={needsAssignment}
              onFlagClick={needsAssignment ? () => onOpenPopup?.(getId(entry.ticketId) ?? '') : undefined}
            />
          ))}
        </div>
      )}
    </div>
  )
}

// Ticket 18's core Planning surface: sprint selector, capacity strip, the
// "Add to plan" entry bar, and the "Tickets by person" table, plus ticket
// 19's per-row drag-reorder and global "Sync plan" resync. Mounted by
// SprintShell at /sprint/:teamSlug/planning once a team is resolved.
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
    savingDevQaOverride,
    devQaOverrideError,
    saveDevQaOverride,
    reorderEntries,
    syncingPlan,
    syncPlanError,
    syncPlan,
  } = useSprintPlan(teamId)
  const { epics, loadingEpics, epicsError } = useEpics(selectedSprintId)

  const [entryValue, setEntryValue] = useState('')
  // Ticket id of a just-added Split ticket, watched for below until it
  // reappears in `entries` (devQa-decorated, since only GET inlines devQa -
  // see routes/sprintPlanEntries.ts) so we can decide whether to auto-open
  // the popup. `popupTicketId` is the actually-open popup's ticket id -
  // separate state, since the popup can also be opened directly by clicking
  // a flagged badge with no add-to-plan involved.
  const [pendingAutoOpenTicketId, setPendingAutoOpenTicketId] = useState<string | null>(null)
  const [popupTicketId, setPopupTicketId] = useState<string | null>(null)

  async function handleAdd(e: FormEvent) {
    e.preventDefault()
    try {
      const created = await addTicket(entryValue)
      setEntryValue('')
      if (created) setPendingAutoOpenTicketId(getId(created.ticketId) ?? null)
    } catch {
      // addTicketError already surfaces the failure - keep the typed value
      // so the user can correct/retry without retyping it.
    }
  }

  // Auto-open trigger (ticket 24): once the just-added ticket reappears in
  // `entries` post-refresh (devQa-decorated), open the popup only if either
  // role is needs-assignment - not for a fully-resolved role, not for an
  // unmapped-but-fine role (per the ticket's grilled decision: unmapped
  // does NOT auto-interrupt, only needs-assignment does), and never at all
  // for a non-split ticket (`devQa` absent). Runs once per add - the
  // pending id is cleared as soon as a match is found either way, so it
  // never re-triggers on a later unrelated refresh.
  useEffect(() => {
    if (!pendingAutoOpenTicketId) return
    const match = entries.find((e) => getId(e.ticketId) === pendingAutoOpenTicketId)
    if (!match) return

    setPendingAutoOpenTicketId(null)
    if (match.devQa && (match.devQa.dev.status === 'needs-assignment' || match.devQa.qa.status === 'needs-assignment')) {
      setPopupTicketId(pendingAutoOpenTicketId)
    }
  }, [entries, pendingAutoOpenTicketId])

  const popupEntry = useMemo(
    () => (popupTicketId ? (entries.find((e) => getId(e.ticketId) === popupTicketId) ?? null) : null),
    [entries, popupTicketId],
  )

  // One bucket of PlacedEntry per current TeamMembership, keyed by that
  // membership's Person.jiraAccountId for a non-split entry's single
  // placement (ADR 0001) or by resolved Person._id for a Split entry's per-
  // role placement (ticket 23's devQa) - plus two catch-all buckets:
  // "unmapped" (a real, off-roster Jira assignee - CONTEXT.md "Unmapped
  // assignee") and "needs dev/qa" (no resolvable assignee at all yet,
  // Split-ticket roles only). A Split entry (ticket.devQa present) can land
  // up to two placements across any combination of these buckets,
  // independently per role; a non-split entry always has exactly one.
  // Recomputed whenever either input changes, not per-render.
  const { ticketsByMembershipId, unmappedPlacements, needsAssignmentPlacements } = useMemo(() => {
    const byMembership = new Map<string, PlacedEntry[]>()
    for (const membership of memberships) {
      byMembership.set(getId(membership) ?? '', [])
    }
    const membershipIdByAccountId = new Map(memberships.map((m) => [m.personId.jiraAccountId, getId(m) ?? '']))
    const membershipIdByPersonId = new Map(memberships.map((m) => [getId(m.personId) ?? '', getId(m) ?? '']))

    const unmapped: PlacedEntry[] = []
    const needsAssignment: PlacedEntry[] = []

    function placeResolved(membershipId: string | undefined, placed: PlacedEntry) {
      // A resolved role whose personId no longer matches any current
      // TeamMembership (e.g. an Override picked someone since removed from
      // the team) has nowhere mapped to go - falls back to Unmapped rather
      // than silently vanishing from the table.
      if (membershipId && byMembership.has(membershipId)) byMembership.get(membershipId)!.push(placed)
      else unmapped.push(placed)
    }

    for (const entry of entries) {
      if (entry.devQa) {
        for (const role of ['dev', 'qa'] as const) {
          const resolution = entry.devQa[role]
          const placed: PlacedEntry = { entry, role }
          if (resolution.status === 'resolved') {
            placeResolved(membershipIdByPersonId.get(resolution.personId), placed)
          } else if (resolution.status === 'unmapped') {
            unmapped.push(placed)
          } else {
            needsAssignment.push(placed)
          }
        }
      } else {
        const accountId = entry.ticketId.assigneeAccountId
        const membershipId = accountId ? membershipIdByAccountId.get(accountId) : undefined
        const placed: PlacedEntry = { entry }
        if (membershipId) byMembership.get(membershipId)!.push(placed)
        else unmapped.push(placed)
      }
    }

    // A non-split placement sorts by the entry's plain `order`; a Split
    // role placement sorts by that role's own devOrder/qaOrder (ticket 23) -
    // meaningless to compare across different roles/tickets, only used to
    // keep each row's own placements stable.
    function placementOrder(p: PlacedEntry): number {
      if (p.role === 'dev') return p.entry.devOrder ?? 0
      if (p.role === 'qa') return p.entry.qaOrder ?? 0
      return p.entry.order
    }
    for (const placements of byMembership.values()) placements.sort((a, b) => placementOrder(a) - placementOrder(b))
    unmapped.sort((a, b) => placementOrder(a) - placementOrder(b))
    needsAssignment.sort((a, b) => placementOrder(a) - placementOrder(b))

    return { ticketsByMembershipId: byMembership, unmappedPlacements: unmapped, needsAssignmentPlacements: needsAssignment }
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
          <EpicPillStrip epics={epics} loading={loadingEpics} error={epicsError} />

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
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">Tickets by person</h2>
              <SyncPlanButton syncing={syncingPlan} error={syncPlanError} onSync={() => syncPlan().catch(() => {})} />
            </div>
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
                    placements={ticketsByMembershipId.get(getId(membership) ?? '') ?? []}
                    onOpenPopup={setPopupTicketId}
                    onReorder={reorderEntries}
                  />
                ))}
                <PersonRow name="Unmapped" placements={unmappedPlacements} variant="unmapped" onOpenPopup={setPopupTicketId} />
                <PersonRow
                  name="Needs dev/qa"
                  placements={needsAssignmentPlacements}
                  variant="needsAssignment"
                  onOpenPopup={setPopupTicketId}
                />
              </div>
            )}
          </div>
        </>
      )}

      {popupEntry && popupEntry.devQa && (
        <DevQaAssignmentPopup
          entry={popupEntry as SprintPlanEntry & { devQa: NonNullable<SprintPlanEntry['devQa']> }}
          memberships={memberships}
          saving={savingDevQaOverride}
          error={devQaOverrideError}
          onSave={(body) => saveDevQaOverride(getId(popupEntry.ticketId) ?? '', body)}
          onClose={() => setPopupTicketId(null)}
        />
      )}
    </div>
  )
}
