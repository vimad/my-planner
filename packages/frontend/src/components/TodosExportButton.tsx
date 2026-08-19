// Agenda card's "Export" button (sits in the sort/show-completed row, see
// App.tsx) - downloads the currently category-filtered todo list as a
// two-tab .xlsx workbook via utils/todosExport.ts. Disabled when there's
// nothing to export, same guard style as SprintExportButton.tsx.
import { downloadTodosExcel } from '../utils/todosExport'
import type { Todo } from '../types'

export function TodosExportButton({ categoryName, todos }: { categoryName: string | null; todos: Todo[] }) {
  const disabled = todos.length === 0

  return (
    <button
      type="button"
      disabled={disabled}
      onClick={() => void downloadTodosExcel(categoryName, todos)}
      title={
        disabled
          ? 'No todos to export.'
          : categoryName
            ? `Export "${categoryName}" todos to Excel`
            : 'Export all todos to Excel'
      }
      className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-transparent dark:border-white/10 dark:text-slate-300 dark:hover:bg-white/5"
    >
      Export
    </button>
  )
}
