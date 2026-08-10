import mongoose, { Schema, type Types } from 'mongoose'

// A manually-picked dev and/or qa Person for a Split ticket (Story/Bug),
// recorded when Jira doesn't supply a resolvable [Dev]/[Test] Sub-task
// assignee for that role. Global per ticket — not scoped to team or sprint.
// Deliberately its own collection (not fields on Ticket) so
// ticketSync.ts's fullSyncTickets upserts never touch it: that separation
// is what makes ADR 0004's "an Override, once set, always wins over Jira
// resync for that role" true for free, with no special-casing needed in the
// sync path itself. See CONTEXT.md ("Dev/QA Override").
export interface TicketDevQaOverrideDoc {
  ticketId: Types.ObjectId
  devPersonId: Types.ObjectId | null
  qaPersonId: Types.ObjectId | null
  createdAt: Date
  updatedAt: Date
}

const ticketDevQaOverrideSchema = new Schema<TicketDevQaOverrideDoc>(
  {
    ticketId: { type: Schema.Types.ObjectId, ref: 'Ticket', required: true, unique: true },
    devPersonId: { type: Schema.Types.ObjectId, ref: 'Person', default: null },
    qaPersonId: { type: Schema.Types.ObjectId, ref: 'Person', default: null },
  },
  { timestamps: true },
)

export const TicketDevQaOverride = mongoose.model<TicketDevQaOverrideDoc>(
  'TicketDevQaOverride',
  ticketDevQaOverrideSchema,
)
