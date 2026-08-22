import { parseLocalDate } from '../utils/dateAgenda'
import type { AtlasPlanningLeaveMark, AtlasRosterMember } from '../types'
import { getId } from '../utils/getId'

function formatShortLabel(dateStr: string): string {
  return parseLocalDate(dateStr).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric' })
}

function memberId(m: AtlasRosterMember): string {
  return getId(m) ?? ''
}

// Atlas Planning tab's leave grid (.scratch/atlas-planning-tab, ticket 02) -
// one row per roster member, one column per date in the current rolling
// two-week window (windowDates, from utils/rollingWindow.ts). Click-to-cycle
// interaction shape only borrowed from Sprint Planning's SprintLeaveGrid.tsx
// (none -> full -> half -> none) - own implementation, no import, per the
// spec's module-boundary decision. `windowDates` is always the *only* set of
// columns rendered: a leave mark whose date has aged out of the window
// simply has no column to render into any more (read-time reconciliation -
// see useAtlasPlanningLeave.ts's own comment on the backend GET already
// filtering to the same window).
export function AtlasPlanningLeaveGrid({
  roster,
  windowDates,
  leaveMarks,
  cycling,
  cycleError,
  onCycle,
}: {
  roster: AtlasRosterMember[]
  windowDates: string[]
  leaveMarks: AtlasPlanningLeaveMark[]
  cycling: boolean
  cycleError: string | null
  onCycle: (rosterMemberId: string, date: string) => Promise<void>
}) {
  if (roster.length === 0) return null

  function handleCellClick(rosterMemberId: string, date: string) {
    onCycle(rosterMemberId, date).catch(() => {
      // cycleError (via the `cycleError` prop) already surfaces the failure.
    })
  }

  return (
    <div className="flex flex-col gap-1.5">
      <h3 className="text-sm font-bold text-slate-800 dark:text-slate-100">Leave</h3>
      <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-white/10 dark:bg-white/5 dark:shadow-none">
        <table className="w-full border-collapse text-xs">
          <thead>
            <tr>
              <th className="sticky left-0 z-10 border-b border-r border-slate-200 bg-white px-2 py-1.5 text-left font-semibold text-slate-500 dark:border-white/10 dark:bg-[#1a1229] dark:text-slate-300">
                Person
              </th>
              {windowDates.map((date) => (
                <th
                  key={date}
                  className="border-b border-slate-200 px-1.5 py-1.5 text-center font-medium text-slate-400 dark:border-white/10 dark:text-slate-500"
                >
                  {formatShortLabel(date)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {roster.map((member) => {
              const id = memberId(member)
              return (
                <tr key={id} className="border-b border-slate-100 last:border-0 dark:border-white/5">
                  <td className="sticky left-0 z-10 border-r border-slate-200 bg-white px-2 py-1 font-medium text-slate-800 dark:border-white/10 dark:bg-[#160f24] dark:text-slate-100">
                    {member.personId.name}
                  </td>
                  {windowDates.map((date) => {
                    const mark = leaveMarks.find((m) => m.rosterMemberId === id && m.date === date)
                    const portion = mark?.portion
                    const cellClass =
                      portion === 'full'
                        ? 'bg-red-400 text-white dark:bg-red-500/70'
                        : portion === 'half'
                          ? 'bg-amber-300 text-amber-900 dark:bg-amber-500/60 dark:text-amber-950'
                          : 'bg-slate-50 hover:bg-slate-200 dark:bg-white/5 dark:hover:bg-white/15'
                    const portionLabel = portion === 'full' ? 'full day' : portion === 'half' ? 'half day' : 'no leave'
                    return (
                      <td key={date} className="p-0.5 text-center">
                        <button
                          type="button"
                          onClick={() => handleCellClick(id, date)}
                          disabled={cycling}
                          aria-label={`Toggle leave for ${member.personId.name} on ${date} (currently ${portionLabel})`}
                          aria-pressed={portion !== undefined}
                          className={`h-5 w-full rounded text-[10px] font-bold disabled:cursor-not-allowed disabled:opacity-70 ${cellClass}`}
                        >
                          {portion === 'full' ? 'F' : portion === 'half' ? 'H' : ''}
                        </button>
                      </td>
                    )
                  })}
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      {cycleError && <span className="text-xs text-red-600 dark:text-red-400">Error: {cycleError}</span>}
    </div>
  )
}
