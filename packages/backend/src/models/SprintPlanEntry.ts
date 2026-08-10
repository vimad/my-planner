import mongoose, { Schema, type Types } from 'mongoose'

// Join: Team x Sprint x Ticket. Records that a ticket was manually added to
// a specific team's plan for a specific sprint — decoupled from
// Ticket.currentSprintKey (Jira's live answer) so a carried-over ticket
// keeps appearing in every sprint's plan it was ever added to. See ADR 0002.
export interface SprintPlanEntryDoc {
  teamId: Types.ObjectId
  sprintId: Types.ObjectId
  ticketId: Types.ObjectId
  addedAt: Date
  // Per-assignee drag order within the Planning view's "Tickets by person"
  // table (ticket 10's resolution) — meaningful only relative to other
  // entries sharing this ticket's *current* assignee, not a global order.
  // Reset to the end of the new assignee's row (max(order)+1 among their
  // entries) if a re-sync changes the ticket's assignee.
  order: number
}

const sprintPlanEntrySchema = new Schema<SprintPlanEntryDoc>({
  teamId: { type: Schema.Types.ObjectId, ref: 'Team', required: true },
  sprintId: { type: Schema.Types.ObjectId, ref: 'Sprint', required: true },
  ticketId: { type: Schema.Types.ObjectId, ref: 'Ticket', required: true },
  addedAt: { type: Date, required: true, default: Date.now },
  order: { type: Number, required: true },
})

sprintPlanEntrySchema.index({ teamId: 1, sprintId: 1, ticketId: 1 }, { unique: true })

export const SprintPlanEntry = mongoose.model<SprintPlanEntryDoc>('SprintPlanEntry', sprintPlanEntrySchema)
