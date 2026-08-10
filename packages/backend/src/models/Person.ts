import mongoose, { Schema } from 'mongoose'

// A human team member identified by a Jira accountId — the actual match key
// against Ticket.assigneeAccountId (see ADR 0001). name/email are display
// only. See CONTEXT.md ("Person").
export interface PersonDoc {
  name: string
  email: string
  jiraAccountId: string
  createdAt: Date
  updatedAt: Date
}

const personSchema = new Schema<PersonDoc>(
  {
    name: { type: String, required: true },
    email: { type: String, required: true },
    jiraAccountId: { type: String, required: true, unique: true },
  },
  { timestamps: true },
)

export const Person = mongoose.model<PersonDoc>('Person', personSchema)
