import { Calendar } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { jiraIssueUrl } from '../constants/jira'
import { useAtlasPlanning } from '../hooks/useAtlasPlanning'
import { useAtlasPlanningHolidays } from '../hooks/useAtlasPlanningHolidays'
import { useAtlasPlanningLeave } from '../hooks/useAtlasPlanningLeave'
import { useAtlasRoster } from '../hooks/useAtlasRoster'
import type { AtlasPlanningEntry } from '../types'
import { getId } from '../utils/getId'
import { computeRollingWindowDates } from '../utils/rollingWindow'
import { AtlasPlanningExportButton } from './AtlasPlanningExportButton'
import { AtlasPlanningLeaveGrid } from './AtlasPlanningLeaveGrid'
import { AtlasPlanningHolidayChips } from './AtlasPlanningHolidayChips'
import { AtlasPlanningGanttButton } from './AtlasPlanningGanttChart'

// Atlas Planning tab (.scratch/atlas-planning-tab) - a people-wise table of
// plain Jira-key badges, entirely separate from Sprint Planning's own
// people-wise view (PlanningView.tsx/useSprintPlan.ts) and from Atlas's
// epic/task stack (useAtlasEpics.ts): no imports from either, by design (spec
// "Module boundary"). Code duplication with PlanningView's badge shapes is
// expected and accepted - only the visual language is copied, not the
// components themselves. The one exception is Atlas's own roster
// (useAtlasRoster.ts), reused as-is since it's shared Atlas infrastructure,
// not part of either module this feature avoids.
//
// Entries themselves are fully board-derived now: which tickets show up and
// whose row they're on is written entirely by the backend's
// reconcilePlanningEntries (services/atlasPlanningSync.ts), triggered by
// every Board/Summary sync plus this tab's own one-time initial load
// (useAtlasPlanning.ts). There is no attach/reassign/remove control here
// anymore - the only thing a person still edits by hand on this screen is a
// ticket's start/end date.

// Same "click outside closes it" pattern AtlasPeopleButton.tsx/
// TeamSwitcher.tsx/ProfileSwitcher.tsx each already duplicate locally rather
// than sharing a hook - kept consistent with that convention here too.
function useOutsideClick(onOutside: () => void) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    function handle(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) onOutside()
    }
    document.addEventListener('mousedown', handle)
    return () => document.removeEventListener('mousedown', handle)
  }, [onOutside])
  return ref
}

// Small anchored popover (Archetype A, docs/ui-conventions.md) for setting a
// ticket's start/end date from the badge itself, without opening the Gantt
// modal - spec.md's Table UI decision calls for "a small calendar affordance
// to set/edit its start/end date" directly on the badge.
function DateEditPopover({
  entry,
  onSave,
  saving,
}: {
  entry: AtlasPlanningEntry
  onSave: (startDate: string, endDate: string) => void
  saving?: boolean
}) {
  const [open, setOpen] = useState(false)
  const [startDate, setStartDate] = useState(entry.startDate ?? '')
  const [endDate, setEndDate] = useState(entry.endDate ?? '')
  const ref = useOutsideClick(() => setOpen(false))

  function handleOpen() {
    setStartDate(entry.startDate ?? '')
    setEndDate(entry.endDate ?? '')
    setOpen(true)
  }

  function handleSave() {
    if (!startDate || !endDate) return
    onSave(startDate, endDate)
    setOpen(false)
  }

  return (
    <span ref={ref} className="relative inline-flex">
      <button
        type="button"
        onClick={() => (open ? setOpen(false) : handleOpen())}
        disabled={saving}
        aria-label={`Set dates for ${entry.jiraKey}`}
        aria-expanded={open}
        title="Set start/end date"
        className="text-slate-400 hover:text-slate-700 disabled:cursor-not-allowed disabled:opacity-50 dark:hover:text-slate-100"
      >
        <Calendar size={11} />
      </button>
      {open && (
        <div className="absolute left-0 top-full z-10 mt-1 flex min-w-40 flex-col gap-1.5 rounded-lg border border-slate-200 bg-white p-2 shadow-lg dark:border-white/10 dark:bg-[#1a1229]">
          <label className="flex flex-col gap-0.5 text-[10px] font-normal normal-case text-slate-500 dark:text-slate-400">
            Start
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              aria-label={`Start date for ${entry.jiraKey}`}
              className="rounded border border-slate-200 bg-slate-50 px-1.5 py-1 text-xs text-slate-900 focus:border-fuchsia-400/60 focus:outline-none dark:border-white/10 dark:bg-white/5 dark:text-slate-100"
            />
          </label>
          <label className="flex flex-col gap-0.5 text-[10px] font-normal normal-case text-slate-500 dark:text-slate-400">
            End
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              aria-label={`End date for ${entry.jiraKey}`}
              className="rounded border border-slate-200 bg-slate-50 px-1.5 py-1 text-xs text-slate-900 focus:border-fuchsia-400/60 focus:outline-none dark:border-white/10 dark:bg-white/5 dark:text-slate-100"
            />
          </label>
          <button
            type="button"
            onClick={handleSave}
            disabled={saving || !startDate || !endDate}
            className="mt-0.5 rounded-lg bg-gradient-to-r from-violet-500 to-fuchsia-500 px-2 py-1 text-[11px] font-semibold text-white hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Save
          </button>
        </div>
      )}
    </span>
  )
}

// A plain, neutral slate badge - key text (also the Jira link) + the date
// popover. Deliberately not the violet "Placeholder" color (reserved for
// Sprint Planning's non-Jira stand-ins) and not an issue-type color family
// (no type data exists here to justify one) - same neutral `slate` classes
// docs/ui-conventions.md reserves for Tags ("neutral bg-slate-100
// dark:bg-white/10, no color-coding").
function PlanningTicketBadge({
  entry,
  onReschedule,
  rescheduling,
}: {
  entry: AtlasPlanningEntry
  onReschedule: (startDate: string, endDate: string) => void
  rescheduling?: boolean
}) {
  return (
    <span className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-600 dark:border-white/10 dark:bg-white/10 dark:text-slate-300">
      <a
        href={jiraIssueUrl(entry.jiraKey)}
        target="_blank"
        rel="noopener noreferrer"
        className="font-mono hover:underline"
      >
        {entry.jiraKey}
      </a>
      <DateEditPopover entry={entry} onSave={onReschedule} saving={rescheduling} />
    </span>
  )
}

// Ticket 01's whole Planning tab body: Archetype D table, one row per roster
// member in roster order. Composes useAtlasRoster.ts (Atlas's shared roster
// hook - the one reuse this module is allowed) with this module's own
// useAtlasPlanning.ts, so neither Board/Summary's data (useAtlasEpics.ts) nor
// the roster fetch itself is shared/blocking across tabs.
//
// Ticket 02 (.scratch/atlas-planning-tab) slots the leave grid and holiday
// chip row into this same tab body, below the ticket table. `windowDates` is
// computed exactly once per render via utils/rollingWindow.ts and passed
// down to both, so the grid and chip row can never disagree about "today"
// within a single render pass (two separate calls a few ms apart could
// theoretically straddle a midnight rollover) - the same single-source-of-
// truth posture the spec asks the later Gantt chart (ticket 03) to follow
// too.
export function AtlasPlanningView() {
  const { roster, loading: rosterLoading, error: rosterError } = useAtlasRoster()
  const { entries, loading: entriesLoading, error: entriesError, rescheduleError, rescheduleTicket } = useAtlasPlanning()
  const {
    leaveMarks,
    loading: leaveLoading,
    error: leaveError,
    cycling,
    cycleError,
    cycleLeave,
  } = useAtlasPlanningLeave()
  const {
    holidays,
    loading: holidaysLoading,
    error: holidaysError,
    toggling,
    toggleError,
    toggleHoliday,
  } = useAtlasPlanningHolidays()
  const windowDates = useMemo(() => computeRollingWindowDates(), [])

  // Ticket 03's (.scratch/atlas-planning-tab) Gantt drag-to-reschedule
  // autosave - the modal only ever computes *what* changed (entry id + new
  // dates); this is the one place that actually issues the PATCH. Fire-and-
  // forget from the Gantt's own perspective (its onDragReschedule prop isn't
  // async) - any failure surfaces via rescheduleError, same as the badge's
  // own popover.
  function handleReschedule(entryId: string, startDate: string, endDate: string) {
    rescheduleTicket(entryId, startDate, endDate).catch(() => {
      // rescheduleError already surfaces the failure.
    })
  }

  const loading = rosterLoading || entriesLoading

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-end gap-2">
        {!rosterLoading && !entriesLoading && (
          <AtlasPlanningGanttButton
            roster={roster}
            entries={entries}
            leaveMarks={leaveMarks}
            holidays={holidays}
            windowDates={windowDates}
            onDragReschedule={handleReschedule}
          />
        )}
        {!rosterLoading && !entriesLoading && !leaveLoading && (
          <AtlasPlanningExportButton roster={roster} entries={entries} leaveMarks={leaveMarks} windowDates={windowDates} />
        )}
      </div>

      {rosterError && <p className="text-sm text-red-600 dark:text-red-400">Error: {rosterError}</p>}
      {entriesError && <p className="text-sm text-red-600 dark:text-red-400">Error: {entriesError}</p>}
      {rescheduleError && <p className="text-sm text-red-600 dark:text-red-400">Error: {rescheduleError}</p>}
      {leaveError && <p className="text-sm text-red-600 dark:text-red-400">Error: {leaveError}</p>}
      {holidaysError && <p className="text-sm text-red-600 dark:text-red-400">Error: {holidaysError}</p>}

      {loading && <p className="text-sm text-slate-400 dark:text-slate-500">Loading planning…</p>}

      {!loading && (
        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-white/10 dark:bg-white/5 dark:shadow-none dark:backdrop-blur-md">
          {roster.length === 0 ? (
            <p className="text-sm text-slate-400 dark:text-slate-500">
              No one on the Atlas roster yet — add people from the roster panel above to start planning.
            </p>
          ) : (
            <div role="group" aria-label="People and their tickets" className="flex flex-col">
              {roster.map((member) => {
                const id = getId(member) ?? ''
                const memberEntries = entries.filter((e) => e.rosterMemberId === id)
                return (
                  <div
                    key={id}
                    aria-label={`Tickets for ${member.personId.name}`}
                    className="grid grid-cols-[10rem_1fr] items-start gap-3 border-b border-slate-100 py-2.5 last:border-0 dark:border-white/5"
                  >
                    <span className="pt-0.5 text-sm font-medium text-slate-800 dark:text-slate-100">{member.personId.name}</span>
                    <div className="flex flex-wrap gap-1.5">
                      {memberEntries.length === 0 ? (
                        <span className="pt-0.5 text-xs text-slate-400 dark:text-slate-500">No tickets</span>
                      ) : (
                        memberEntries.map((entry) => {
                          const entryId = getId(entry) ?? ''
                          return (
                            <PlanningTicketBadge
                              key={entryId}
                              entry={entry}
                              onReschedule={(startDate, endDate) => handleReschedule(entryId, startDate, endDate)}
                            />
                          )
                        })
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}

      {!rosterLoading && !leaveLoading && (
        <AtlasPlanningLeaveGrid
          roster={roster}
          windowDates={windowDates}
          leaveMarks={leaveMarks}
          cycling={cycling}
          cycleError={cycleError}
          onCycle={cycleLeave}
        />
      )}

      {!rosterLoading && !holidaysLoading && (
        <AtlasPlanningHolidayChips
          roster={roster}
          windowDates={windowDates}
          holidays={holidays}
          toggling={toggling}
          toggleError={toggleError}
          onToggle={toggleHoliday}
        />
      )}
    </div>
  )
}
