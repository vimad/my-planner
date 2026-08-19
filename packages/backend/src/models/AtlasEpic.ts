import mongoose, { Schema } from 'mongoose'

// A manually-tracked Jira epic (Atlas program tracker — see
// .scratch/sprint-atlas-program/spec.md §2). Brand-new, Atlas-only
// collection — no reuse of the existing Epic model (that one is Sprint/
// Ticket-scoped and populated only as a side effect of ticket syncs; this
// one is populated by explicitly entering an epic key into Atlas). Progress/
// status-bucket counts and date range are deliberately NOT stored here —
// they're derived at read time from this epic's AtlasTask docs (spec §2).
export interface AtlasEpicDoc {
  jiraKey: string
  title: string
  jiraUrl: string
  // Rich text, Atlas-local only — never pulled from/pushed to Jira. Empty
  // until ticket 10 adds an editing UI (spec §2).
  notes: string
  // Soft-delete flag for "un-tracking" an epic (spec §4.4). Un-tracking
  // never hard-deletes the epic or its tasks' local annotations.
  archived: boolean
  lastSyncedAt: Date
}

const atlasEpicSchema = new Schema<AtlasEpicDoc>({
  jiraKey: { type: String, required: true, unique: true },
  title: { type: String, required: true },
  jiraUrl: { type: String, required: true },
  notes: { type: String, default: '' },
  archived: { type: Boolean, default: false },
  lastSyncedAt: { type: Date, required: true },
})

export const AtlasEpic = mongoose.model<AtlasEpicDoc>('AtlasEpic', atlasEpicSchema)
