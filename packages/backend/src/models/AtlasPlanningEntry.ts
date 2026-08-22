import mongoose, { Schema, type Types } from 'mongoose'

// A Jira key attached to one Atlas roster member's row on the Planning tab
// (.scratch/atlas-planning-tab, ticket 01) - deliberately NOT named "Ticket"
// (CONTEXT.md's domain glossary already reserves that term for a cached Jira
// issue snapshot with title/status/type). This model never fetches from
// Jira: `jiraKey` is just the raw string the user typed, normalized to this
// project's WOSMVP-<number> shape client-side (constants/jira.ts's
// normalizeJiraKey) before it ever reaches this route - nothing else is
// cached about the ticket.
//
// `startDate`/`endDate` were unused by ticket 01 (always null there) - kept
// here from the start (rather than added later) so ticket 03's Gantt chart
// could position this entry's bar without a follow-up migration. Ticket 03
// now sets/reads them: `null` means "not yet scheduled" (the Gantt defaults
// an unset entry to a 1-day bar on today until the user drags it), and both
// fields update together via PATCH /api/atlas-planning-entries/:id when a
// bar is dragged (see routes/atlasPlanningEntries.ts).
export interface AtlasPlanningEntryDoc {
  rosterMemberId: Types.ObjectId
  jiraKey: string
  startDate: string | null
  endDate: string | null
  createdAt: Date
  updatedAt: Date
}

const atlasPlanningEntrySchema = new Schema<AtlasPlanningEntryDoc>(
  {
    rosterMemberId: { type: Schema.Types.ObjectId, ref: 'AtlasRosterMember', required: true },
    jiraKey: { type: String, required: true, trim: true },
    startDate: { type: String, default: null },
    endDate: { type: String, default: null },
  },
  { timestamps: true },
)

export const AtlasPlanningEntry = mongoose.model<AtlasPlanningEntryDoc>('AtlasPlanningEntry', atlasPlanningEntrySchema)
