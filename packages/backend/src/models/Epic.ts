import mongoose, { Schema } from 'mongoose'

// A cached snapshot of a Jira epic. Child-ticket rollup (count, progress) is
// always computed by querying Ticket.epicKey — never stored here. See
// CONTEXT.md ("Epic").
export interface EpicDoc {
  jiraKey: string
  title: string
  status: string
  lastSyncedAt: Date
}

const epicSchema = new Schema<EpicDoc>({
  jiraKey: { type: String, required: true, unique: true },
  title: { type: String, required: true },
  status: { type: String, required: true },
  lastSyncedAt: { type: Date, required: true },
})

export const Epic = mongoose.model<EpicDoc>('Epic', epicSchema)
