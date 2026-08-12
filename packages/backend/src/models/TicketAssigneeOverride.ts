import mongoose, { Schema, type Types } from 'mongoose'

// A manually-picked Planning-only owner for a non-split ticket (Task/
// Sub-task - CONTEXT.md "Split ticket"), recorded when the team wants to
// plan around someone other than Jira's own assignee without touching Jira
// itself. Global per ticket - not scoped to team or sprint. Deliberately its
// own collection (not a field on Ticket), same reasoning as
// TicketDevQaOverride: ticketSync.ts's fullSyncTickets upserts never touch
// it, so an Override, once set, always wins over Jira's assignee for that
// ticket with no special-casing needed in the sync path - see
// docs/adr/0005-assignee-override-wins-over-jira-resync.md.
export interface TicketAssigneeOverrideDoc {
  ticketId: Types.ObjectId
  personId: Types.ObjectId | null
  createdAt: Date
  updatedAt: Date
}

const ticketAssigneeOverrideSchema = new Schema<TicketAssigneeOverrideDoc>(
  {
    ticketId: { type: Schema.Types.ObjectId, ref: 'Ticket', required: true, unique: true },
    personId: { type: Schema.Types.ObjectId, ref: 'Person', default: null },
  },
  { timestamps: true },
)

export const TicketAssigneeOverride = mongoose.model<TicketAssigneeOverrideDoc>(
  'TicketAssigneeOverride',
  ticketAssigneeOverrideSchema,
)
