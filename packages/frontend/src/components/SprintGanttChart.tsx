// Sprint Planning Gantt Chart — button + modal + auto-placed timeline with
// leave/holiday shading, Dev/QA bar linking, and drag-to-reschedule
// (wayfinder tickets 07 + 08 + 09,
// .scratch/sprint-gantt-chart/issues/07-gantt-modal-and-static-timeline.md,
// .scratch/sprint-gantt-chart/issues/08-leave-shading-and-devqa-linking.md,
// .scratch/sprint-gantt-chart/issues/09-drag-reschedule-and-persistence.md).
// Renders one row per current TeamMembership (a synthetic parent/child task
// tree, since SVAR's own "resource planning"/"task grouping" are PRO-gated —
// see ticket 01's API specifics) with each person's Dev-role/QA-role
// placements merged and walk-forward-placed by utils/ganttPlacement.ts
// (ticket 04), plus one sibling child task per leave/holiday day
// (utils/ganttLeaveDays.ts) styled red/amber via CSS. A Split ticket's
// rendered Dev/QA pair gets a native SVAR dependency link
// (utils/ganttDevQaLinks.ts) plus matching `data-id`-keyed CSS. Dragging a
// bar's body persists a per-placement start-date override (ticket 09),
// autosaving on drop with no separate Save button.

import { Gantt, WillowDark } from '@svar-ui/react-gantt'
import type { IApi, ITask } from '@svar-ui/react-gantt'
import '@svar-ui/react-gantt/all.css'
import { useCallback, useMemo, useRef, useState } from 'react'
import { computeDragPatches, computeGanttRows, type GanttDragPatch, type GanttPlacedBar } from '../utils/ganttPlacement'
import { buildLeaveDays } from '../utils/ganttLeaveDays'
import { computeDevQaLinks } from '../utils/ganttDevQaLinks'
import { overrideStartValue, placementKey } from '../utils/ticketPlacements'
import { getId } from '../utils/getId'
import { localTodayISO, parseLocalDate } from '../utils/dateAgenda'
import type { SprintCapacity, SprintPlanEntry, TeamMembership } from '../types'
import type { SprintPeriod } from '../hooks/useSprintPlan'

// Sibling leave/holiday tasks are exclusive-end 1-day bars, same convention
// as ganttPlacement.ts's own GanttBar.end (the day after the day worked) -
// this is the local equivalent of that file's own addDays/parseLocalDate
// pair, not shared across files per this codebase's established
// duplicated-local-date-helper convention (see ganttPlacement.ts's own
// header comment on toLocalDateString).
function nextDay(date: Date): Date {
  const next = new Date(date)
  next.setDate(next.getDate() + 1)
  return next
}

// Ticket 01's synthetic row-per-person tree: one hidden parent "task" per
// TeamMembership (`person-<membershipId>`), spanning the sprint's own
// startDate/endDate so the tree structure exists even for a person with no
// placements this sprint, plus one child task per placed bar and one per
// leave/holiday day. The parent's own bar is hidden via the
// `[data-id^=":person-"] { visibility: hidden }` CSS rule below (ticket 01)
// — only its row label shows in the grid pane.
function buildTasks(
  memberships: TeamMembership[],
  rowsByMembershipId: Map<string, GanttPlacedBar[]>,
  sprintPeriod: SprintPeriod,
  capacity: SprintCapacity[],
  taskIdByBarKey: Map<string, string>,
): ITask[] {
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
        // A Split ticket's rendered Dev/QA pair gets the deterministic
        // `dev-<jiraKey>`/`qa-<jiraKey>` id ticket 08 requires so the
        // `links` config and the `[data-id^=":dev-"]`/`[data-id^=":qa-"]`
        // CSS rules below both target it - every other bar keeps its
        // default ticket-07 `bar.key` id (ganttDevQaLinks.ts only populates
        // an override for a complete, both-roles-rendered pair).
        id: taskIdByBarKey.get(bar.key) ?? bar.key,
        text: `${ticket.jiraKey}${roleLabel}`,
        parent: `person-${membershipId}`,
        start: parseLocalDate(bar.start),
        end: parseLocalDate(bar.end),
      })
    }
  }

  // Leave/holiday sibling tasks (ticket 08, ticket 01's confirmed
  // "ordinary 1-day sibling task" approach - SVAR's `highlightTime` hook is
  // global/per-column only, no per-row argument, so it can't shade a single
  // person's row). Read-only same as every other bar here: the whole
  // `<Gantt readonly>` below already disables drag/edit chart-wide, so
  // these need no extra per-task flag to satisfy "no click/drag
  // affordance."
  for (const day of buildLeaveDays(memberships, capacity, sprintPeriod.holidays)) {
    const start = parseLocalDate(day.date)
    tasks.push({
      id: day.key,
      text: day.label,
      parent: `person-${day.membershipId}`,
      start,
      end: nextDay(start),
    })
  }

  return tasks
}

// Every current saved override, keyed the same way computeGanttRows/
// placePersonBars key their placements (utils/ticketPlacements.ts's
// placementKey) - a non-split entry contributes at most one `-main` key, a
// Split entry contributes both a `-dev` and a `-qa` key regardless of
// whether that role's currently resolved (harmless if a key is never looked
// up - computeGanttRows only ever queries this map for placements it has
// already resolved into a row). Reused directly off `p.entry`'s own
// ganttStartDate/devGanttStartDate/qaGanttStartDate fields via
// overrideStartValue, the same helper computeDragPatches uses, so this
// file never duplicates the "which field, for which role" logic.
function buildOverrideStartMap(entries: SprintPlanEntry[]): Map<string, string> {
  const map = new Map<string, string>()
  for (const entry of entries) {
    const placements = entry.devQa ? [{ entry, role: 'dev' as const }, { entry, role: 'qa' as const }] : [{ entry }]
    for (const p of placements) {
      const value = overrideStartValue(p)
      if (value) map.set(placementKey(p), value)
    }
  }
  return map
}

function SprintGantt({
  memberships,
  entries,
  capacity,
  sprintPeriod,
  onDragReschedule,
}: {
  memberships: TeamMembership[]
  entries: SprintPlanEntry[]
  capacity: SprintCapacity[]
  sprintPeriod: SprintPeriod
  onDragReschedule: (patches: GanttDragPatch[]) => void
}) {
  const window = useMemo(
    () => ({ startDate: sprintPeriod.startDate, holidays: sprintPeriod.holidays }),
    [sprintPeriod.startDate, sprintPeriod.holidays],
  )

  const { tasks, links } = useMemo(() => {
    // Ticket 09: every placement's own saved start-date override now feeds
    // the algorithm's override-aware cursor-continuation branch (ticket 04
    // answer #4, implemented since ticket 07 but unexercised until now) -
    // an overridden placement is fixed at its saved start and never
    // auto-placed, exactly what makes a drag "stick" independently of the
    // Planning sheet from then on. Ticket 08's Dev/QA link ids and leave/
    // holiday sibling tasks are computed from the same override-aware rows,
    // so a dragged Split placement keeps its link/CSS pairing.
    const rowsByMembershipId = computeGanttRows(entries, memberships, capacity, window, buildOverrideStartMap(entries))
    const { taskIdByBarKey, links } = computeDevQaLinks(rowsByMembershipId)
    const tasks = buildTasks(memberships, rowsByMembershipId, sprintPeriod, capacity, taskIdByBarKey)
    return { tasks, links }
  }, [memberships, entries, capacity, window, sprintPeriod])

  // SVAR's `init` prop is a one-time setup hook, called once when the
  // underlying api/store is created - it does NOT re-fire just because
  // SprintGantt re-renders with new props (a fresh drag landing updates
  // `entries` via applyGanttDragPatches's optimistic update, re-rendering
  // this component with new props, but never re-invoking `init`). If the
  // `update-task` callback below closed over `entries`/`memberships`/
  // `capacity`/`window` directly, a *second* drag would compute its patches
  // against stale pre-first-drag data. Refs sidestep this: the callback
  // itself is created once (empty dep array) and always reads whichever
  // values were current when the SUBSEQUENT drag actually landed, via
  // `.current`.
  const entriesRef = useRef(entries)
  entriesRef.current = entries
  const membershipsRef = useRef(memberships)
  membershipsRef.current = memberships
  const capacityRef = useRef(capacity)
  capacityRef.current = capacity
  const windowRef = useRef(window)
  windowRef.current = window
  const onDragRescheduleRef = useRef(onDragReschedule)
  onDragRescheduleRef.current = onDragReschedule

  // Ticket 09: SVAR fires `update-task` on every intermediate drag frame
  // (`inProgress: true`) and once more on drop (`inProgress` false/absent) -
  // only the drop should autosave (no separate Save button/state, per the
  // map's Leave-grid/Planning-reorder convention), so every in-progress
  // event is ignored. `api.getTask(id)` (ticket 01's confirmed readback
  // path) returns the dropped task's own resolved `start`/`parent` - parent
  // is checked so a task dropped outside any row (shouldn't happen, but
  // defensive) never crashes computeDragPatches with an unknown
  // membershipId. Only ticket-bar ids are ever handled - the synthetic
  // `person-<membershipId>` summary rows are both invisible
  // (visibility: hidden below, so unreachable by mouse) and explicitly
  // skipped here as a second guard.
  const handleInit = useCallback((api: IApi) => {
    api.on('update-task', (ev: { id: string | number; inProgress?: boolean }) => {
      if (ev.inProgress) return
      const id = String(ev.id)
      if (id.startsWith('person-')) return

      const task = api.getTask(ev.id)
      const parent = task.parent !== undefined ? String(task.parent) : ''
      if (!task.start || !parent.startsWith('person-')) return

      const membershipId = parent.slice('person-'.length)
      const newStart = localTodayISO(task.start)
      const patches = computeDragPatches(
        entriesRef.current,
        membershipsRef.current,
        capacityRef.current,
        windowRef.current,
        membershipId,
        id,
        newStart,
      )
      onDragRescheduleRef.current(patches)
    })
  }, [])

  return (
    <div className="flex flex-col gap-3">
      {/* Hides each synthetic person-row's own summary bar - only its grid
          label should show (ticket 01's API specifics). visibility: hidden
          (not opacity/display) also means this row never receives pointer
          events, so it can't accidentally be dragged (ticket 09's
          "no cross-row drag" - a ticket bar's own `parent` is fixed to its
          row and is never itself reassigned by a plain body-drag anyway,
          this just also keeps the hidden summary bar out of reach). Leave/
          holiday shading (ticket 08) reuses SprintLeaveGrid.tsx's exact
          color vocabulary: full leave/holiday = red-400/500, half leave =
          amber-300/500. A Split ticket's linked Dev/QA pair (ticket 08)
          shares a fuchsia border/background, the same accent color this
          app already uses for "highlighted/selected" affordances (see
          SprintLeaveGrid's own row-highlight border). */}
      <style>{`
        .wx-bar[data-id^=":person-"] { visibility: hidden; }
        .wx-bar[data-id^=":leave-full-"] { background: #ef4444; border-color: #f87171; }
        .wx-bar[data-id^=":leave-half-"] { background: #f59e0b; border-color: #fcd34d; }
        .wx-bar[data-id^=":dev-"], .wx-bar[data-id^=":qa-"] { border: 2px solid #e879f9; background: rgba(217, 70, 239, 0.35); }
      `}</style>
      <div style={{ height: 480 }}>
        <WillowDark>
          <Gantt
            tasks={tasks}
            links={links}
            columns={[{ id: 'text', header: 'Person', width: 160 }]}
            cellWidth={32}
            cellHeight={30}
            init={handleInit}
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
  onDragReschedule,
}: {
  memberships: TeamMembership[]
  entries: SprintPlanEntry[]
  capacity: SprintCapacity[]
  sprintPeriod: SprintPeriod | null
  onClose: () => void
  onDragReschedule: (patches: GanttDragPatch[]) => void
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
            <SprintGantt
              memberships={memberships}
              entries={entries}
              capacity={capacity}
              sprintPeriod={sprintPeriod}
              onDragReschedule={onDragReschedule}
            />
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
  onDragReschedule,
}: {
  memberships: TeamMembership[]
  entries: SprintPlanEntry[]
  capacity: SprintCapacity[]
  sprintPeriod: SprintPeriod | null
  // Ticket 09's drag-to-reschedule autosave - the patches computeDragPatches
  // derived from one drag/drop, handed to the caller (PlanningView, backed
  // by useSprintPlan's applyGanttDragPatches) to actually persist. This
  // component only ever computes *what* changed, never issues the PATCH
  // itself - same separation as PlanningView's own onReorder prop
  // (computeReorderPatches -> reorderEntries).
  onDragReschedule: (patches: GanttDragPatch[]) => void
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
          onDragReschedule={onDragReschedule}
        />
      )}
    </>
  )
}
