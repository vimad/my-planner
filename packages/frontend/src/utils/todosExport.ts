// Todos tab's "Export" button (see TodosExportButton.tsx) - downloads the
// currently category-scoped todo list as a two-tab .xlsx workbook
// (In Progress / Completed), Description + Notes columns, mirroring the
// split between this file's pure data-building half (unit-tested) and the
// thin XLSX-writing wrapper (downloadTodosExcel, not unit-tested) that
// packages/frontend/src/utils/sprintExport.ts already established.
//
// Uses `exceljs` rather than this app's usual `xlsx` package specifically
// for the Notes column: a todo's notes are exported as several
// newline-joined lines in one cell (see formatNotesForExport), and Excel
// only renders those as visually separate lines when the cell's alignment
// has wrapText set. The `xlsx` package's free tier silently drops cell
// style writes (verified: setting `.s` on a cell produces no <alignment>
// in the written styles.xml), so it can't express that; `exceljs` writes
// real cell styles and is used here for that reason alone.
import { isTauri } from '@tauri-apps/api/core'
import { save } from '@tauri-apps/plugin-dialog'
import { writeFile } from '@tauri-apps/plugin-fs'
import ExcelJS from 'exceljs'
import { formatNotesForExport } from './todoNotesSegments'
import type { Todo, TodoPriority } from '../types'

export interface TodoExportRow {
  description: string
  notes: string
}

// High-to-low rank for the priority sort below - unset priority is treated
// as Medium, matching the backend's own default (see Todo model).
const PRIORITY_RANK: Record<TodoPriority, number> = { High: 0, Medium: 1, Low: 2 }

// High priority first, same as the Todos tab's own "Sort by priority"
// checkbox (AgendaGroups.tsx) - Array.prototype.sort is a stable sort, so
// todos sharing a priority keep `todos`' own relative order (App.tsx's
// normal newest-first order) rather than being further reshuffled.
function sortByPriority(todos: Todo[]): Todo[] {
  return [...todos].sort(
    (a, b) => PRIORITY_RANK[a.priority ?? 'Medium'] - PRIORITY_RANK[b.priority ?? 'Medium'],
  )
}

// One sheet's worth of rows, Description + Notes, high-priority todos
// first - callers decide the rest of the sort order (App.tsx passes the
// already category-scoped list in its normal newest-first order), this
// only reshuffles by priority on top of that.
function buildTodoRows(todos: Todo[]): TodoExportRow[] {
  return sortByPriority(todos).map((todo) => ({ description: todo.title, notes: formatNotesForExport(todo.body) }))
}

export interface TodosExportSheets {
  inProgress: TodoExportRow[]
  completed: TodoExportRow[]
}

// Splits `todos` into the two tabs - In Progress first since that's the
// list a reader opening the file actually wants to see, Completed as the
// secondary/history tab (same ordering as the Todos tab's own "Show
// completed" toggle, which hides completed by default).
export function buildTodosExportSheets(todos: Todo[]): TodosExportSheets {
  return {
    inProgress: buildTodoRows(todos.filter((t) => !t.completed)),
    completed: buildTodoRows(todos.filter((t) => t.completed)),
  }
}

// Sanitizes free text into a safe .xlsx file name - strips characters that
// are invalid in file names on at least one major OS, mirrors
// sanitizeSheetName's stripped character set in sprintExport.ts.
function sanitizeFileName(name: string): string {
  const cleaned = name.replace(/[[\]:*?/\\<>|"]/g, ' ').trim()
  return cleaned || 'Todos'
}

// Notes column's style: wraps within the cell (so the newline-joined,
// per-date lines formatNotesForExport produces actually render as separate
// visible lines instead of one long run-on line) and top-aligns rather than
// Excel's default vertical-center, which looks odd once a cell spans
// several wrapped lines. Applied via `worksheet.columns[].style`, which
// exceljs applies to every cell added to that column afterwards.
const NOTES_COLUMN_STYLE: Partial<ExcelJS.Style> = { alignment: { wrapText: true, vertical: 'top' } }

function addTodoSheet(workbook: ExcelJS.Workbook, name: string, rows: TodoExportRow[]): void {
  const sheet = workbook.addWorksheet(name)
  sheet.columns = [
    { header: 'Description', key: 'description', width: 40 },
    { header: 'Notes', key: 'notes', width: 70, style: NOTES_COLUMN_STYLE },
  ]
  sheet.addRows(rows)
}

// The actual file-producing side effect - builds the workbook from
// buildTodosExportSheets's two row lists and hands off to a manual Blob
// download (browser) or the Tauri save dialog + fs plugin (desktop shell,
// whose webview can't download blob: URLs - see sprintExport.ts's
// downloadSprintPlanExcel for the identical isTauri() branch this mirrors;
// exceljs has no `xlsx.writeFile`-style browser helper of its own, unlike
// the `xlsx` package, so the browser branch below builds the download
// manually). Not unit-tested (would just be re-testing the `exceljs`
// library); buildTodosExportSheets above is where the actual data-shaping
// is covered.
export async function downloadTodosExcel(categoryName: string | null, todos: Todo[]): Promise<void> {
  const { inProgress, completed } = buildTodosExportSheets(todos)

  const workbook = new ExcelJS.Workbook()
  addTodoSheet(workbook, 'In Progress', inProgress)
  addTodoSheet(workbook, 'Completed', completed)

  const fileName = `${sanitizeFileName(`${categoryName ?? 'All todos'} todos`)}.xlsx`
  const buffer = await workbook.xlsx.writeBuffer()

  if (isTauri()) {
    const filePath = await save({ defaultPath: fileName, filters: [{ name: 'Excel Workbook', extensions: ['xlsx'] }] })
    if (!filePath) return
    await writeFile(filePath, new Uint8Array(buffer))
    return
  }

  const blob = new Blob([buffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = fileName
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  URL.revokeObjectURL(url)
}
