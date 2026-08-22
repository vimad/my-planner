import mongoose, { Schema, type Types } from 'mongoose'

// A Jira ticket placed on one Atlas roster member's row on the Planning tab
// (.scratch/atlas-planning-tab). Originally a free-typed Jira key a person
// manually attached (ticket 01); now fully board-derived - every row here is
// written by services/atlasPlanningSync.ts's reconcilePlanningEntries, never
// by a person directly. `taskId` is the source of truth (one entry per
// AtlasTask, enforced unique); `jiraKey` stays denormalized alongside it
// purely so the badge/Gantt/export code that already reads `entry.jiraKey`
// never needs to join back to AtlasTask just to render a key/link.
//
// `startDate`/`endDate` are the one thing that stays a manual, Atlas-local
// edit even now: ticket 03's Gantt chart lets a person drag a bar to
// schedule a ticket within the rolling window, independent of (and never
// written back to) Jira. `null` means "not yet scheduled".
export interface AtlasPlanningEntryDoc {
  rosterMemberId: Types.ObjectId
  taskId: Types.ObjectId
  jiraKey: string
  // Ascending position within this entry's rosterMemberId - what makes
  // "newly synced tickets land at the end of that person's row" possible.
  // reconcilePlanningEntries is the only writer: a brand-new entry (or one
  // that just moved to a different person via a Jira-side reassignment) gets
  // one past that person's current max; an entry that was already there and
  // stayed with the same person keeps its order untouched by a resync.
  order: number
  startDate: string | null
  endDate: string | null
  createdAt: Date
  updatedAt: Date
}

const atlasPlanningEntrySchema = new Schema<AtlasPlanningEntryDoc>(
  {
    rosterMemberId: { type: Schema.Types.ObjectId, ref: 'AtlasRosterMember', required: true },
    taskId: { type: Schema.Types.ObjectId, ref: 'AtlasTask', required: true, unique: true },
    jiraKey: { type: String, required: true, trim: true },
    order: { type: Number, required: true },
    startDate: { type: String, default: null },
    endDate: { type: String, default: null },
  },
  { timestamps: true },
)

export const AtlasPlanningEntry = mongoose.model<AtlasPlanningEntryDoc>('AtlasPlanningEntry', atlasPlanningEntrySchema)
