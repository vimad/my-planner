import { getSprint, listSprints, resolveBoard, type JiraSprint } from './jiraClient.ts'
import { Sprint, type SprintDoc } from '../models/Sprint.ts'

// Phase 1 targets one Jira project/board for every team — matches
// routes/sprints.ts and the recorded board id (235) in README.md.
const PROJECT_KEY = 'WOSMVP'
const BOARD_NAME = 'Odyssey'

// Sprints planned ahead of the current one live on a different board than
// Odyssey (confirmed live: Odyssey doesn't carry them yet) — searchJiraSprints
// targets this board instead so a future sprint (e.g. the one after the
// current active one) can actually be found and imported.
export const FUTURE_SPRINTS_BOARD_NAME = 'Product Delivery Board'

// A board typically starts a new sprint every 1-2 weeks, so the cached
// Sprint set only needs to be refreshed occasionally, not on every page
// load — this TTL is what makes getSprints() fast on the common path
// (previously a live Jira round trip on every single GET /api/sprints).
const CACHE_TTL_MS = 10 * 60 * 1000

// Shared field-mapping for both the board-wide sync below and importSprint's
// single-sprint import — the unique index on jiraSprintId (models/Sprint.ts)
// plus upsert:true is what makes both genuinely idempotent, never creating
// a second doc for the same Jira sprint no matter how many times it's called.
function upsertSprint(sprint: JiraSprint, syncedAt: Date): Promise<SprintDoc> {
  return Sprint.findOneAndUpdate(
    { jiraSprintId: String(sprint.id) },
    {
      jiraSprintId: String(sprint.id),
      name: sprint.name,
      state: sprint.state,
      startDate: sprint.startDate ? new Date(sprint.startDate) : null,
      endDate: sprint.endDate ? new Date(sprint.endDate) : null,
      lastSyncedAt: syncedAt,
    },
    { upsert: true, returnDocument: 'after' },
  )
}

async function syncFromJira(boardId: number): Promise<void> {
  const jiraSprints = await listSprints(boardId, ['active', 'future', 'closed'])
  const syncedAt = new Date()

  await Promise.all(jiraSprints.map((sprint) => upsertSprint(sprint, syncedAt)))
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

// Live Jira search (never the cache) — lets a user find a sprint Jira
// already knows about (e.g. a future sprint the 10-minute TTL hasn't picked
// up yet) without waiting for or forcing a full cache refresh. Jira's Agile
// API has no server-side "search sprints by name", so this lists every
// sprint on the board and filters client-side; a blank query returns the
// board's full sprint list as-is. Returns null when the board itself can't
// be resolved (mirrors getSprints' null convention).
export async function searchJiraSprints(query: string): Promise<JiraSprint[] | null> {
  const board = await resolveBoard(PROJECT_KEY, FUTURE_SPRINTS_BOARD_NAME)
  if (!board) return null

  const jiraSprints = await listSprints(board.id, ['active', 'future', 'closed'])
  const trimmed = query.trim().toLowerCase()
  return trimmed ? jiraSprints.filter((sprint) => sprint.name.toLowerCase().includes(trimmed)) : jiraSprints
}

// Fetches one sprint fresh from Jira by its numeric id and upserts it into
// the cache via the same idempotent upsertSprint path syncFromJira uses —
// calling this repeatedly for the same id never creates more than one
// Sprint doc (models/Sprint.ts's unique index on jiraSprintId + upsert:true).
export async function importSprint(jiraSprintId: number): Promise<SprintDoc> {
  const sprint = await getSprint(jiraSprintId)
  return upsertSprint(sprint, new Date())
}
