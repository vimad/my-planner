import mongoose, { Schema } from 'mongoose'
import type { JiraSprintState } from '../services/jiraClient.ts'

// One doc per Jira board: the full (unfiltered) sprint list returned by
// jiraClient.ts's listSprints the first time that board was searched, so
// services/sprintSync.ts's searchJiraSprints can serve every subsequent
// per-keystroke search from Mongo instead of re-running a full paginated
// board scan (up to MAX_SPRINT_PAGES requests). Persistent, not a TTL cache —
// see getBoardSprintsForSearch. Shape mirrors JiraSprint as-is so a cached
// result can be handed back to the client unchanged.
export interface CachedJiraSprint {
  id: number
  name: string
  state: JiraSprintState
  startDate?: string
  endDate?: string
  originBoardId?: number
}

export interface SprintSearchCacheDoc {
  boardId: number
  sprints: CachedJiraSprint[]
  // Provenance only (when this was populated) — nothing reads it back to
  // decide staleness, unlike Sprint's lastSyncedAt.
  fetchedAt: Date
}

const cachedSprintSchema = new Schema<CachedJiraSprint>(
  {
    id: { type: Number, required: true },
    name: { type: String, required: true },
    state: { type: String, enum: ['active', 'future', 'closed'], required: true },
    startDate: String,
    endDate: String,
    originBoardId: Number,
  },
  { _id: false },
)

const sprintSearchCacheSchema = new Schema<SprintSearchCacheDoc>({
  boardId: { type: Number, required: true, unique: true },
  sprints: { type: [cachedSprintSchema], required: true },
  fetchedAt: { type: Date, required: true },
})

export const SprintSearchCache = mongoose.model<SprintSearchCacheDoc>('SprintSearchCache', sprintSearchCacheSchema)
