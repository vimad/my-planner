import mongoose, { Schema, type Types } from 'mongoose'

// The Team x Sprint header: how many working days that sprint has for this
// team. Manually entered and holiday-adjusted (e.g. 10/9/8/7) — never
// derived from a holiday calendar. See spec's "Domain model — Capacity".
export interface TeamSprintPlanDoc {
  teamId: Types.ObjectId
  sprintId: Types.ObjectId
  workingDays: number
  createdAt: Date
  updatedAt: Date
}

const teamSprintPlanSchema = new Schema<TeamSprintPlanDoc>(
  {
    teamId: { type: Schema.Types.ObjectId, ref: 'Team', required: true },
    sprintId: { type: Schema.Types.ObjectId, ref: 'Sprint', required: true },
    workingDays: { type: Number, required: true },
  },
  { timestamps: true },
)

teamSprintPlanSchema.index({ teamId: 1, sprintId: 1 }, { unique: true })

export const TeamSprintPlan = mongoose.model<TeamSprintPlanDoc>('TeamSprintPlan', teamSprintPlanSchema)
