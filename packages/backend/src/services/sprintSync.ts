import { listSprints, resolveBoard } from './jiraClient.ts'
import { Sprint, type SprintDoc } from '../models/Sprint.ts'

// Phase 1 targets one Jira project/board for every team — matches
// routes/sprints.ts and the recorded board id (235) in README.md.
const PROJECT_KEY = 'WOSMVP'
const BOARD_NAME = 'Odyssey'

// A board typically starts a new sprint every 1-2 weeks, so the cached
// Sprint set only needs to be refreshed occasionally, not on every page
// load — this TTL is what makes getSprints() fast on the common path
// (previously a live Jira round trip on every single GET /api/sprints).
const CACHE_TTL_MS = 10 * 60 * 1000

async function syncFromJira(boardId: number): Promise<void> {
  const jiraSprints = await listSprints(boardId, ['active', 'future', 'closed'])
  const syncedAt = new Date()

  await Promise.all(
    jiraSprints.map((sprint) =>
      Sprint.findOneAndUpdate(
        { jiraSprintId: String(sprint.id) },
        {
          jiraSprintId: String(sprint.id),
          name: sprint.name,
          state: sprint.state,
          startDate: sprint.startDate ? new Date(sprint.startDate) : null,
          endDate: sprint.endDate ? new Date(sprint.endDate) : null,
          lastSyncedAt: syncedAt,
        },
        { upsert: true },
      ),
    ),
  )
}

// Cache-first sprint list: serves the locally-mirrored Sprint set, only
// making a live Jira call when that cache is empty or older than
// CACHE_TTL_MS. Unlike services/statusSync.ts's refreshStatusSet, this never
// deletes cached sprints that Jira stops returning — a team's
// SprintPlanEntry/TeamSprintPlan can reference a closed sprint indefinitely,
// so pruning here would risk orphaning that history over a rare Jira-side
// sprint deletion, not just a routine board reconfig.
//
// Returns null only when the cache is cold (nothing to serve yet) and the
// board itself can't be resolved. A warm cache is always served even if a
// refresh attempt fails (e.g. Jira briefly unreachable), so a transient
// hiccup never breaks an already-working sprint list.
export async function getSprints(): Promise<SprintDoc[] | null> {
  const freshest = await Sprint.findOne().sort({ lastSyncedAt: -1 })
  const isStale = !freshest || Date.now() - freshest.lastSyncedAt.getTime() > CACHE_TTL_MS

  if (isStale) {
    const board = await resolveBoard(PROJECT_KEY, BOARD_NAME)
    if (board) {
      await syncFromJira(board.id)
    } else if (!freshest) {
      return null
    }
  }

  return Sprint.find().sort({ startDate: -1 })
}
