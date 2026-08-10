import mongoose, { Schema } from 'mongoose'

// A named group of people scoped to Jira label(s), independent of Profile —
// never bound to a profile. See CONTEXT.md ("Team").
export interface TeamDoc {
  name: string
  // Array for future flexibility; exactly one entry per team in phase 1.
  // Editing this needs no cache invalidation/backfill elsewhere — team
  // membership of a ticket is always computed live from Ticket.labels.
  jiraLabels: string[]
  createdAt: Date
  updatedAt: Date
}

const teamSchema = new Schema<TeamDoc>(
  {
    name: { type: String, required: true },
    jiraLabels: { type: [String], required: true },
  },
  { timestamps: true },
)

export const Team = mongoose.model<TeamDoc>('Team', teamSchema)
