import mongoose, { Schema } from 'mongoose'
import type { JiraSprintState } from '../services/jiraClient.ts'

// A cached snapshot of a Jira board sprint. See CONTEXT.md ("Sprint") and
// spec's "Domain model — Sprint, Ticket, Epic, Status".
export interface SprintDoc {
  jiraSprintId: string
  name: string
  state: JiraSprintState
  startDate: Date | null
  endDate: Date | null
  lastSyncedAt: Date
}

const sprintSchema = new Schema<SprintDoc>({
  jiraSprintId: { type: String, required: true, unique: true },
  name: { type: String, required: true },
  state: { type: String, enum: ['active', 'future', 'closed'], required: true },
  startDate: { type: Date, default: null },
  endDate: { type: Date, default: null },
  lastSyncedAt: { type: Date, required: true },
})

export const Sprint = mongoose.model<SprintDoc>('Sprint', sprintSchema)
