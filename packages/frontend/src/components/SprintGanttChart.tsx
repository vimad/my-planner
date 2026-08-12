// Sprint Planning Gantt Chart — button + modal + read-only auto-placed
// timeline (wayfinder ticket 07,
// .scratch/sprint-gantt-chart/issues/07-gantt-modal-and-static-timeline.md).
// Renders one row per current TeamMembership (a synthetic parent/child task
// tree, since SVAR's own "resource planning"/"task grouping" are PRO-gated —
// see ticket 01's API specifics) with each person's Dev-role/QA-role
// placements merged and walk-forward-placed by utils/ganttPlacement.ts
// (ticket 04). Intentionally static for this ticket: no drag, no leave/
// holiday shading, no Dev/QA bar linking, no persistence — those are ticket
// 08/09's scope, built on top of this same task-tree shape.

import { Gantt, WillowDark } from '@svar-ui/react-gantt'
import type { ITask } from '@svar-ui/react-gantt'
import '@svar-ui/react-gantt/all.css'
import { useMemo, useState } from 'react'
import { computeGanttRows, type GanttPlacedBar } from '../utils/ganttPlacement'
import { getId } from '../utils/getId'
import { parseLocalDate } from '../utils/dateAgenda'
import type { SprintCapacity, SprintPlanEntry, TeamMembership } from '../types'
import type { SprintPeriod } from '../hooks/useSprintPlan'

// Ticket 01's synthetic row-per-person tree: one hidden parent "task" per
// TeamMembership (`person-<membershipId>`), spanning the sprint's own
// startDate/endDate so the tree structure exists even for a person with no
// placements this sprint, plus one child task per placed bar. The parent's
// own bar is hidden via the `[data-id^=":person-"] { visibility: hidden }`
// CSS rule below (ticket 01) — only its row label shows in the grid pane.
function buildTasks(memberships: TeamMembership[], rowsByMembershipId: Map<string, GanttPlacedBar[]>, sprintPeriod: SprintPeriod): ITask[] {
  const tasks: ITask[] = []
  const sprintStart = parseLocalDate(sprintPeriod.startDate)
  const sprintEnd = parseLocalDate(sprintPeriod.endDate)

  for (const membership of memberships) {
    const membershipId = getId(membership) ?? ''
    tasks.push({
      id: `person-${membershipId}`,
      text: membership.personId.name,
      parent: 0,
      open: true,
      start: sprintStart,
      end: sprintEnd,
    })

    const bars = rowsByMembershipId.get(membershipId) ?? []
    for (const bar of bars) {
      const ticket = bar.entry.ticketId
      const roleLabel = bar.role ? ` [${bar.role.toUpperCase()}]` : ''
      tasks.push({
        id: bar.key,
        text: `${ticket.jiraKey}${roleLabel}`,
        parent: `person-${membershipId}`,
        start: parseLocalDate(bar.start),
        end: parseLocalDate(bar.end),
      })
    }
  }

  return tasks
}

function SprintGantt({
  memberships,
  entries,
  capacity,
  sprintPeriod,
}: {
  memberships: TeamMembership[]
  entries: SprintPlanEntry[]
  capacity: SprintCapacity[]
  sprintPeriod: SprintPeriod
}) {
  const tasks = useMemo(() => {
    // No saved-override input yet (ticket 05/09) — always an empty map, so
    // every placement takes the pure auto-placement branch. The
    // override-aware cursor-continuation branch inside computeGanttRows/
    // placePersonBars is fully implemented already (ticket 04 answer #4),
    // just unexercised until ticket 09 wires a real override source in.
    const rowsByMembershipId = computeGanttRows(entries, memberships, capacity, {
      startDate: sprintPeriod.startDate,
      holidays: sprintPeriod.holidays,
    })
    return buildTasks(memberships, rowsByMembershipId, sprintPeriod)
  }, [memberships, entries, capacity, sprintPeriod])

  return (
    <div className="flex flex-col gap-3">
      {/* Hides each synthetic person-row's own summary bar - only its grid
          label should show (ticket 01's API specifics). */}
      <style>{`.wx-bar[data-id^=":person-"] { visibility: hidden; }`}</style>
      <div style={{ height: 480 }}>
        <WillowDark>
          <Gantt
            tasks={tasks}
            columns={[{ id: 'text', header: 'Person', width: 160 }]}
            cellWidth={32}
            cellHeight={30}
            readonly
          />
        </WillowDark>
      </div>
    </div>
  )
}

// Widened "large modal" variant of docs/ui-conventions.md's Archetype B
// (full modal dialog) — `max-w-6xl` instead of the base `max-w-sm`, plus
// `max-h-[90vh] overflow-hidden` on the card with `overflow-auto` on the
// inner content, since the base archetype has no height cap (its dialogs
// are always short). Confirmed viable in ticket 01's prototype; documented
// as its own named variant in docs/ui-conventions.md so a later "big"
// surface can copy this instead of re-deriving the numbers.
function GanttChartModal({
  memberships,
  entries,
  capacity,
  sprintPeriod,
  onClose,
}: {
  memberships: TeamMembership[]
  entries: SprintPlanEntry[]
  capacity: SprintCapacity[]
  sprintPeriod: SprintPeriod | null
  onClose: () => void
}) {
  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/60 p-4">
      <div className="flex max-h-[90vh] w-full max-w-6xl flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white p-6 text-slate-900 shadow-xl dark:border-white/10 dark:bg-[#160f24] dark:text-slate-100">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">Sprint Gantt chart</h2>
          <button
            type="button"
            aria-label="Close"
            onClick={onClose}
            className="shrink-0 rounded-full px-2 py-0.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-white/10 dark:hover:text-slate-200"
          >
            ×
          </button>
        </div>
        <div className="overflow-auto">
          {!sprintPeriod ? (
            <p className="text-sm text-slate-400 dark:text-slate-500">
              Set this sprint&apos;s period (start/end date and working days) before viewing its Gantt chart.
            </p>
          ) : memberships.length === 0 ? (
            <p className="text-sm text-slate-400 dark:text-slate-500">No one on this team yet.</p>
          ) : (
            <SprintGantt memberships={memberships} entries={entries} capacity={capacity} sprintPeriod={sprintPeriod} />
          )}
        </div>
      </div>
    </div>
  )
}

// Sits in "Tickets by person"'s header, before SyncPlanButton (ticket 07),
// owning its own open/close state - mirrors AddPlaceholderPopup's
// self-contained button+popup pairing rather than PlanningView lifting the
// open flag itself, since nothing else needs to know whether the Gantt is
// open.
export function GanttChartButton({
  memberships,
  entries,
  capacity,
  sprintPeriod,
}: {
  memberships: TeamMembership[]
  entries: SprintPlanEntry[]
  capacity: SprintCapacity[]
  sprintPeriod: SprintPeriod | null
}) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm font-semibold text-slate-600 hover:bg-slate-100 dark:border-white/10 dark:text-slate-300 dark:hover:bg-white/5"
      >
        Gantt chart
      </button>
      {open && (
        <GanttChartModal
          memberships={memberships}
          entries={entries}
          capacity={capacity}
          sprintPeriod={sprintPeriod}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  )
}
