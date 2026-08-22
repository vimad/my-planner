// Atlas Planning tab's Gantt chart (.scratch/atlas-planning-tab, ticket 03)
// — its own near-fullscreen-modal wrapper around @svar-ui/react-gantt,
// fixed to the same rolling two-week window ticket 02's
// utils/rollingWindow.ts computes for the leave grid/holiday chips ("chart,
// table, and leave/holiday views never disagree on what 'the window' is" -
// `windowDates` is always handed in by the caller, computed once, never
// recomputed here). Deliberately NOT importing SprintGanttChart.tsx/
// ganttPlacement.ts/ganttDevQaLinks.ts/ganttLeaveDays.ts (Sprint Planning's
// own Gantt module) or useAtlasEpics.ts (Atlas's epic/task stack) - a fresh,
// separate implementation per the spec's module-boundary decision, even
// though the interaction shape (near-fullscreen modal, drag-to-reschedule
// autosave, forced-CSS leave/holiday shading) is intentionally the same
// pattern, and code duplication with that file is expected/accepted.
//
// Unlike Sprint Planning's walk-forward auto-placement (ganttPlacement.ts),
// there's no hours/estimate field here to place a bar from - every bar's
// position comes directly from its AtlasPlanningEntry.startDate/endDate.
// An entry with no dates yet (both null) defaults to a 1-day bar on "today"
// (windowDates[0], since the rolling window always starts today) rather than
// being hidden or requiring a separate popover form first - dragging that
// default bar (this file's own drag-to-reschedule handling, the exact same
// mechanism as any other bar) IS the "obvious affordance to set its dates"
// the ticket asks for. It's additionally styled with a dashed border (the
// `entry-unset-` id prefix's CSS rule below) so it visually reads as
// "not really scheduled yet, drag me."

import { Gantt, WillowDark } from '@svar-ui/react-gantt'
import type { IApi, ITask } from '@svar-ui/react-gantt'
import '@svar-ui/react-gantt/all.css'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { localTodayISO, parseLocalDate } from '../utils/dateAgenda'
import { buildAtlasPlanningLeaveDays, type AtlasPlanningGanttLeaveDay } from '../utils/atlasPlanningGanttLeaveDays'
import { getId } from '../utils/getId'
import type { AtlasPlanningEntry, AtlasPlanningHoliday, AtlasPlanningLeaveMark, AtlasRosterMember } from '../types'

// Local copy of the addDays helper every Gantt-adjacent file in this
// codebase keeps its own version of (see SprintGanttChart.tsx's own header
// comment on this established "duplicated local date helper" convention)
// rather than importing one, including across this feature's own frontend/
// backend split (utils/rollingWindow.ts does the same).
function addDays(date: Date, days: number): Date {
  const next = new Date(date)
  next.setDate(next.getDate() + days)
  return next
}

const GANTT_GRID_WIDTH = 160

function memberId(m: AtlasRosterMember): string {
  return getId(m) ?? ''
}

// A ticket bar's task id is prefixed to say whether it has real dates yet
// (`entry-<id>`) or is sitting at its "no dates set" default position
// (`entry-unset-<id>`) - the CSS below targets the latter for the dashed/
// placeholder styling, and entryIdFromTaskId strips whichever prefix
// actually matched so the drag handler can recover the entry id either way.
const ENTRY_UNSET_PREFIX = 'entry-unset-'
const ENTRY_PREFIX = 'entry-'

function entryTaskId(entryId: string, isUnset: boolean): string {
  return isUnset ? `${ENTRY_UNSET_PREFIX}${entryId}` : `${ENTRY_PREFIX}${entryId}`
}

// Returns null for any non-entry task id (a hidden `person-<id>` summary row
// or a `leave-`-prefixed sibling day) - the drag handler below uses that to
// ignore drops on anything but a real ticket bar, without needing a separate
// per-prefix guard the way SprintGanttChart.tsx's handleInit has to (that
// file's ids aren't all "the thing being reschedulable or not" in one
// prefix scheme the way this one is).
function entryIdFromTaskId(taskId: string): string | null {
  if (taskId.startsWith(ENTRY_UNSET_PREFIX)) return taskId.slice(ENTRY_UNSET_PREFIX.length)
  if (taskId.startsWith(ENTRY_PREFIX)) return taskId.slice(ENTRY_PREFIX.length)
  return null
}

// One hidden parent "person-<rosterMemberId>" row per roster member - the
// same synthetic row-per-person tree SVAR's own resource-planning/task-
// grouping (PRO-gated) would otherwise provide, see SprintGanttChart.tsx's
// header comment - spanning the whole window so the row exists even for a
// member with no attached tickets, plus one child task per attached entry
// and one per leave/holiday day.
function buildTasks(
  roster: AtlasRosterMember[],
  entries: AtlasPlanningEntry[],
  leaveDays: AtlasPlanningGanttLeaveDay[],
  windowDates: string[],
): ITask[] {
  const tasks: ITask[] = []
  const windowStart = parseLocalDate(windowDates[0])
  const windowEnd = addDays(parseLocalDate(windowDates[windowDates.length - 1]), 1)
  // The rolling window always starts today (utils/rollingWindow.ts), so its
  // first date IS "today" - no separate localTodayISO() call needed (and
  // using windowDates[0] instead keeps this in lock-step with whatever
  // instant the caller computed the window from, rather than a second,
  // independently-evaluated "now").
  const todayISO = windowDates[0]

  for (const member of roster) {
    const id = memberId(member)
    tasks.push({ id: `person-${id}`, text: member.personId.name, parent: 0, open: true, start: windowStart, end: windowEnd })

    for (const entry of entries) {
      if (entry.rosterMemberId !== id) continue
      const entryId = getId(entry) ?? ''
      const isUnset = entry.startDate === null
      const startISO = entry.startDate ?? todayISO
      // A ticket with a start but no end yet (shouldn't normally happen once
      // dragged, but possible via a future direct-edit form) still renders
      // as a valid 1-day bar rather than being skipped.
      const endISO = entry.endDate ?? startISO
      tasks.push({
        id: entryTaskId(entryId, isUnset),
        text: entry.jiraKey,
        parent: `person-${id}`,
        // `end` is EXCLUSIVE (the day after the last day worked), matching
        // SVAR's own ITask.start/end convention - same as
        // ganttPlacement.ts's GanttBar.end - while AtlasPlanningEntry's own
        // endDate is stored INCLUSIVE (the last day worked), matching every
        // other single-date field in this feature (leave marks, holidays).
        start: parseLocalDate(startISO),
        end: addDays(parseLocalDate(endISO), 1),
      })
    }
  }

  for (const day of leaveDays) {
    const start = parseLocalDate(day.date)
    tasks.push({ id: day.key, text: day.label, parent: `person-${day.rosterMemberId}`, start, end: addDays(start, 1) })
  }

  return tasks
}

function AtlasPlanningGantt({
  roster,
  entries,
  leaveMarks,
  holidays,
  windowDates,
  onDragReschedule,
}: {
  roster: AtlasRosterMember[]
  entries: AtlasPlanningEntry[]
  leaveMarks: AtlasPlanningLeaveMark[]
  holidays: AtlasPlanningHoliday[]
  windowDates: string[]
  onDragReschedule: (entryId: string, startDate: string, endDate: string) => void
}) {
  // Fixed to exactly the rolling window's own span (no lead-in days - unlike
  // SprintGanttChart.tsx, there's no dependency-link connector here that
  // needs blank room to the left) - `autoScale={false}` below stops SVAR
  // from widening the axis for a bar whose (user-set) dates fall outside
  // this window.
  const axisRange = useMemo(
    () => ({ start: parseLocalDate(windowDates[0]), end: addDays(parseLocalDate(windowDates[windowDates.length - 1]), 1) }),
    [windowDates],
  )

  // Fills the modal's available width with the window's own fixed day count
  // instead of a constant per-day pixel width, so the chart never needs its
  // own horizontal scrollbar - same technique as SprintGanttChart.tsx's own
  // cellWidth sizing (ResizeObserver is unavailable in jsdom, hence the
  // guard; irrelevant there since this component's tests stub out the real
  // <Gantt>/canvas rendering).
  const chartWrapperRef = useRef<HTMLDivElement>(null)
  const [cellWidth, setCellWidth] = useState(32)
  useEffect(() => {
    const node = chartWrapperRef.current
    if (!node || typeof ResizeObserver === 'undefined') return
    const observer = new ResizeObserver((observerEntries) => {
      const width = observerEntries[0]?.contentRect.width
      if (!width) return
      const available = width - GANTT_GRID_WIDTH
      setCellWidth(Math.max(1, Math.floor(available / windowDates.length)))
    })
    observer.observe(node)
    return () => observer.disconnect()
  }, [windowDates.length])

  const tasks = useMemo(() => {
    const leaveDays = buildAtlasPlanningLeaveDays(roster, leaveMarks, holidays)
    return buildTasks(roster, entries, leaveDays, windowDates)
  }, [roster, entries, leaveMarks, holidays, windowDates])

  // Same ref-chasing pattern SprintGanttChart.tsx's own handleInit comment
  // explains in detail: SVAR's `init` prop only fires once (when the
  // underlying store is created), so a second drag needs to read whichever
  // `onDragReschedule` is current via a ref rather than closing over the
  // one from mount time.
  const onDragRescheduleRef = useRef(onDragReschedule)
  onDragRescheduleRef.current = onDragReschedule

  const handleInit = useCallback((api: IApi) => {
    // No click/drag affordance for leave/holiday days (mirrors
    // SprintGanttChart.tsx's own ticket-08 guard) - `drag-task` is
    // intercepted before the drag even starts, stronger than merely
    // ignoring the resulting `update-task` below.
    api.intercept('drag-task', (ev: { id: string | number }) => {
      if (String(ev.id).startsWith('leave-')) return false
    })

    // SVAR fires `update-task` on every intermediate drag frame
    // (`inProgress: true`) and once more on drop - only the drop autosaves
    // (no separate Save button/state, per this whole feature's "click/drag
    // -> persists immediately" convention). `entryIdFromTaskId` returning
    // null covers both the hidden `person-` summary rows (unreachable by
    // mouse anyway, visibility: hidden below) and any `leave-`-prefixed
    // task that somehow still reaches here.
    api.on('update-task', (ev: { id: string | number; inProgress?: boolean }) => {
      if (ev.inProgress) return
      const entryId = entryIdFromTaskId(String(ev.id))
      if (!entryId) return

      const task = api.getTask(ev.id)
      if (!task.start || !task.end) return

      const newStart = localTodayISO(task.start)
      // task.end is exclusive - convert back to this feature's own
      // inclusive endDate convention before persisting.
      const newEnd = localTodayISO(addDays(task.end, -1))
      onDragRescheduleRef.current(entryId, newStart, newEnd)
    })
  }, [])

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      {/* Hides each synthetic person-row's own summary bar - only its grid
          label should show. Leave/holiday shading reuses
          AtlasPlanningLeaveGrid.tsx's exact color vocabulary: full
          leave/holiday = red-400/500, half leave = amber-300/500. An unset
          ticket (no dates yet) gets a dashed border + reduced opacity so it
          visually reads as a placeholder to drag into place, not a real
          commitment. */}
      <style>{`
        .wx-bar[data-id^=":person-"] { visibility: hidden; }
        .wx-bar[data-id^=":leave-full-"] { background: #ef4444; border-color: #f87171; }
        .wx-bar[data-id^=":leave-half-"] { background: #f59e0b; border-color: #fcd34d; }
        .wx-bar[data-id^=":entry-unset-"] { border-style: dashed; opacity: 0.65; }
        .wx-chart { overflow-x: hidden !important; }
      `}</style>
      <div ref={chartWrapperRef} className="min-h-0 flex-1">
        <WillowDark>
          <Gantt
            tasks={tasks}
            columns={[{ id: 'text', header: 'Person', width: GANTT_GRID_WIDTH }]}
            start={axisRange.start}
            end={axisRange.end}
            autoScale={false}
            cellWidth={cellWidth}
            cellHeight={30}
            init={handleInit}
          />
        </WillowDark>
      </div>
    </div>
  )
}

// "Near-fullscreen modal" variant of docs/ui-conventions.md's Archetype B
// (`h-full w-full` card, same backdrop) - copied exactly from that doc's
// class strings, the same variant SprintGanttChart.tsx's own Gantt modal
// uses. Rendered via a portal to `document.body` (not in place) for the same
// reason as that file: a `dark:backdrop-blur-md` ancestor card establishes a
// containing block for `position: fixed` descendants, which without the
// portal would shrink this modal to that card's own bounds instead of the
// viewport.
function AtlasPlanningGanttModal({
  roster,
  entries,
  leaveMarks,
  holidays,
  windowDates,
  onClose,
  onDragReschedule,
}: {
  roster: AtlasRosterMember[]
  entries: AtlasPlanningEntry[]
  leaveMarks: AtlasPlanningLeaveMark[]
  holidays: AtlasPlanningHoliday[]
  windowDates: string[]
  onClose: () => void
  onDragReschedule: (entryId: string, startDate: string, endDate: string) => void
}) {
  return createPortal(
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/60 p-4">
      <div className="flex h-full w-full flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white p-6 text-slate-900 shadow-xl dark:border-white/10 dark:bg-[#160f24] dark:text-slate-100">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">Planning Gantt chart</h2>
          <button
            type="button"
            aria-label="Close"
            onClick={onClose}
            className="shrink-0 rounded-full px-2 py-0.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-white/10 dark:hover:text-slate-200"
          >
            ×
          </button>
        </div>
        <div className="flex min-h-0 flex-1 flex-col overflow-auto">
          {roster.length === 0 ? (
            <p className="text-sm text-slate-400 dark:text-slate-500">No one on the Atlas roster yet.</p>
          ) : (
            <AtlasPlanningGantt
              roster={roster}
              entries={entries}
              leaveMarks={leaveMarks}
              holidays={holidays}
              windowDates={windowDates}
              onDragReschedule={onDragReschedule}
            />
          )}
        </div>
      </div>
    </div>,
    document.body,
  )
}

// Sits in the Planning tab's own header/action row (AtlasPlanningView.tsx),
// owning its own open/close state - mirrors SprintGanttChart.tsx's
// GanttChartButton pairing rather than lifting the open flag into
// AtlasPlanningView, since nothing else needs to know whether this modal is
// open.
export function AtlasPlanningGanttButton({
  roster,
  entries,
  leaveMarks,
  holidays,
  windowDates,
  onDragReschedule,
}: {
  roster: AtlasRosterMember[]
  entries: AtlasPlanningEntry[]
  leaveMarks: AtlasPlanningLeaveMark[]
  holidays: AtlasPlanningHoliday[]
  windowDates: string[]
  // The drag-to-reschedule autosave's whole write path: this component only
  // ever computes *what* changed (the entry id plus its new inclusive
  // start/end dates), handing it to the caller (AtlasPlanningView, backed by
  // useAtlasPlanning's rescheduleTicket) to actually PATCH - same
  // separation as SprintGanttChart.tsx's own onDragReschedule prop.
  onDragReschedule: (entryId: string, startDate: string, endDate: string) => void
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
        <AtlasPlanningGanttModal
          roster={roster}
          entries={entries}
          leaveMarks={leaveMarks}
          holidays={holidays}
          windowDates={windowDates}
          onClose={() => setOpen(false)}
          onDragReschedule={onDragReschedule}
        />
      )}
    </>
  )
}
