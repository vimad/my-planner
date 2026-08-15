import mongoose, { Schema, type Types } from 'mongoose'
import type { BacklogCategory } from '../services/backlogSearch.ts'

// Marks that a (teamId, category) backlog cache has been populated at least
// once — the presence of this doc, not BacklogTicketCache row count, is
// what tells services/backlogCache.ts's getBacklog whether to trust the
// cache or fall through to Jira. Needed because a category's backlog sprint
// can legitimately be empty: without this doc, an empty BacklogTicketCache
// result would be indistinguishable from "never synced" and every request
// would re-hit Jira forever.
export interface BacklogCacheSyncDoc {
  teamId: Types.ObjectId
  category: BacklogCategory
  lastSyncedAt: Date
}

const backlogCacheSyncSchema = new Schema<BacklogCacheSyncDoc>({
  teamId: { type: Schema.Types.ObjectId, ref: 'Team', required: true },
  category: { type: String, enum: ['tech-ops', 'product', 'bug'], required: true },
  lastSyncedAt: { type: Date, required: true },
})

backlogCacheSyncSchema.index({ teamId: 1, category: 1 }, { unique: true })

export const BacklogCacheSync = mongoose.model<BacklogCacheSyncDoc>('BacklogCacheSync', backlogCacheSyncSchema)
