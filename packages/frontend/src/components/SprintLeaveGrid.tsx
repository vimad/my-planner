import { useState } from 'react'
import { parseLocalDate } from '../utils/dateAgenda'
import { formatDaysHours } from '../utils/formatDuration'
import type { LeaveEntry, LeavePortion, SprintCapacity } from '../types'

function formatShortLabel(dateStr: string): string {
  return parseLocalDate(dateStr).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric' })
}

// none -> half -> full -> none, per cell click (spec's "click-to-cycle").
function cyclePortion(current: LeavePortion | undefined): LeavePortion | null {
  if (current === undefined) return 'half'
  if (current === 'half') return 'full'
  return null
}

// Returns a person's full, updated entries array with `date`'s portion
// cycled - the grid always sends the whole set to setLeaveEntries, never a
// single-cell diff (PATCH's full-array-replacement contract).
function cycleLeaveEntries(entries: LeaveEntry[], date: string): LeaveEntry[] {
  const current = entries.find((e) => e.date === date)?.portion
  const next = cyclePortion(current)
  const withoutDate = entries.filter((e) => e.date !== date)
  return next === null ? withoutDate : [...withoutDate, { date, portion: next }]
}

// One header/body column: `date` is always drawn from SprintPeriodForm's
// live, possibly-unsaved startDate/endDate/holidays draft, so the grid stays
// reactive to it. `writable` marks whether `date` also falls inside the
// sprint's currently-*saved* working-day calendar - a PATCH
// .../capacity-entries call 400s on a leave date outside it, and the POST
// path, though permissive at write time, has the date silently reconciled
// back out on the next capacity refetch. A non-writable column (an as-yet-
// unsaved date-range/holiday tweak) renders as non-interactive so a click
// can't hit either failure mode.
export interface SprintLeaveGridColumn {
  date: string
  writable: boolean
}

// The "Extra hrs" column's inline-edited number input, next to Person. A
// local `draft` string mirrors SprintPeriodForm's own "never re-syncs after
// mount" posture (see that component's header comment) - the row's `key` is
// the stable teamMembershipId, so this only (re)initializes from `value`
// once per person, and an in-progress edit survives an unrelated capacity
// refetch (e.g. another person's leave-cell save) elsewhere in the grid.
// Commits on blur/Enter rather than per-keystroke, to avoid a PATCH per
// character typed.
function ExtraHoursCell({
  teamMembershipId,
  personName,
  value,
  onSetExtraHours,
}: {
  teamMembershipId: string
  personName: string
  value: number
  onSetExtraHours: (teamMembershipId: string, hours: number) => Promise<void>
}) {
  const [draft, setDraft] = useState(String(value))

  function commit() {
    const parsed = Number(draft)
    const next = Number.isFinite(parsed) && parsed >= 0 ? parsed : 0
    setDraft(String(next))
    if (next !== value) {
      onSetExtraHours(teamMembershipId, next).catch(() => {
        // capacityEntryError (via the grid's `error` prop) already surfaces the failure.
      })
    }
  }

  return (
    <input
      type="number"
      min={0}
      step={0.5}
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === 'Enter') (e.target as HTMLInputElement).blur()
      }}
      aria-label={`Extra allocation hours for ${personName}`}
      className="w-14 [appearance:textfield] rounded-lg border border-slate-200 bg-slate-50 px-1.5 py-0.5 text-left text-xs text-slate-700 focus:border-fuchsia-400/60 focus:outline-none [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none dark:border-white/10 dark:bg-white/5 dark:text-slate-200"
    />
  )
}

// Ticket ".scratch/sprint-leave-picker/spec.md" Variant C ("whole-team
// grid"), the winning UI variant from this feature's `/prototype` session -
// now hosted inside SprintPeriodForm (PlanningView.tsx) rather than always
// visible, so its columns can be reactive to the form's live, unsaved
// startDate/endDate/holidays draft. Rows = every current TeamMembership (the
// same set the CapacityCard strip above already iterates, sourced from the
// same `capacity` array), columns = `columns`. Each person's Total column
// and, via the capacity strip above, their Available/Remaining figures
// update live once a cell's save round-trips and refreshPlan() re-fetches -
// leaveDays/leaveEntries are both server-derived/reconciled (routes/
// capacity.ts), never computed client-side here.
export function SprintLeaveGrid({
  capacity,
  columns,
  saving,
  error,
  onSetLeaveEntries,
  onSetExtraHours,
}: {
  capacity: SprintCapacity[]
  columns: SprintLeaveGridColumn[]
  saving: boolean
  error: string | null
  onSetLeaveEntries: (teamMembershipId: string, entries: LeaveEntry[]) => Promise<void>
  onSetExtraHours: (teamMembershipId: string, hours: number) => Promise<void>
}) {
  const [highlightedMembershipId, setHighlightedMembershipId] = useState<string | null>(null)

  if (capacity.length === 0) return null

  if (columns.length === 0) {
    return (
      <p className="text-xs text-slate-400 dark:text-slate-500">
        Pick a valid date range with at least one working day to record leave.
      </p>
    )
  }

  function handleCellClick(teamMembershipId: string, entries: LeaveEntry[], date: string) {
    onSetLeaveEntries(teamMembershipId, cycleLeaveEntries(entries, date)).catch(() => {
      // capacityEntryError (via `error` prop) already surfaces the failure.
    })
  }

  return (
    <div className="flex flex-col gap-1.5">
      <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-white/10 dark:bg-white/5 dark:shadow-none">
        <table className="w-full border-collapse text-xs">
          <thead>
            <tr>
              <th className="sticky left-0 z-10 border-b border-r border-slate-200 bg-white px-2 py-1.5 text-left font-semibold text-slate-500 dark:border-white/10 dark:bg-[#1a1229] dark:text-slate-300">
                Person
              </th>
              <th className="border-b border-slate-200 py-1.5 pl-1.5 pr-4 text-left font-semibold text-slate-500 dark:border-white/10 dark:text-slate-300">
                Extra hrs
              </th>
              {columns.map(({ date }) => (
                <th
                  key={date}
                  className="border-b border-slate-200 px-1.5 py-1.5 text-center font-medium text-slate-400 dark:border-white/10 dark:text-slate-500"
                >
                  {formatShortLabel(date)}
                </th>
              ))}
              <th className="border-b border-slate-200 px-2 py-1.5 text-right font-semibold text-slate-500 dark:border-white/10 dark:text-slate-300">
                Total
              </th>
            </tr>
          </thead>
          <tbody>
            {capacity.map((c) => {
              const totalHours = c.leaveDays * 8 + c.extraHours
              const isHighlighted = c.teamMembershipId === highlightedMembershipId
              function toggleHighlight() {
                setHighlightedMembershipId((cur) => (cur === c.teamMembershipId ? null : c.teamMembershipId))
              }
              return (
                <tr
                  key={c.teamMembershipId}
                  className={
                    isHighlighted
                      ? 'border-y-2 border-fuchsia-400/60 dark:border-fuchsia-400/60'
                      : 'border-b border-slate-100 last:border-0 dark:border-white/5'
                  }
                >
                  <td
                    role="button"
                    tabIndex={0}
                    onClick={toggleHighlight}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault()
                        toggleHighlight()
                      }
                    }}
                    aria-pressed={isHighlighted}
                    aria-label={`Highlight ${c.personName}'s row`}
                    className={`sticky left-0 z-10 cursor-pointer px-2 py-1 font-medium text-slate-800 dark:text-slate-100 ${
                      isHighlighted
                        ? 'border-y-2 border-l border-r border-fuchsia-400/60 bg-fuchsia-50 dark:border-fuchsia-400/60 dark:bg-fuchsia-500/10'
                        : 'border-r border-slate-200 bg-white hover:bg-slate-50 dark:border-white/10 dark:bg-[#160f24] dark:hover:bg-white/10'
                    }`}
                  >
                    {c.personName}
                  </td>
                  <td className="py-1 pl-1.5 pr-4 text-left">
                    <ExtraHoursCell
                      teamMembershipId={c.teamMembershipId}
                      personName={c.personName}
                      value={c.extraHours}
                      onSetExtraHours={onSetExtraHours}
                    />
                  </td>
                  {columns.map(({ date, writable }) => {
                    const portion = c.leaveEntries.find((e) => e.date === date)?.portion
                    if (!writable) {
                      return (
                        <td key={date} className="p-0.5 text-center">
                          <span
                            title="Save the period to record leave on this day"
                            aria-label={`Leave for ${c.personName} on ${date} unavailable until the period is saved`}
                            className="block h-5 w-full rounded bg-slate-50 opacity-50 dark:bg-white/5"
                          />
                        </td>
                      )
                    }
                    const cellClass =
                      portion === 'full'
                        ? 'bg-red-400 dark:bg-red-500/70'
                        : portion === 'half'
                          ? 'bg-amber-300 dark:bg-amber-500/60'
                          : 'bg-slate-50 hover:bg-slate-200 dark:bg-white/5 dark:hover:bg-white/15'
                    return (
                      <td key={date} className="p-0.5 text-center">
                        <button
                          type="button"
                          onClick={() => handleCellClick(c.teamMembershipId, c.leaveEntries, date)}
                          aria-label={`Toggle leave for ${c.personName} on ${date}`}
                          aria-pressed={portion !== undefined}
                          className={`h-5 w-full rounded ${cellClass}`}
                        />
                      </td>
                    )
                  })}
                  <td
                    className={`px-2 py-1 text-right font-semibold text-slate-700 dark:text-slate-200 ${
                      isHighlighted ? 'border-y-2 border-r border-fuchsia-400/60 dark:border-fuchsia-400/60' : ''
                    }`}
                  >
                    {totalHours > 0 ? formatDaysHours(totalHours) : '—'}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      {saving && <span className="text-xs text-slate-400 dark:text-slate-500">Saving…</span>}
      {error && <span className="text-xs text-red-600 dark:text-red-400">{error}</span>}
    </div>
  )
}
