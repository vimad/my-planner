// Todos tab's "Export" button (see TodosExportButton.tsx) - downloads the
// currently category-scoped todo list as a two-tab .xlsx workbook
// (In Progress / Completed), Description + Notes columns, mirroring the
// split between this file's pure data-building half (unit-tested) and the
// thin XLSX-writing wrapper (downloadTodosExcel, not unit-tested) that
// packages/frontend/src/utils/sprintExport.ts already established.
import { isTauri } from '@tauri-apps/api/core'
import { save } from '@tauri-apps/plugin-dialog'
import { writeFile } from '@tauri-apps/plugin-fs'
import * as XLSX from 'xlsx'
import { formatNotesForExport } from './todoNotesSegments'
import type { Todo } from '../types'

const SHEET_HEADER = ['Description', 'Notes']

// One sheet's worth of rows (header included), Description + Notes, in the
// same order `todos` was given - callers decide sort order (App.tsx passes
// the already category-scoped list in its normal newest-first order), this
// just doesn't re-sort it.
function buildTodoSheetRows(todos: Todo[]): (string | number)[][] {
  return [
    SHEET_HEADER,
    ...todos.map((todo) => [todo.title, formatNotesForExport(todo.body)]),
  ]
}

export interface TodosExportSheets {
  inProgress: (string | number)[][]
  completed: (string | number)[][]
}

// Splits `todos` into the two tabs - In Progress first since that's the
// list a reader opening the file actually wants to see, Completed as the
// secondary/history tab (same ordering as the Todos tab's own "Show
// completed" toggle, which hides completed by default).
export function buildTodosExportSheets(todos: Todo[]): TodosExportSheets {
  return {
    inProgress: buildTodoSheetRows(todos.filter((t) => !t.completed)),
    completed: buildTodoSheetRows(todos.filter((t) => t.completed)),
  }
}

// Sanitizes free text into a safe .xlsx file name - strips characters that
// are invalid in file names on at least one major OS, mirrors
// sanitizeSheetName's stripped character set in sprintExport.ts.
function sanitizeFileName(name: string): string {
  const cleaned = name.replace(/[[\]:*?/\\<>|"]/g, ' ').trim()
  return cleaned || 'Todos'
}

// The actual file-producing side effect - builds the workbook from
// buildTodosExportSheets's two AOAs and hands off to XLSX.writeFile
// (browser) or the Tauri save dialog + fs plugin (desktop shell, whose
// webview can't download blob: URLs - see sprintExport.ts's
// downloadSprintPlanExcel for the identical isTauri() branch this mirrors).
// Not unit-tested (would just be re-testing the `xlsx` library);
// buildTodosExportSheets above is where the actual data-shaping is covered.
export async function downloadTodosExcel(categoryName: string | null, todos: Todo[]): Promise<void> {
  const { inProgress, completed } = buildTodosExportSheets(todos)

  const workbook = XLSX.utils.book_new()
  const inProgressSheet = XLSX.utils.aoa_to_sheet(inProgress)
  const completedSheet = XLSX.utils.aoa_to_sheet(completed)
  inProgressSheet['!cols'] = [{ wch: 40 }, { wch: 70 }]
  completedSheet['!cols'] = [{ wch: 40 }, { wch: 70 }]
  XLSX.utils.book_append_sheet(workbook, inProgressSheet, 'In Progress')
  XLSX.utils.book_append_sheet(workbook, completedSheet, 'Completed')

  const fileName = `${sanitizeFileName(`${categoryName ?? 'All todos'} todos`)}.xlsx`

  if (isTauri()) {
    const filePath = await save({ defaultPath: fileName, filters: [{ name: 'Excel Workbook', extensions: ['xlsx'] }] })
    if (!filePath) return
    const bytes = XLSX.write(workbook, { bookType: 'xlsx', type: 'array' }) as ArrayBuffer
    await writeFile(filePath, new Uint8Array(bytes))
    return
  }

  XLSX.writeFile(workbook, fileName)
}
