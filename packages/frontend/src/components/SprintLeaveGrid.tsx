import { useMemo } from 'react'
import type { SprintPeriod } from '../hooks/useSprintPlan'
import { parseLocalDate } from '../utils/dateAgenda'
import { computeWorkingDates } from '../utils/sprintWorkingDates'
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

// Ticket ".scratch/sprint-leave-picker/spec.md" Variant C ("whole-team
// grid"), the winning UI variant from this feature's `/prototype` session -
// promoted here as the real, always-visible (not `?variant=`-gated)
// component. Rows = every current TeamMembership (the same set the
// CapacityCard strip above already iterates, sourced from the same
// `capacity` array), columns = the sprint's actual working dates. Each
// person's Total column and, via the capacity strip above, their Available/
// Remaining figures update live once a cell's save round-trips and
// refreshPlan() re-fetches - leaveDays/leaveEntries are both server-derived/
// reconciled (routes/capacity.ts), never computed client-side here.
export function SprintLeaveGrid({
  capacity,
  sprintPeriod,
  saving,
  error,
  onSetLeaveEntries,
}: {
  capacity: SprintCapacity[]
  sprintPeriod: SprintPeriod | null
  saving: boolean
  error: string | null
  onSetLeaveEntries: (teamMembershipId: string, entries: LeaveEntry[]) => Promise<void>
}) {
  const workingDates = useMemo(
    () => (sprintPeriod ? computeWorkingDates(sprintPeriod.startDate, sprintPeriod.endDate, sprintPeriod.holidays) : []),
    [sprintPeriod],
  )

  if (capacity.length === 0) return null

  if (workingDates.length === 0) {
    return (
      <p className="text-xs text-slate-400 dark:text-slate-500">
        Set a sprint period with at least one working day to record leave.
      </p>
    )
  }

  function handleCellClick(teamMembershipId: string, entries: LeaveEntry[], date: string) {
    onSetLeaveEntries(teamMembershipId, cycleLeaveEntries(entries, date)).catch(() => {
      // leaveEntriesError (via `error` prop) already surfaces the failure.
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
              {workingDates.map((date) => (
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
            {capacity.map((c) => (
              <tr key={c.teamMembershipId} className="border-b border-slate-100 last:border-0 dark:border-white/5">
                <td className="sticky left-0 z-10 border-r border-slate-200 bg-white px-2 py-1 font-medium text-slate-800 dark:border-white/10 dark:bg-[#160f24] dark:text-slate-100">
                  {c.personName}
                </td>
                {workingDates.map((date) => {
                  const portion = c.leaveEntries.find((e) => e.date === date)?.portion
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
                <td className="px-2 py-1 text-right font-semibold text-slate-700 dark:text-slate-200">
                  {c.leaveDays > 0 ? `${c.leaveDays}d` : '—'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {saving && <span className="text-xs text-slate-400 dark:text-slate-500">Saving…</span>}
      {error && <span className="text-xs text-red-600 dark:text-red-400">{error}</span>}
    </div>
  )
}
