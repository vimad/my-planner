// Atlas Planning tab's "Export" button (slotted into AtlasPlanningView.tsx's
// header row, alongside the attach form) - downloads the current plan (each
// roster member's attached ticket keys and leave-day count/dates within the
// current rolling window) as a single-sheet .xlsx file. All the actual
// data-shaping lives in utils/atlasPlanningExport.ts; this component only
// owns the click handler and the disabled/nothing-to-export guard.
// Deliberately its own file/component - not shared with
// SprintExportButton.tsx/TodosExportButton.tsx (module-boundary decision) -
// even though the outline-button class string below is copied verbatim from
// both (docs/ui-conventions.md's secondary/outline button convention).
import { downloadAtlasPlanningExcel } from '../utils/atlasPlanningExport'
import type { AtlasPlanningEntry, AtlasPlanningLeaveMark, AtlasRosterMember } from '../types'

export function AtlasPlanningExportButton({
  roster,
  entries,
  leaveMarks,
  windowDates,
}: {
  roster: AtlasRosterMember[]
  entries: AtlasPlanningEntry[]
  leaveMarks: AtlasPlanningLeaveMark[]
  windowDates: string[]
}) {
  const rosterEmpty = roster.length === 0
  // Nothing to export once the roster exists but no one has a ticket
  // attached or a leave mark set - an all-empty sheet isn't worth producing
  // (spec story 26).
  const nothingToExport = !rosterEmpty && entries.length === 0 && leaveMarks.length === 0
  const disabled = rosterEmpty || nothingToExport

  const title = rosterEmpty
    ? 'No one on the Atlas roster yet.'
    : nothingToExport
      ? 'Attach a ticket or mark leave before exporting.'
      : 'Export the Planning tab to Excel'

  return (
    <button
      type="button"
      disabled={disabled}
      onClick={() => void downloadAtlasPlanningExcel(roster, entries, leaveMarks, windowDates)}
      title={title}
      className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm font-semibold text-slate-600 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-transparent dark:border-white/10 dark:text-slate-300 dark:hover:bg-white/5"
    >
      Export
    </button>
  )
}
