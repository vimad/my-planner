import mongoose, { Schema } from 'mongoose'
import type { JiraSprintState } from '../services/jiraClient.ts'

// One doc per Jira board: the full (unfiltered) sprint list last returned by
// jiraClient.ts's listSprints, so services/sprintSync.ts's searchJiraSprints
// can serve a per-keystroke search from Mongo instead of re-running a full
// paginated board scan (up to MAX_SPRINT_PAGES requests) on every debounced
// query. Shape mirrors JiraSprint as-is so a cached result can be handed back
// to the client unchanged.
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
