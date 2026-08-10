import { getBoardConfiguration, resolveBoard } from './jiraClient.ts'
import { Status } from '../models/Status.ts'

// Phase 1 targets one Jira project/board for every team (see spec's "Jira
// instance") — matches routes/sprints.ts and the recorded board id (235) in
// README.md.
const PROJECT_KEY = 'WOSMVP'
const BOARD_NAME = 'Odyssey'

// The board-configuration endpoint's columns only carry a name and a list
// of status ids — no status-category classification — so category is
// inferred from a column's position among the others: first column is
// 'todo', last is 'done', everything between is 'in_progress'. This mirrors
// Jira's own default column categorization and is a reasonable phase-1
// approximation.
function categoryForColumnIndex(index: number, columnCount: number): 'todo' | 'in_progress' | 'done' {
  if (index === 0) return 'todo'
  if (index === columnCount - 1) return 'done'
  return 'in_progress'
}

// Refreshes the locally-mirrored Status set wholesale from the Jira board's
// workflow column configuration — called as a side effect of every sync
// action (both Planning's Full sync and the Status view's Lightweight
// sync), never a dedicated endpoint/button (spec's "Sync semantics &
// staleness"). "Wholesale" means a full replace: columns no longer on the
// board are removed, not just left stale.
export async function refreshStatusSet(): Promise<void> {
  const board = await resolveBoard(PROJECT_KEY, BOARD_NAME)
  if (!board) return

  const config = await getBoardConfiguration(board.id)
  const columns = config.columnConfig.columns
  const syncedAt = new Date()

  await Promise.all(
    columns.map((column, index) =>
      Status.findOneAndUpdate(
        { name: column.name },
        {
          name: column.name,
          order: index,
          category: categoryForColumnIndex(index, columns.length),
          lastSyncedAt: syncedAt,
        },
        { upsert: true },
      ),
    ),
  )

  await Status.deleteMany({ name: { $nin: columns.map((column) => column.name) } })
}
