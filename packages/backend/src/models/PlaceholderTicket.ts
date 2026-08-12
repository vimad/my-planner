import mongoose, { Schema, type Types } from 'mongoose'

// A non-Jira, manually-created "ticket": just a short text description, one
// assignee, and an estimate — for planning work that doesn't map to any real
// Jira issue (e.g. "on-call", "interviews"). Deliberately its own collection,
// never the Ticket model, so it structurally can never be touched by
// ticketSync.ts's upserts (no jiraKey to sync against, see
// routes/sprintPlanEntries.ts's POST/sync) and never shows up in the Status
// view's GET /api/tickets, which only ever queries the Ticket collection
// (routes/tickets.ts). `personId` is a single required field, not a list —
// a placeholder ticket always belongs to exactly one assignee, never shared
// between two people. Counts toward that person's Planned capacity figure
// exactly like a resolved Sprint Plan Entry (routes/capacity.ts), but is
// never read by utils/sprintBreakdown.ts on the frontend (which only ever
// takes SprintPlanEntry[]), so it has no effect on the Sprint Breakdown card.
export interface PlaceholderTicketDoc {
  teamId: Types.ObjectId
  sprintId: Types.ObjectId
  personId: Types.ObjectId
  text: string
  estimateHours: number
  createdAt: Date
}

const placeholderTicketSchema = new Schema<PlaceholderTicketDoc>({
  teamId: { type: Schema.Types.ObjectId, ref: 'Team', required: true },
  sprintId: { type: Schema.Types.ObjectId, ref: 'Sprint', required: true },
  personId: { type: Schema.Types.ObjectId, ref: 'Person', required: true },
  text: { type: String, required: true, trim: true },
  estimateHours: { type: Number, required: true, min: 0 },
  createdAt: { type: Date, required: true, default: Date.now },
})

export const PlaceholderTicket = mongoose.model<PlaceholderTicketDoc>('PlaceholderTicket', placeholderTicketSchema)
