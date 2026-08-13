import { DndContext, KeyboardSensor, PointerSensor, closestCenter, useSensor, useSensors } from '@dnd-kit/core'
import type { DragEndEvent } from '@dnd-kit/core'
import { SortableContext, arrayMove, rectSortingStrategy, sortableKeyboardCoordinates, useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { StickyNote } from 'lucide-react'
import { useEffect, useMemo, useState, type FormEvent, type MouseEvent } from 'react'
import { useEpics } from '../hooks/useEpics'
import { useSprintPlan, type SprintPeriod, type SprintPeriodInput, type SprintPlanEntryOrderPatch } from '../hooks/useSprintPlan'
import { AddPlaceholderPopup, type AddPlaceholderBody } from './AddPlaceholderPopup'
import { AddSprintPopover } from './AddSprintPopover'
import { DevQaAssignmentPopup } from './DevQaAssignmentPopup'
import { EpicPillStrip } from './EpicPillStrip'
import { GanttChartButton } from './SprintGanttChart'
import { SprintBreakdownCard } from './SprintBreakdownCard'
import { SprintLeaveGrid, type SprintLeaveGridColumn } from './SprintLeaveGrid'
import { SprintSelect } from './SprintSelect'
import { TicketInfoPopup } from './TicketInfoPopup'
import { parseLocalDate } from '../utils/dateAgenda'
import { formatDaysHours } from '../utils/formatDuration'
import { getId } from '../utils/getId'
import { computeSprintBreakdown } from '../utils/sprintBreakdown'
import { computeWorkingDates } from '../utils/sprintWorkingDates'
import {
  groupPlacementsByMembership,
  placementField,
  placementFieldValue,
  placementKey,
  rolePlannedHours,
  type PlacedEntry,
} from '../utils/ticketPlacements'
import { ticketTypeAccent } from '../utils/ticketType'
import type { LeaveEntry, PlaceholderTicket, Sprint, SprintCapacity, SprintPlanEntry, Team } from '../types'

// The same role placement's Original (Effort) - devEstimateHours/
// qaEstimateHours, or entry.estimateHours for a non-split placement. Used
// only to decide the badge's amber/emerald Plan/Spill ring (never displayed
// directly on the badge itself, which shows Planned via rolePlannedHours
// above).
function roleOriginalHours(entry: SprintPlanEntry, role: 'dev' | 'qa' | undefined): number | null {
  if (role === 'dev') return entry.devEstimateHours ?? null
  if (role === 'qa') return entry.qaEstimateHours ?? null
  return entry.estimateHours ?? null
}

// Ticket 19's drag-reorder save-on-drop: reorders `placements` per the drag
// result, then assigns each placement its new value using its position in
// that single reordered row - not a per-field-local rank. This used to
// re-number each of order/devOrder/qaOrder from 0 within its own group,
// which can't represent an arbitrary interleaving of the three: three
// independently-zeroed counters lose which-group-came-first information the
// moment two placements from different groups tie (e.g. a fresh devOrder=0
// and a fresh qaOrder=0 are indistinguishable to `ticketsByMembershipId`'s
// merge sort below, which compares the raw values across fields). That's
// why a row mixing dev- and qa-role placements (any Split ticket, ticket 23)
// could only ever have same-field neighbors swap - crossing a
// differently-fielded neighbor either produced no patch at all (its
// within-group rank hadn't changed) or a patch that the merge sort couldn't
// actually place where it was dropped. Using the row-wide index instead
// keeps every field's values globally comparable, so the merge sort
// reproduces the drop exactly; nextOrderForAssignee/nextOrderForRole
// (server-side) only ever need a field's current max, so gaps in a field's
// values (devOrder jumping 0 -> 3 because its neighbors are in other
// fields) don't affect them. Still only patches placements whose value
// actually changed, so a drop that doesn't move a placement relative to its
// row-wide position doesn't PATCH it.
function computeReorderPatches(placements: PlacedEntry[], oldIndex: number, newIndex: number): SprintPlanEntryOrderPatch[] {
  const reordered = arrayMove(placements, oldIndex, newIndex)
  const patches: SprintPlanEntryOrderPatch[] = []
  reordered.forEach((p, index) => {
    if (placementFieldValue(p) !== index) {
      patches.push({ entryId: getId(p.entry) ?? '', field: placementField(p), value: index })
    }
  })
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

// Ticket badge's background color-codes by Jira issue type (ticketTypeAccent
// - shared with StatusView's ticket-card coloring so a ticket's color means
// the same thing on both surfaces).
function typeColorClasses(type: string | null): string {
  const accent = ticketTypeAccent(type)
  if (accent === 'bug') {
    return 'border-red-300 bg-red-100 text-red-700 dark:border-red-500/30 dark:bg-red-500/20 dark:text-red-300'
  }
  if (accent === 'story') {
    return 'border-green-300 bg-green-100 text-green-700 dark:border-green-500/30 dark:bg-green-500/20 dark:text-green-300'
  }
  if (accent === 'task') {
    return 'border-blue-300 bg-blue-100 text-blue-700 dark:border-blue-500/30 dark:bg-blue-500/20 dark:text-blue-300'
  }
  return 'border-slate-200 bg-slate-100 text-slate-600 dark:border-white/10 dark:bg-white/10 dark:text-slate-300'
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

// Formats a Date's LOCAL fields into "YYYY-MM-DD" - never
// Date#toISOString(), which converts through UTC and silently shifts the
// calendar day in a UTC+ environment (the bug this spec's timezone decision
// is built around; see also dateAgenda.ts's localTodayISO()).
function toLocalDateString(date: Date): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

interface RangeDay {
  date: string
  isWeekend: boolean
}

// Enumerates every calendar day in [start, end] inclusive, one entry per
// day, tagged with whether it's a Sat/Sun. Blank or inverted input (end <
// start) yields [] - the same "invalid range" condition the form uses to
// block Save and hide the working-day badge (spec story 14).
function enumerateRangeDays(start: string, end: string): RangeDay[] {
  if (!start || !end || end < start) return []
  const days: RangeDay[] = []
  const cursor = parseLocalDate(start)
  const last = parseLocalDate(end)
  while (cursor.getTime() <= last.getTime()) {
    const dayOfWeek = cursor.getDay() // 0 = Sunday, 6 = Saturday
    days.push({ date: toLocalDateString(cursor), isWeekend: dayOfWeek === 0 || dayOfWeek === 6 })
    cursor.setDate(cursor.getDate() + 1)
  }
  return days
}

function formatChipLabel(dateStr: string): string {
  return parseLocalDate(dateStr).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })
}

// Sprint.startDate/endDate are a raw Jira-synced `Date` (full ISO instant,
// e.g. "2026-08-10T05:26:47.318Z" - see backend models/Sprint.ts), not the
// 'YYYY-MM-DD' calendar-day string this form's inputs need. Converts via
// local Date fields (never a slice(0, 10) of the ISO string, which would
// read the UTC calendar day - the exact class of bug this feature's
// timezone decision exists to avoid) so the default seed lands on the same
// local day a person would read off the Sprint elsewhere in the app.
function sprintDateSeed(value: string | null | undefined): string {
  if (!value) return ''
  return toLocalDateString(new Date(value))
}

// The Variant B period picker (see .scratch/sprint-period-picker/spec.md):
// two native date inputs plus a flat wrap-list of day chips, one per
// calendar day in the picked range - weekend chips are static/dimmed,
// weekday chips toggle a struck-through "holiday" state on click. Replaces
// the old WorkingDaysForm and its !planConfigured gating entirely - this
// form is both the "set" and "edit" UI, pre-filled from the saved
// `period` if one exists, else the selected Sprint's own Jira dates, else
// blank. Since this feature's follow-up (collapsed-by-default toggle,
// PlanningView below), it's no longer *always* mounted - only while the
// edit panel is open - but it's still gated behind a `loadingSprintPeriod ?
// <p>…</p> : <SprintPeriodForm key={selectedSprintId} …>` conditional
// underneath that: since that ternary swaps between two different element
// types on every loading-state flip, a fresh instance mounts exactly once
// the sprint's own plan fetch has settled, which is what lets this
// component's local state be the single source of truth from then on - it
// deliberately never re-syncs from `period` after mount, so a failed save
// leaves in-progress selections exactly as the user left them (spec story
// 16).
//
// Also hosts SprintLeaveGrid (moved in from PlanningView's always-visible
// area to cut clutter - .scratch/sprint-leave-picker follow-up): since this
// form already owns the live startDate/endDate/holidays draft, the grid's
// columns are derived straight from that draft state, so toggling a holiday
// chip or nudging a date input reflows the grid immediately, before Save is
// even clicked. Only columns that match the *saved* `period` are click-
// writable though (`writableDates` below) - PATCH .../capacity-entries
// rejects a leave date outside the sprint's currently-saved working-day
// calendar (services/leaveEntries.ts's validateAgainstWorkingDates), and the
// POST path, while permissive at write time, has any such date silently
// filtered back out by the next GET's reconciliation - so an unsaved draft
// column would either hard-error or silently no-op if left clickable.
function SprintPeriodForm({
  period,
  sprint,
  saving,
  onSave,
  capacity,
  savingCapacityEntry,
  capacityEntryError,
  onSetLeaveEntries,
  onSetExtraHours,
}: {
  period: SprintPeriod | null
  sprint: Sprint | null
  saving: boolean
  onSave: (period: SprintPeriodInput) => Promise<void>
  capacity: SprintCapacity[]
  savingCapacityEntry: boolean
  capacityEntryError: string | null
  onSetLeaveEntries: (teamMembershipId: string, entries: LeaveEntry[]) => Promise<void>
  onSetExtraHours: (teamMembershipId: string, hours: number) => Promise<void>
}) {
  const [startDate, setStartDate] = useState(period?.startDate ?? sprintDateSeed(sprint?.startDate))
  const [endDate, setEndDate] = useState(period?.endDate ?? sprintDateSeed(sprint?.endDate))
  const [holidays, setHolidays] = useState<Set<string>>(() => new Set(period?.holidays ?? []))
  const [error, setError] = useState<string | null>(null)

  const days = useMemo(() => enumerateRangeDays(startDate, endDate), [startDate, endDate])
  const rangeValid = days.length > 0
  const totalWeekdays = days.filter((d) => !d.isWeekend).length
  // Shared with SprintLeaveGrid's column derivation (utils/
  // sprintWorkingDates.ts) - previously an inline weekend/holiday filter
  // over `days` duplicated that logic (spec ".scratch/sprint-leave-picker/
  // spec.md"). This is the live draft the grid's columns render from.
  const workingDates = useMemo(() => computeWorkingDates(startDate, endDate, [...holidays]), [startDate, endDate, holidays])
  const workingDaysCount = workingDates.length
  // The last-saved period's own working dates - the subset of `workingDates`
  // (the draft) that a leave-grid cell click can actually persist. `period`
  // deliberately isn't re-read after mount anywhere else in this component
  // (see comment above), but this one derivation is meant to track it live:
  // it's what tells the grid a Save just landed and a given draft column is
  // now writable.
  const savedWorkingDates = useMemo(
    () => new Set(period ? computeWorkingDates(period.startDate, period.endDate, period.holidays) : []),
    [period],
  )
  const leaveGridColumns: SprintLeaveGridColumn[] = useMemo(
    () => workingDates.map((date) => ({ date, writable: savedWorkingDates.has(date) })),
    [workingDates, savedWorkingDates],
  )

  // Holiday selection intersected with range changes (spec): narrowing the
  // range silently drops any checked holiday that now falls outside it,
  // rather than erroring or leaving a "phantom" holiday the chip list no
  // longer shows.
  function handleRangeChange(nextStart: string, nextEnd: string) {
    setStartDate(nextStart)
    setEndDate(nextEnd)
    const nextDates = new Set(enumerateRangeDays(nextStart, nextEnd).map((d) => d.date))
    setHolidays((prev) => new Set([...prev].filter((d) => nextDates.has(d))))
  }

  function toggleHoliday(date: string) {
    setHolidays((prev) => {
      const next = new Set(prev)
      if (next.has(date)) next.delete(date)
      else next.add(date)
      return next
    })
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (!rangeValid) {
      setError('Pick a valid start and end date')
      return
    }
    setError(null)
    try {
      await onSave({ startDate, endDate, holidays: [...holidays] })
    } catch (err) {
      setError((err as Error).message)
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <form
        onSubmit={handleSubmit}
        aria-label="Sprint period"
        className="flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-white/10 dark:bg-white/5 dark:shadow-none dark:backdrop-blur-md"
      >
        <div className="flex flex-wrap items-center gap-3">
          <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-600 dark:bg-white/10 dark:text-slate-300">
            {rangeValid ? `${workingDaysCount}/${totalWeekdays} working days` : 'Pick a valid date range'}
          </span>
          <div className="flex items-center gap-1.5">
            <label htmlFor="sprint-period-start" className="text-xs font-medium text-slate-500 dark:text-slate-300">
              Start date
            </label>
            <input
              id="sprint-period-start"
              type="date"
              value={startDate}
              onChange={(e) => handleRangeChange(e.target.value, endDate)}
              className="rounded-lg border border-slate-200 bg-slate-50 px-2 py-1 text-sm text-slate-900 focus:border-fuchsia-400/60 focus:outline-none dark:border-white/10 dark:bg-white/5 dark:text-slate-100"
            />
          </div>
          <div className="flex items-center gap-1.5">
            <label htmlFor="sprint-period-end" className="text-xs font-medium text-slate-500 dark:text-slate-300">
              End date
            </label>
            <input
              id="sprint-period-end"
              type="date"
              value={endDate}
              onChange={(e) => handleRangeChange(startDate, e.target.value)}
              className="rounded-lg border border-slate-200 bg-slate-50 px-2 py-1 text-sm text-slate-900 focus:border-fuchsia-400/60 focus:outline-none dark:border-white/10 dark:bg-white/5 dark:text-slate-100"
            />
          </div>
          <button
            type="submit"
            disabled={saving || !rangeValid}
            className="rounded-lg bg-gradient-to-r from-violet-500 to-fuchsia-500 px-3 py-1.5 text-sm font-semibold text-white hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {saving ? 'Saving…' : 'Save period'}
          </button>
          {error && <span className="text-xs text-red-600 dark:text-red-400">{error}</span>}
        </div>
        {days.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {days.map((d) => {
              if (d.isWeekend) {
                return (
                  <span
                    key={d.date}
                    className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-medium text-slate-300 dark:border-white/10 dark:bg-white/5 dark:text-slate-600"
                  >
                    {formatChipLabel(d.date)}
                  </span>
                )
              }
              const isHoliday = holidays.has(d.date)
              return (
                <button
                  key={d.date}
                  type="button"
                  onClick={() => toggleHoliday(d.date)}
                  aria-pressed={isHoliday}
                  aria-label={`Toggle holiday for ${d.date}`}
                  className={
                    isHoliday
                      ? 'rounded-full border border-red-300 bg-red-100 px-2.5 py-1 text-xs font-medium text-red-700 line-through dark:border-red-500/30 dark:bg-red-500/20 dark:text-red-300'
                      : 'rounded-full border border-slate-200 bg-white px-2.5 py-1 text-xs font-medium text-slate-600 hover:bg-slate-100 dark:border-white/10 dark:bg-white/5 dark:text-slate-300 dark:hover:bg-white/10'
                  }
                >
                  {formatChipLabel(d.date)}
                </button>
              )
            })}
          </div>
        )}
      </form>
      <SprintLeaveGrid
        capacity={capacity}
        columns={leaveGridColumns}
        saving={savingCapacityEntry}
        error={capacityEntryError}
        onSetLeaveEntries={onSetLeaveEntries}
        onSetExtraHours={onSetExtraHours}
      />
    </div>
  )
}

// Icon-only open/close toggle for SprintPeriodForm, in the sprint-selector
// row right after SprintSelect (follow-up to the sprint-period-picker spec:
// the always-visible form took up too much vertical space, so it's now
// collapsed by default and revealed on demand). A single affordance does
// double duty as both open and close trigger, per the "only one close
// affordance" decision - no second "x" inside the form's own header.
// Styling is docs/ui-conventions.md's "Icon-only button hover" convention
// verbatim (no border - that convention is unbordered everywhere it's used,
// e.g. TodoDetail's "x" close, MiniCalendar's prev/next-month buttons,
// NotesView's row-menu icons), not a new hybrid. The "Set period"/"Edit
// period" copy split was already validated in the rejected `/prototype`
// Variant C badge for this same feature (see
// .scratch/sprint-period-picker/spec.md's Further Notes) - reused here for
// continuity even though Variant C's own modal shape wasn't the one chosen.
function SprintPeriodToggle({ open, planConfigured, onToggle }: { open: boolean; planConfigured: boolean; onToggle: () => void }) {
  const label = open ? 'Close period' : planConfigured ? 'Edit period' : 'Set period'
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-label={label}
      className="shrink-0 rounded-lg px-2 py-1.5 text-sm text-slate-400 hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-white/10 dark:hover:text-slate-200"
    >
      {open ? '×' : <span className="inline-block scale-x-[-1]">✎</span>}
    </button>
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
  onOpenPlaceholder,
}: {
  value: string
  onChange: (v: string) => void
  onSubmit: (e: FormEvent) => void
  loading: boolean
  error: string | null
  // Opens AddPlaceholderPopup (spec ".scratch/placeholder-tickets/spec.md") -
  // a second icon-only affordance right after the "Add" button, for a
  // non-Jira, manually-created stand-in ticket instead of a real Jira lookup.
  onOpenPlaceholder: () => void
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
      <button
        type="button"
        onClick={onOpenPlaceholder}
        aria-label="Add placeholder ticket"
        title="Add placeholder ticket"
        className="rounded-lg px-2 py-1.5 text-sm text-slate-400 hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-white/10 dark:hover:text-slate-200"
      >
        <StickyNote className="h-4 w-4" />
      </button>
      {error && <span className="text-xs text-red-600 dark:text-red-400">{error}</span>}
    </form>
  )
}

// A ticket-number pill, wrapped by SortableTicketBadge (below) for drag-
// reorder within a real per-person row (ticket 19) - the Unmapped/Needs
// dev/qa catch-all rows render it bare, undraggable, since their placements
// don't share a single meaningful order group (see PersonRow). Every badge
// is a click target that opens a detail popup for that ticket: a Split
// (Story/Bug) ticket opens DevQaAssignmentPopup (needs-assignment or
// already-resolved alike), a non-split ticket opens the read-only
// TicketInfoPopup instead (see PlanningView's popupEntry rendering). The
// full title/status/staleness lives in the title tooltip rather than on the
// face of the badge, per the ticket's "enough to identify the ticket". A Split ticket's
// two resolved placements (ticket 24) land in separate rows already keyed
// to their resolved dev/qa person, so no DEV/QA sub-label is needed there -
// the Unmapped catch-all row is the one place it comes back, by explicit
// request, since it mixes placements from unrelated off-roster Jira
// assignees together rather than keying them by role. Needs dev/qa is
// structurally the same kind of mixed catch-all but was deliberately left
// without the sub-label - narrowly scoped to Unmapped, not "any catch-all
// row". `role` also always picks which estimate to show, since a dev
// placement and a qa placement of the same Story/Bug have their own
// independent [Dev]/[Test] Sub-task estimate, never the parent's.
function TicketBadge({
  entry,
  role,
  unmapped,
  needsAssignment,
  onFlagClick,
  onRemove,
  removing,
  isPopped,
  onPopClick,
}: {
  entry: SprintPlanEntry
  role?: 'dev' | 'qa'
  unmapped?: boolean
  needsAssignment?: boolean
  // Every caller (SortableTicketBadge, PersonRow's bare-badge branch) passes
  // this unconditionally now - a plain click always opens a detail/assign
  // popup (see badgeEl below), never optional.
  onFlagClick: () => void
  // Undoes an accidental add-to-plan (spec). A Split ticket's dev and qa
  // placements share one SprintPlanEntry (PlacedEntry's `role`), so removing
  // from either placement clears both - there's nothing to remove per-role.
  onRemove?: () => void
  removing?: boolean
  // Option/Alt+click "pop" (find-the-pair): highlighted/enlarged when this
  // placement's entry is the one currently popped in PlanningView state.
  // Keyed by entry id (not placementKey), so a Split ticket's dev and qa
  // placements - which share one SprintPlanEntry but land in two different
  // people's rows - pop together, which is the whole point (quickly spot
  // both sub-task owners without scanning every row).
  isPopped?: boolean
  onPopClick?: () => void
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
      : typeColorClasses(ticket.type)
  const plannedHoursValue = rolePlannedHours(entry, role)
  const originalHoursValue = roleOriginalHours(entry, role)
  // Plan/Spill (spec ".scratch/sprint-plan-spill-estimate/spec.md", Variant
  // B): amber when Planned is spilled/reduced below Original, emerald when
  // buffered above it, no ring when they match or either figure is missing.
  const planSpillRingClass =
    plannedHoursValue == null || originalHoursValue == null || plannedHoursValue === originalHoursValue
      ? ''
      : plannedHoursValue < originalHoursValue
        ? 'ring-2 ring-amber-400/70 dark:ring-amber-400/60'
        : 'ring-2 ring-emerald-400/70 dark:ring-emerald-400/60'
  // Option/Alt+click "pop": a bit larger + ring-highlighted, with a short
  // transform transition so it visibly pops rather than snapping. `shadow-sm`
  // and `shadow-lg` never appear in the same className string (Tailwind
  // utilities of equal specificity don't reliably cascade by DOM order), so
  // the popped/unpopped shadow lives in this one branch, not layered on top
  // of a base shadow class. The Plan/Spill ring above follows the same rule
  // - kept to this one branch (only when not popped) rather than layered
  // unconditionally alongside the popped ring, since two `ring-2 ring-*`
  // utilities of different colors in one className string hit the identical
  // cascade-order gotcha.
  const popClasses = isPopped
    ? 'relative z-20 scale-125 shadow-lg ring-2 ring-fuchsia-400/60'
    : `scale-100 shadow-sm ${planSpillRingClass}`
  const baseClasses = `inline-flex items-center gap-1 rounded-full border px-2 py-0.5 font-mono text-[11px] font-semibold transition-transform duration-150 ease-out ${popClasses} ${colorClasses}`

  const content = (
    <>
      {ticket.jiraKey.replace(/^WOSMVP-/, '')}
      {unmapped && role && (
        <span className="font-sans text-[9px] font-normal uppercase tracking-wide opacity-70">{role}</span>
      )}
      {plannedHoursValue != null && (
        <span className="font-sans text-[9px] font-normal tracking-wide opacity-70">{formatDaysHours(plannedHoursValue)}</span>
      )}
    </>
  )

  // A custom hover tooltip, not the native `title` attribute - browsers gate
  // `title` behind their own ~1s hover delay before it appears at all, which
  // read as sluggish for a badge meant to be skimmed quickly. `group`/
  // `group-hover` fades this in near-instantly instead, sibling to (not
  // nested in) the badge's own font-mono/uppercase styling so it doesn't
  // inherit either. `group-focus-within` (docs/ui-conventions.md's
  // "Hover-reveal affordances", NotesView.tsx's RowMenu) keeps it reachable
  // for a keyboard user tabbing to the needsAssignment button - the native
  // `title` it replaced showed on focus too.
  // Option/Alt+click (e.altKey - Option on Mac, Alt on Windows) toggles pop
  // instead of the badge's normal click behavior (opening its detail/assign
  // popup) - checked first so the two never fire together on the same click.
  function handleClick(e: MouseEvent) {
    if (e.altKey) {
      e.preventDefault()
      onPopClick?.()
      return
    }
    onFlagClick?.()
  }

  // Every badge opens a popup on a plain click now (spec: "when a ticket
  // click I want popup") - needsAssignment keeps its own distinct
  // aria-label/copy (existing tests assert on it), any other badge gets a
  // generic one since it's opening the same popup just to view/reassign an
  // already-resolved (or non-split) ticket rather than to clear a flag.
  const badgeEl = (
    <button
      type="button"
      onClick={handleClick}
      aria-label={needsAssignment ? `Assign dev/qa for ${ticket.jiraKey}` : `Open ${ticket.jiraKey}`}
      className={`${baseClasses} cursor-pointer hover:opacity-80`}
    >
      {content}
    </button>
  )

  return (
    <span className="group relative inline-flex items-center gap-0.5">
      {badgeEl}
      {onRemove && (
        <button
          type="button"
          onClick={onRemove}
          disabled={removing}
          aria-label={`Remove ${ticket.jiraKey} from plan`}
          className="font-sans text-xs leading-none text-slate-400 hover:text-slate-700 disabled:cursor-not-allowed disabled:opacity-50 dark:hover:text-slate-100"
        >
          ×
        </button>
      )}
      <span className="pointer-events-none absolute left-1/2 top-full z-10 mt-1 -translate-x-1/2 whitespace-nowrap rounded-lg border border-slate-200 bg-white px-2 py-1 font-sans text-[11px] font-normal normal-case text-slate-700 opacity-0 shadow-lg transition-opacity duration-100 group-hover:opacity-100 group-focus-within:opacity-100 dark:border-white/10 dark:bg-[#1a1229] dark:text-slate-200">
        {tooltip}
      </span>
    </span>
  )
}

// Makes one badge draggable/sortable via dnd-kit, mirroring TodoDetail's
// SortableLinkedTodoRow / BoardsView's SortableBoardCard: a small separate
// drag-handle button (not the badge itself) owns useSortable's
// listeners/attributes, keeping the badge's own onClick (opens the
// detail/assign popup) conflict-free by construction.
function SortableTicketBadge({
  placement,
  onFlagClick,
  onRemove,
  removing,
  isPopped,
  onPopClick,
}: {
  placement: PlacedEntry
  onFlagClick: () => void
  onRemove?: () => void
  removing?: boolean
  isPopped?: boolean
  onPopClick?: () => void
}) {
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
      <TicketBadge
        entry={placement.entry}
        role={placement.role}
        onFlagClick={onFlagClick}
        onRemove={onRemove}
        removing={removing}
        isPopped={isPopped}
        onPopClick={onPopClick}
      />
    </span>
  )
}

// A Placeholder ticket's badge - a non-Jira, manually-created stand-in: just
// a short text description, one assignee (implicit, since it's rendered
// inside that person's own row) and an estimate. Deliberately not sortable/
// draggable and has no detail popup - no Jira link, no Dev/QA or Plan/Spill
// concept applies to it, so the pill itself already shows everything there
// is to know; only Remove is offered, mirroring TicketBadge's own Remove
// affordance. Violet is a fresh accent, not reused by any other badge
// meaning (docs/ui-conventions.md's semantic colors reserve red/green/blue/
// slate for issue type, amber for Unmapped, sky for needs-assignment) -
// signals "local to Planning, never synced from Jira" at a glance.
function PlaceholderBadge({
  placeholder,
  onRemove,
  removing,
}: {
  placeholder: PlaceholderTicket
  onRemove: () => void
  removing?: boolean
}) {
  return (
    <span className="group relative inline-flex items-center gap-1 rounded-full border border-violet-300 bg-violet-100 px-2 py-0.5 text-[11px] font-semibold text-violet-700 shadow-sm dark:border-violet-500/30 dark:bg-violet-500/20 dark:text-violet-300">
      <span className="max-w-[8rem] truncate font-sans font-medium normal-case">{placeholder.text}</span>
      <span className="font-sans text-[9px] font-normal tracking-wide opacity-70">{formatDaysHours(placeholder.estimateHours)}</span>
      <button
        type="button"
        onClick={onRemove}
        disabled={removing}
        aria-label={`Remove placeholder ${placeholder.text}`}
        className="font-sans text-xs leading-none text-violet-500 hover:text-violet-800 disabled:cursor-not-allowed disabled:opacity-50 dark:text-violet-300 dark:hover:text-violet-100"
      >
        ×
      </button>
      <span className="pointer-events-none absolute left-1/2 top-full z-10 mt-1 -translate-x-1/2 whitespace-nowrap rounded-lg border border-slate-200 bg-white px-2 py-1 font-sans text-[11px] font-normal normal-case text-slate-700 opacity-0 shadow-lg transition-opacity duration-100 group-hover:opacity-100 group-focus-within:opacity-100 dark:border-white/10 dark:bg-[#1a1229] dark:text-slate-200">
        {placeholder.text} — {formatDaysHours(placeholder.estimateHours)} placeholder
      </span>
    </span>
  )
}

function PersonRow({
  name,
  placements,
  placeholders,
  variant = 'normal',
  onOpenPopup,
  onReorder,
  onRemove,
  removingEntryId,
  onRemovePlaceholder,
  removingPlaceholderId,
  poppedEntryId,
  onTogglePop,
}: {
  name: string
  placements: PlacedEntry[]
  // Placeholder tickets landed in this person's row (spec ".scratch/
  // placeholder-tickets/spec.md") - undefined for the Unmapped/Needs dev/qa
  // catch-all rows, which a Placeholder ticket never lands in (its assignee
  // is always a current TeamMembership, picked at creation time - see
  // AddPlaceholderPopup).
  placeholders?: PlaceholderTicket[]
  variant?: 'normal' | 'unmapped' | 'needsAssignment'
  onOpenPopup?: (ticketId: string) => void
  // Save-on-drop reorder within this row only (ticket 19) - undefined for
  // the Unmapped/Needs dev/qa catch-all rows, which stay undraggable (see
  // TicketBadge's comment above).
  onReorder?: (patches: SprintPlanEntryOrderPatch[]) => void
  // Undoes an accidental add-to-plan - available in every row, including
  // Unmapped/Needs dev/qa, unlike drag-reorder above.
  onRemove?: (entryId: string) => void
  removingEntryId?: string | null
  onRemovePlaceholder?: (id: string) => void
  removingPlaceholderId?: string | null
  // Option/Alt+click "pop" (find-the-pair): entry id of the single currently-
  // popped ticket across the whole table, plus the toggle callback - passed
  // through to every row so a Split ticket's dev/qa placements pop together
  // even when they land in two different people's rows.
  poppedEntryId?: string | null
  onTogglePop?: (entryId: string) => void
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

  const hasPlacements = placements.length > 0
  const hasPlaceholders = !!placeholders && placeholders.length > 0

  return (
    <div
      aria-label={`Tickets for ${name}`}
      className="grid grid-cols-[10rem_1fr] items-start gap-3 border-b border-slate-100 py-2.5 last:border-0 dark:border-white/5"
    >
      <span className={`pt-0.5 text-sm font-medium ${nameClass}`}>{flagged ? `${unmapped ? '⚠' : '❓'} ${name}` : name}</span>
      <div className="flex flex-col gap-1.5">
        {!hasPlacements && !hasPlaceholders && <span className={`pt-0.5 text-xs ${emptyClass}`}>No tickets planned</span>}
        {hasPlacements &&
          (sortable ? (
            <DndContext sensors={dragSensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
              <SortableContext items={placements.map(placementKey)} strategy={rectSortingStrategy}>
                <div className="flex flex-wrap gap-1.5">
                  {placements.map((p) => {
                    const entryId = getId(p.entry) ?? ''
                    return (
                      <SortableTicketBadge
                        key={placementKey(p)}
                        placement={p}
                        onFlagClick={() => onOpenPopup?.(getId(p.entry.ticketId) ?? '')}
                        onRemove={onRemove ? () => onRemove(entryId) : undefined}
                        removing={removingEntryId === entryId}
                        isPopped={!!entryId && entryId === poppedEntryId}
                        onPopClick={onTogglePop ? () => onTogglePop(entryId) : undefined}
                      />
                    )
                  })}
                </div>
              </SortableContext>
            </DndContext>
          ) : (
            <div className="flex flex-wrap gap-1.5">
              {placements.map(({ entry, role }) => {
                const entryId = getId(entry) ?? ''
                return (
                  <TicketBadge
                    key={placementKey({ entry, role })}
                    entry={entry}
                    role={role}
                    unmapped={unmapped}
                    needsAssignment={needsAssignment}
                    onFlagClick={() => onOpenPopup?.(getId(entry.ticketId) ?? '')}
                    onRemove={onRemove ? () => onRemove(entryId) : undefined}
                    removing={removingEntryId === entryId}
                    isPopped={!!entryId && entryId === poppedEntryId}
                    onPopClick={onTogglePop ? () => onTogglePop(entryId) : undefined}
                  />
                )
              })}
            </div>
          ))}
        {hasPlaceholders && (
          <div className="flex flex-wrap gap-1.5">
            {placeholders!.map((p) => {
              const placeholderId = getId(p) ?? ''
              return (
                <PlaceholderBadge
                  key={placeholderId}
                  placeholder={p}
                  onRemove={() => onRemovePlaceholder?.(placeholderId)}
                  removing={removingPlaceholderId === placeholderId}
                />
              )
            })}
          </div>
        )}
      </div>
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
    refreshSprints,
    memberships,
    loadingMemberships,
    planConfigured,
    capacity,
    entries,
    loadingPlan,
    planError,
    sprintPeriod,
    loadingSprintPeriod,
    savingSprintPeriod,
    setSprintPeriod,
    savingCapacityEntry,
    capacityEntryError,
    setLeaveEntries,
    setExtraHours,
    addingTicket,
    addTicketError,
    addTicket,
    placeholders,
    addingPlaceholder,
    addPlaceholderError,
    addPlaceholder,
    removingPlaceholderId,
    removePlaceholderError,
    removePlaceholder,
    savingDevQaOverride,
    devQaOverrideError,
    saveDevQaOverride,
    savingAssigneeOverride,
    assigneeOverrideError,
    saveAssigneeOverride,
    savingPoAssignment,
    poAssignmentError,
    savePoAssignment,
    savingFeatureOverride,
    featureOverrideError,
    saveFeatureOverride,
    savingPlanSpill,
    planSpillError,
    savePlanSpill,
    reorderEntries,
    applyGanttDragPatches,
    removingEntryId,
    removeEntryError,
    removeEntry,
    syncingPlan,
    syncPlanError,
    syncPlan,
  } = useSprintPlan(teamId)
  const { epics, loadingEpics, epicsError } = useEpics(selectedSprintId)
  // The selected Sprint's own Jira-cached dates - SprintPeriodForm's default
  // seed when no plan has been saved yet (spec story 8).
  const selectedSprint = useMemo(() => sprints.find((s) => getId(s) === selectedSprintId) ?? null, [sprints, selectedSprintId])

  const [entryValue, setEntryValue] = useState('')
  // Ticket id of a just-added Split ticket, watched for below until it
  // reappears in `entries` (devQa-decorated, since only GET inlines devQa -
  // see routes/sprintPlanEntries.ts) so we can decide whether to auto-open
  // the popup. `popupTicketId` is the actually-open popup's ticket id -
  // separate state, since the popup can also be opened directly by clicking
  // a flagged badge with no add-to-plan involved.
  const [pendingAutoOpenTicketId, setPendingAutoOpenTicketId] = useState<string | null>(null)
  const [popupTicketId, setPopupTicketId] = useState<string | null>(null)
  // Option/Alt+click "pop" (find-the-pair): the single SprintPlanEntry
  // currently popped, keyed by entry id so a Split ticket's dev and qa
  // placements - which land in two different people's rows - pop together.
  // Only one entry (i.e. one Story/Bug's dev+qa pair) can be popped at a
  // time, per the spec; alt-clicking a placement of the already-popped
  // entry toggles it back off.
  const [poppedEntryId, setPoppedEntryId] = useState<string | null>(null)
  // SprintPeriodForm's collapsed/revealed state (this feature's follow-up -
  // see SprintPeriodToggle above). Closed by default; toggled by the one
  // button in the sprint-selector row, independent of `planConfigured`,
  // which only decides the toggle's own label copy.
  const [periodPanelOpen, setPeriodPanelOpen] = useState(false)
  // AddPlaceholderPopup's open/close state (spec ".scratch/
  // placeholder-tickets/spec.md") - independent of popupTicketId above,
  // since a placeholder ticket has no detail popup of its own to conflict
  // with.
  const [placeholderPopupOpen, setPlaceholderPopupOpen] = useState(false)

  function handleTogglePop(entryId: string) {
    if (!entryId) return
    setPoppedEntryId((prev) => (prev === entryId ? null : entryId))
  }

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
  // Recomputed whenever either input changes, not per-render. The grouping
  // itself lives in utils/ticketPlacements.ts (moved out during the Sprint
  // Planning Gantt Chart's ticket 07) so the Gantt's own per-person
  // placement algorithm (utils/ganttPlacement.ts) can resolve rows the exact
  // same way, rather than re-deriving this resolution logic a second time.
  // PO has no allocation concept at all (CLAUDE.md/CONTEXT.md) - excluded
  // from every Planning-tab consumer of `memberships` below (the "Tickets by
  // person" table, Sprint Breakdown, the placeholder-ticket picker, the
  // Gantt chart). The raw `memberships` (PO included) is still passed to
  // DevQaAssignmentPopup, which needs it to build its own PO-only picker for
  // the popup's PO row.
  const planningMemberships = useMemo(() => memberships.filter((m) => m.role !== 'PO'), [memberships])

  const { ticketsByMembershipId, unmappedPlacements, needsAssignmentPlacements } = useMemo(
    () => groupPlacementsByMembership(entries, planningMemberships),
    [planningMemberships, entries],
  )

  // Sprint Breakdown card's Features/Technical items/Bugs totals (map's
  // Notes) - recomputed whenever entries or memberships change, same
  // reactivity as ticketsByMembershipId above. Deliberately never fed
  // `placeholders` (spec ".scratch/placeholder-tickets/spec.md": a
  // placeholder ticket has no effect on the Sprint Breakdown card) -
  // computeSprintBreakdown only ever accepts SprintPlanEntry[].
  const breakdown = useMemo(() => computeSprintBreakdown(entries, planningMemberships), [entries, planningMemberships])

  // One bucket of PlaceholderTicket[] per current TeamMembership, keyed by
  // personId (spec ".scratch/placeholder-tickets/spec.md") - unlike
  // ticketsByMembershipId above, a placeholder ticket's assignee is always a
  // current TeamMembership (picked from the live roster at creation time via
  // AddPlaceholderPopup), so there's no Unmapped/needs-assignment fallback to
  // build here; a placeholder whose person has since left the team simply
  // has nowhere to render until it's removed.
  const placeholdersByMembershipId = useMemo(() => {
    const membershipIdByPersonId = new Map(planningMemberships.map((m) => [getId(m.personId) ?? '', getId(m) ?? '']))
    const byMembership = new Map<string, PlaceholderTicket[]>()
    for (const placeholder of placeholders) {
      const membershipId = membershipIdByPersonId.get(placeholder.personId)
      if (!membershipId) continue
      if (!byMembership.has(membershipId)) byMembership.set(membershipId, [])
      byMembership.get(membershipId)!.push(placeholder)
    }
    return byMembership
  }, [planningMemberships, placeholders])

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
          <SprintSelect
            id="planning-sprint-select"
            sprints={sprints}
            selectedSprintId={selectedSprintId}
            onSelect={setSelectedSprintId}
          />
        )}
        {selectedSprintId && (
          <SprintPeriodToggle
            open={periodPanelOpen}
            planConfigured={planConfigured}
            onToggle={() => setPeriodPanelOpen((open) => !open)}
          />
        )}
        {teamId && (
          <AddSprintPopover teamId={teamId} cachedSprints={sprints} onImported={refreshSprints} />
        )}
      </div>

      {selectedSprintId && (
        <>
          {periodPanelOpen &&
            (loadingSprintPeriod ? (
              <p className="text-sm text-slate-400 dark:text-slate-500">Loading period…</p>
            ) : (
              <SprintPeriodForm
                key={selectedSprintId}
                period={sprintPeriod}
                sprint={selectedSprint}
                saving={savingSprintPeriod}
                onSave={setSprintPeriod}
                capacity={capacity}
                savingCapacityEntry={savingCapacityEntry}
                capacityEntryError={capacityEntryError}
                onSetLeaveEntries={setLeaveEntries}
                onSetExtraHours={setExtraHours}
              />
            ))}

          <EpicPillStrip epics={epics} loading={loadingEpics} error={epicsError} />

          {loadingPlan ? (
            <p className="text-sm text-slate-400 dark:text-slate-500">Loading capacity…</p>
          ) : planError ? (
            <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-300">
              Error: {planError}
            </p>
          ) : (
            planConfigured && (
              <div className="flex gap-3 overflow-x-auto pb-1">
                {capacity.length === 0 ? (
                  <span className="text-sm text-slate-400 dark:text-slate-500">No one on this team yet.</span>
                ) : (
                  capacity.map((c) => <CapacityCard key={c.teamMembershipId} capacity={c} />)
                )}
              </div>
            )
          )}

          <AddToPlanForm
            value={entryValue}
            onChange={setEntryValue}
            onSubmit={handleAdd}
            loading={addingTicket}
            error={addTicketError}
            onOpenPlaceholder={() => setPlaceholderPopupOpen(true)}
          />

          <div className="flex flex-col gap-4 lg:flex-row lg:items-start">
            <div className="min-w-0 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-white/10 dark:bg-white/5 dark:shadow-none dark:backdrop-blur-md lg:flex-1">
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">Tickets by person</h2>
                <div className="flex items-center gap-2">
                  {removeEntryError && <span className="text-xs text-red-600 dark:text-red-400">{removeEntryError}</span>}
                  <GanttChartButton
                    memberships={planningMemberships}
                    entries={entries}
                    capacity={capacity}
                    sprintPeriod={sprintPeriod}
                    onDragReschedule={applyGanttDragPatches}
                  />
                  <SyncPlanButton syncing={syncingPlan} error={syncPlanError} onSync={() => syncPlan().catch(() => {})} />
                </div>
              </div>
              {loadingMemberships ? (
                <p className="text-sm text-slate-400 dark:text-slate-500">Loading roster…</p>
              ) : planningMemberships.length === 0 ? (
                <p className="text-sm text-slate-400 dark:text-slate-500">
                  No one on this team yet — use &quot;Manage teams&quot; to add people.
                </p>
              ) : (
                <div>
                  {removePlaceholderError && (
                    <span className="text-xs text-red-600 dark:text-red-400">{removePlaceholderError}</span>
                  )}
                  {planningMemberships.map((membership) => (
                    <PersonRow
                      key={getId(membership)}
                      name={membership.personId.name}
                      placements={ticketsByMembershipId.get(getId(membership) ?? '') ?? []}
                      placeholders={placeholdersByMembershipId.get(getId(membership) ?? '') ?? []}
                      onOpenPopup={setPopupTicketId}
                      onReorder={reorderEntries}
                      onRemove={(entryId) => removeEntry(entryId).catch(() => {})}
                      removingEntryId={removingEntryId}
                      onRemovePlaceholder={(id) => removePlaceholder(id).catch(() => {})}
                      removingPlaceholderId={removingPlaceholderId}
                      poppedEntryId={poppedEntryId}
                      onTogglePop={handleTogglePop}
                    />
                  ))}
                  <PersonRow
                    name="Unmapped"
                    placements={unmappedPlacements}
                    variant="unmapped"
                    onOpenPopup={setPopupTicketId}
                    onRemove={(entryId) => removeEntry(entryId).catch(() => {})}
                    removingEntryId={removingEntryId}
                    poppedEntryId={poppedEntryId}
                    onTogglePop={handleTogglePop}
                  />
                  <PersonRow
                    name="Needs dev/qa"
                    placements={needsAssignmentPlacements}
                    variant="needsAssignment"
                    onOpenPopup={setPopupTicketId}
                    onRemove={(entryId) => removeEntry(entryId).catch(() => {})}
                    removingEntryId={removingEntryId}
                    poppedEntryId={poppedEntryId}
                    onTogglePop={handleTogglePop}
                  />
                </div>
              )}
            </div>
            <SprintBreakdownCard breakdown={breakdown} />
          </div>
        </>
      )}

      {popupEntry &&
        (popupEntry.devQa ? (
          <DevQaAssignmentPopup
            entry={popupEntry as SprintPlanEntry & { devQa: NonNullable<SprintPlanEntry['devQa']> }}
            memberships={memberships}
            saving={savingDevQaOverride}
            error={devQaOverrideError}
            onSave={(body) => saveDevQaOverride(getId(popupEntry.ticketId) ?? '', body)}
            savingPlanSpill={savingPlanSpill}
            planSpillError={planSpillError}
            onSavePlanSpill={(role, pair) => savePlanSpill(getId(popupEntry) ?? '', role, pair)}
            poSaving={savingPoAssignment}
            poError={poAssignmentError}
            onSavePo={(body) => savePoAssignment(getId(popupEntry.ticketId) ?? '', body)}
            onClose={() => setPopupTicketId(null)}
          />
        ) : (
          <TicketInfoPopup
            entry={popupEntry}
            memberships={planningMemberships}
            saving={savingAssigneeOverride}
            error={assigneeOverrideError}
            onSave={(body) => saveAssigneeOverride(getId(popupEntry.ticketId) ?? '', body)}
            savingPlanSpill={savingPlanSpill}
            planSpillError={planSpillError}
            onSavePlanSpill={(pair) => savePlanSpill(getId(popupEntry) ?? '', 'single', pair)}
            savingFeatureOverride={savingFeatureOverride}
            featureOverrideError={featureOverrideError}
            onSaveFeature={(isFeature) => saveFeatureOverride(getId(popupEntry.ticketId) ?? '', isFeature)}
            onClose={() => setPopupTicketId(null)}
          />
        ))}

      {placeholderPopupOpen && (
        <AddPlaceholderPopup
          memberships={planningMemberships}
          saving={addingPlaceholder}
          error={addPlaceholderError}
          onSave={(body: AddPlaceholderBody) => addPlaceholder(body).then(() => {})}
          onClose={() => setPlaceholderPopupOpen(false)}
        />
      )}
    </div>
  )
}
