import mongoose, { Schema, type Types } from 'mongoose'
import type { BacklogCategory } from '../services/backlogSearch.ts'

// One cached row of a team+category backlog browse (services/backlogCache.ts).
// Mirrors BacklogTicket (services/backlogSearch.ts) exactly, plus the keys
// needed to scope and order the cache: `teamId`+`category` (what
// GET /api/tickets/backlog is browsing) and `rank` (searchBacklog's own
// Jira board-rank order, which Mongo's natural insertion order can't be
// trusted to preserve on read). Whether a (teamId, category) pair has ever
// been synced at all — as opposed to synced-but-empty — is tracked
// separately by BacklogCacheSync, not inferable from this collection alone.
export interface BacklogTicketCacheDoc {
  teamId: Types.ObjectId
  category: BacklogCategory
  jiraKey: string
  title: string
  type: string
  labels: string[]
  dev: { name: string } | null
  qa: { name: string } | null
  assignee: { name: string } | null
  rank: number
}

// dev/qa/assignee are all "just a name" today (BacklogTicket itself carries
// no more than that) - one shared sub-schema for the three rather than
// repeating the same `{ name: String }` shape inline three times.
const personRefSchema = new Schema({ name: String }, { _id: false })

const backlogTicketCacheSchema = new Schema<BacklogTicketCacheDoc>({
  teamId: { type: Schema.Types.ObjectId, ref: 'Team', required: true },
  category: { type: String, enum: ['tech-ops', 'product', 'bug'], required: true },
  jiraKey: { type: String, required: true },
  title: { type: String, required: true },
  type: { type: String, required: true },
  labels: { type: [String], required: true },
  dev: { type: personRefSchema, default: null },
  qa: { type: personRefSchema, default: null },
  assignee: { type: personRefSchema, default: null },
  rank: { type: Number, required: true },
})

backlogTicketCacheSchema.index({ teamId: 1, category: 1, jiraKey: 1 }, { unique: true })

export const BacklogTicketCache = mongoose.model<BacklogTicketCacheDoc>('BacklogTicketCache', backlogTicketCacheSchema)
