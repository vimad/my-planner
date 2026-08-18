// "Tickets by person" header's Export button (sits before GanttChartButton,
// PlanningView.tsx) - downloads the current planning table (Person/Role/
// Leave/Total/Available/Planned/Remaining + each person's planned tickets)
// plus the Sprint Breakdown card's Features/Technical items/Bugs percentages
// as a single .xlsx file, similar in spirit to the team's existing
// hand-maintained sheet. All the actual data-shaping lives in
// utils/sprintExport.ts; this component only owns the click handler and the
// disabled/no-period guard.
import { downloadSprintPlanExcel } from '../utils/sprintExport'
import type { PlaceholderTicket, SprintCapacity, SprintPlanEntry, TeamMembership } from '../types'
import type { SprintPeriod } from '../hooks/useSprintPlan'

export function SprintExportButton({
  teamName,
  sprintName,
  memberships,
  capacity,
  entries,
  placeholders,
  sprintPeriod,
}: {
  teamName: string
  sprintName: string
  memberships: TeamMembership[]
  capacity: SprintCapacity[]
  entries: SprintPlanEntry[]
  placeholders: PlaceholderTicket[]
  sprintPeriod: SprintPeriod | null
}) {
  // Hard-disables (unlike GanttChartButton, which opens its modal regardless
  // and shows a "set the period first" message inside it) - there's no modal
  // step here to show that message in, and without a saved period there's no
  // Total/Available/Planned/Remaining data (capacity is only ever populated
  // once a plan is configured) or Total No. of days/holidays/Sprint days
  // figures to export.
  const disabled = !sprintPeriod || memberships.length === 0

  return (
    <button
      type="button"
      disabled={disabled}
      onClick={() => void downloadSprintPlanExcel(teamName, sprintName, memberships, capacity, entries, placeholders, sprintPeriod)}
      title={disabled ? "Set this sprint's period before exporting." : undefined}
      className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm font-semibold text-slate-600 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-transparent dark:border-white/10 dark:text-slate-300 dark:hover:bg-white/5"
    >
      Export
    </button>
  )
}
