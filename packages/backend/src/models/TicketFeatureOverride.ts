import mongoose, { Schema, type Types } from 'mongoose'

// A manually-picked Feature/Technical-item classification for a non-split
// ticket (Task/Sub-task - CONTEXT.md "Split ticket"), recorded so the Sprint
// Breakdown card can bucket it as a Feature instead of the Technical items
// default. Global per ticket - not scoped to team or sprint. Deliberately its
// own collection (not a field on Ticket), same reasoning as
// TicketDevQaOverride/TicketAssigneeOverride: ticketSync.ts's fullSyncTickets
// upserts never touch it, so an Override, once set, always wins over Jira's
// resync for that ticket with no special-casing needed in the sync path -
// see docs/adr/0004-dev-qa-override-wins-over-jira-resync.md /
// docs/adr/0005-assignee-override-wins-over-jira-resync.md.
export interface TicketFeatureOverrideDoc {
  ticketId: Types.ObjectId
  isFeature: boolean
  createdAt: Date
  updatedAt: Date
}

const ticketFeatureOverrideSchema = new Schema<TicketFeatureOverrideDoc>(
  {
    ticketId: { type: Schema.Types.ObjectId, ref: 'Ticket', required: true, unique: true },
    isFeature: { type: Boolean, default: false },
  },
  { timestamps: true },
)

export const TicketFeatureOverride = mongoose.model<TicketFeatureOverrideDoc>(
  'TicketFeatureOverride',
  ticketFeatureOverrideSchema,
)
