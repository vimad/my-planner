// Atlas Planning tab's "Export" button (AtlasPlanningExportButton.tsx,
// slotted into AtlasPlanningView.tsx's header row) - downloads a snapshot of
// the current plan (each roster member's attached ticket keys, plus their
// leave-day count/dates within the current rolling window) as a single-sheet
// .xlsx file. Split into a pure data-building half (this file's exported
// functions, unit-tested) and a thin XLSX-writing wrapper
// (downloadAtlasPlanningExcel) that isn't - it just hands the built AOA to
// the `xlsx` package - mirroring utils/sprintExport.ts's own split exactly
// (spec.md's "Export" decision). Deliberately its own file/own functions,
// not shared with sprintExport.ts/todosExport.ts (module-boundary decision:
// code duplication here is expected and accepted) - only the `xlsx` package
// itself and the `isTauri()` desktop-save-dialog branch are reused, as
// third-party/cross-cutting platform infrastructure rather than app-specific
// export logic.
import { isTauri } from '@tauri-apps/api/core'
import { save } from '@tauri-apps/plugin-dialog'
import { writeFile } from '@tauri-apps/plugin-fs'
import * as XLSX from 'xlsx'
import { getId } from './getId'
import type { AtlasPlanningEntry, AtlasPlanningLeaveMark, AtlasPlanningLeavePortion, AtlasRosterMember } from '../types'

export interface AtlasPlanningExportRow {
  name: string
  // Every ticket key this person currently has attached, comma-joined - same
  // multi-value-cell convention sprintExport.ts's ticketSummary column uses
  // for "this person's list of tickets" (no per-project prefix stripped
  // here, unlike sprintExport: Atlas isn't scoped to one team's own Jira
  // project, so the full key is the only unambiguous form).
  ticketKeys: string
  // Full day = 1, half day = 0.5, summed - so two half-day marks read as "1"
  // rather than "2", matching how a person would actually describe their own
  // leave.
  leaveDayCount: number
  // "YYYY-MM-DD (full)" per mark, comma-joined - same shape as ticketKeys,
  // giving a reader both the count and the specific dates without needing a
  // second sheet.
  leaveDates: string
}

const LEAVE_PORTION_VALUE: Record<AtlasPlanningLeavePortion, number> = { full: 1, half: 0.5 }

// One row per roster member, in roster order - mirrors AtlasPlanningView's
// own roster.map(...) row order, so the export reads as the same list the
// screen shows.
export function buildAtlasPlanningExportRows(
  roster: AtlasRosterMember[],
  entries: AtlasPlanningEntry[],
  leaveMarks: AtlasPlanningLeaveMark[],
): AtlasPlanningExportRow[] {
  return roster.map((member) => {
    const memberId = getId(member) ?? ''
    const memberEntries = entries.filter((e) => e.rosterMemberId === memberId)
    const memberLeave = leaveMarks.filter((m) => m.rosterMemberId === memberId)

    return {
      name: member.personId.name,
      ticketKeys: memberEntries.map((e) => e.jiraKey).join(', '),
      leaveDayCount: memberLeave.reduce((total, m) => total + LEAVE_PORTION_VALUE[m.portion], 0),
      leaveDates: memberLeave.map((m) => `${m.date} (${m.portion})`).join(', '),
    }
  })
}

// Assembles the full export as a sheet-ready array-of-arrays (one entry per
// output row, each a fixed-width array of cell values) - kept pure/testable,
// separate from the actual XLSX-writing side effect below. `windowDates` (if
// non-empty) only labels the sheet with the window's start/end date for
// context - callers don't have to pass it for the row data itself to be
// correct, since `leaveMarks` is always already scoped to the current window
// by the backend (read-time reconciliation, see useAtlasPlanningLeave.ts).
export function buildAtlasPlanningExportSheetData(
  roster: AtlasRosterMember[],
  entries: AtlasPlanningEntry[],
  leaveMarks: AtlasPlanningLeaveMark[],
  windowDates: string[] = [],
): (string | number)[][] {
  const rows = buildAtlasPlanningExportRows(roster, entries, leaveMarks)

  const sheet: (string | number)[][] = []
  if (windowDates.length > 0) {
    sheet.push([`Window: ${windowDates[0]} to ${windowDates[windowDates.length - 1]}`])
    sheet.push([])
  }
  sheet.push(['Person', 'Attached tickets', 'Leave days', 'Leave dates'])
  sheet.push(...rows.map((r) => [r.name, r.ticketKeys, r.leaveDayCount, r.leaveDates]))

  return sheet
}

// The actual file-producing side effect - builds the workbook from
// buildAtlasPlanningExportSheetData's AOA and hands off to XLSX.writeFile,
// which triggers the browser's normal download flow. Not unit-tested (would
// just be re-testing the `xlsx` library); buildAtlasPlanningExportSheetData
// above is where the actual formatting/aggregation logic lives and is
// covered.
//
// The desktop app's webview can't download blob: URLs via <a download>
// (silently does nothing there), so in the desktop shell this routes through
// the Tauri save dialog + fs plugin instead - identical isTauri() branch to
// utils/sprintExport.ts's downloadSprintPlanExcel.
export async function downloadAtlasPlanningExcel(
  roster: AtlasRosterMember[],
  entries: AtlasPlanningEntry[],
  leaveMarks: AtlasPlanningLeaveMark[],
  windowDates: string[] = [],
): Promise<void> {
  const data = buildAtlasPlanningExportSheetData(roster, entries, leaveMarks, windowDates)
  const worksheet = XLSX.utils.aoa_to_sheet(data)
  worksheet['!cols'] = [{ wch: 18 }, { wch: 40 }, { wch: 10 }, { wch: 40 }]
  const workbook = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(workbook, worksheet, 'Planning')
  const fileName = 'Atlas Planning.xlsx'

  if (isTauri()) {
    const filePath = await save({ defaultPath: fileName, filters: [{ name: 'Excel Workbook', extensions: ['xlsx'] }] })
    if (!filePath) return
    const bytes = XLSX.write(workbook, { bookType: 'xlsx', type: 'array' }) as ArrayBuffer
    await writeFile(filePath, new Uint8Array(bytes))
    return
  }

  XLSX.writeFile(workbook, fileName)
}
