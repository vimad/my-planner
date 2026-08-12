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
  // entries) if a re-sync changes the ticket's assignee. Used as-is by a
  // non-split ticket (Task/Sub-task/anything else); a Split ticket
  // (Story/Bug) ignores this field entirely and uses devOrder/qaOrder
  // below instead — see CONTEXT.md ("Split ticket").
  order: number
  // Per-resolved-dev-person drag order (ticket 23), meaningful only for a
  // Split ticket, only relative to other Split entries whose dev Role
  // assignment (services/devQaResolution.ts) resolves to the same person.
  // null until that role first resolves to someone (see
  // routes/sprintPlanEntries.ts). Reset the same way `order` is, except an
  // Override-pinned role (ADR 0004) never gets reset by a resync.
  devOrder: number | null
  // Same as devOrder, for the qa role.
  qaOrder: number | null
  // Per-sprint, per-role Plan/Spill override (spec ".scratch/
  // sprint-plan-spill-estimate/spec.md", ADR 0006) - `null` on every field
  // means "not overridden, follow Original" (a Split entry's role Sub-task
  // estimate, or a non-split entry's Effort). A Split entry only ever uses
  // the dev*/qa* pair; a non-split entry only ever uses the bare pair - same
  // "the two variants never coexist on the same entry" convention devQa/
  // assigneeOverridePersonId already follow on this model's GET response.
  // Deliberately sprint-scoped here (not a global per-ticket doc like
  // TicketDevQaOverride/TicketAssigneeOverride) - a ticket carried into a
  // later sprint gets an independent Plan/Spill each time, see ADR 0006.
  devPlanHours: number | null
  devSpillHours: number | null
  qaPlanHours: number | null
  qaSpillHours: number | null
  planHours: number | null
  spillHours: number | null
}

const sprintPlanEntrySchema = new Schema<SprintPlanEntryDoc>({
  teamId: { type: Schema.Types.ObjectId, ref: 'Team', required: true },
  sprintId: { type: Schema.Types.ObjectId, ref: 'Sprint', required: true },
  ticketId: { type: Schema.Types.ObjectId, ref: 'Ticket', required: true },
  addedAt: { type: Date, required: true, default: Date.now },
  order: { type: Number, required: true },
  devOrder: { type: Number, default: null },
  qaOrder: { type: Number, default: null },
  devPlanHours: { type: Number, default: null },
  devSpillHours: { type: Number, default: null },
  qaPlanHours: { type: Number, default: null },
  qaSpillHours: { type: Number, default: null },
  planHours: { type: Number, default: null },
  spillHours: { type: Number, default: null },
})

sprintPlanEntrySchema.index({ teamId: 1, sprintId: 1, ticketId: 1 }, { unique: true })

export const SprintPlanEntry = mongoose.model<SprintPlanEntryDoc>('SprintPlanEntry', sprintPlanEntrySchema)
