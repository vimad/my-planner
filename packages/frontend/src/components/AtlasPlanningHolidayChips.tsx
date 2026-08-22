import { parseLocalDate } from '../utils/dateAgenda'
import type { AtlasPlanningHoliday, AtlasRosterMember } from '../types'

function formatChipLabel(dateStr: string): string {
  return parseLocalDate(dateStr).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' })
}

// Atlas Planning tab's holiday chip row (.scratch/atlas-planning-tab, ticket
// 02) - a single row of the current rolling two-week window's dates
// (windowDates, from utils/rollingWindow.ts), toggled on/off, shared by the
// whole roster (not per person - contrast with AtlasPlanningLeaveGrid).
// Toggle interaction shape only borrowed from Sprint Planning's
// PlanningView.tsx (SprintPeriodForm's holiday chips) - own implementation,
// no import, per the spec's module-boundary decision. `windowDates` is
// always the *only* set of chips rendered: a holiday whose date has aged out
// of the window simply has no chip to render into any more (read-time
// reconciliation - the backend GET already filters to the same window).
//
// Rendered only while the roster has at least one member, same posture as
// the leave grid - matches the rest of the Planning tab hiding its
// leave/holiday chrome entirely until there's someone to plan for.
export function AtlasPlanningHolidayChips({
  roster,
  windowDates,
  holidays,
  toggling,
  toggleError,
  onToggle,
}: {
  roster: AtlasRosterMember[]
  windowDates: string[]
  holidays: AtlasPlanningHoliday[]
  toggling: boolean
  toggleError: string | null
  onToggle: (date: string) => Promise<void>
}) {
  if (roster.length === 0) return null

  function handleToggle(date: string) {
    onToggle(date).catch(() => {
      // toggleError (via the `toggleError` prop) already surfaces the failure.
    })
  }

  return (
    <div className="flex flex-col gap-1.5">
      <h3 className="text-sm font-bold text-slate-800 dark:text-slate-100">Holidays</h3>
      <div className="flex flex-wrap gap-1.5">
        {windowDates.map((date) => {
          const isHoliday = holidays.some((h) => h.date === date)
          return (
            <button
              key={date}
              type="button"
              onClick={() => handleToggle(date)}
              disabled={toggling}
              aria-pressed={isHoliday}
              aria-label={`Toggle holiday for ${date}`}
              className={
                isHoliday
                  ? 'rounded-full border border-red-300 bg-red-100 px-2.5 py-1 text-xs font-medium text-red-700 line-through disabled:cursor-not-allowed disabled:opacity-70 dark:border-red-500/30 dark:bg-red-500/20 dark:text-red-300'
                  : 'rounded-full border border-slate-200 bg-white px-2.5 py-1 text-xs font-medium text-slate-600 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-70 dark:border-white/10 dark:bg-white/5 dark:text-slate-300 dark:hover:bg-white/10'
              }
            >
              {formatChipLabel(date)}
            </button>
          )
        })}
      </div>
      {toggleError && <span className="text-xs text-red-600 dark:text-red-400">Error: {toggleError}</span>}
    </div>
  )
}
