import mongoose, { Schema, type Types } from 'mongoose'

// A manually-picked PO (Product Owner) and/or estimate for a Story ticket -
// app-side data only, never derived from or synced to Jira's real assignee
// (unlike Dev/QA, a PO has no `[Dev]`/`[Test]` Sub-task to resolve against,
// so this is a flat override, always either set or not - see
// services/devQaResolution.ts's DevQaRoleResolution for the richer shape
// this deliberately doesn't need). Global per ticket - not scoped to team or
// sprint. Deliberately its own collection (not a field on Ticket), same
// reasoning as TicketDevQaOverride/TicketAssigneeOverride: ticketSync.ts's
// fullSyncTickets upserts never touch it, so a PO assignment, once set,
// always survives a Jira resync with no special-casing needed in the sync
// path.
export interface TicketPoAssignmentDoc {
  ticketId: Types.ObjectId
  poPersonId: Types.ObjectId | null
  poEstimateHours: number | null
  createdAt: Date
  updatedAt: Date
}

const ticketPoAssignmentSchema = new Schema<TicketPoAssignmentDoc>(
  {
    ticketId: { type: Schema.Types.ObjectId, ref: 'Ticket', required: true, unique: true },
    poPersonId: { type: Schema.Types.ObjectId, ref: 'Person', default: null },
    poEstimateHours: { type: Number, default: null },
  },
  { timestamps: true },
)

export const TicketPoAssignment = mongoose.model<TicketPoAssignmentDoc>('TicketPoAssignment', ticketPoAssignmentSchema)
