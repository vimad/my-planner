import mongoose, { Schema, type Types } from 'mongoose'

// The Team x Sprint header: a picked start/end date range plus any
// individually-marked holidays within it (see .scratch/sprint-period-picker/
// spec.md). workingDays is derived from those three fields via
// services/sprintWorkingDays.ts's computeWorkingDays and is SERVER-DERIVED
// only - never client-supplied (enforced at the route layer, not here).
//
// startDate/endDate are plain 'YYYY-MM-DD' calendar-day strings, not `Date`
// - see dateAgenda.ts's localTodayISO() convention on the frontend and the
// spec's timezone decision (Date#toISOString() shifts calendar days in a
// UTC+ environment).
//
// startDate/endDate are optional at the schema level (not required) so that
// real, already-existing plans created before this feature shipped - which
// hold only a manually-entered workingDays, no date range - continue to read
// back validly instead of failing schema validation. New writes always
// populate all three fields, enforced at the route layer.
export interface TeamSprintPlanDoc {
  teamId: Types.ObjectId
  sprintId: Types.ObjectId
  startDate?: string
  endDate?: string
  holidays: string[]
  workingDays: number
  createdAt: Date
  updatedAt: Date
}

const teamSprintPlanSchema = new Schema<TeamSprintPlanDoc>(
  {
    teamId: { type: Schema.Types.ObjectId, ref: 'Team', required: true },
    sprintId: { type: Schema.Types.ObjectId, ref: 'Sprint', required: true },
    startDate: { type: String },
    endDate: { type: String },
    holidays: { type: [String], default: [] },
    workingDays: { type: Number, required: true },
  },
  { timestamps: true },
)

teamSprintPlanSchema.index({ teamId: 1, sprintId: 1 }, { unique: true })

export const TeamSprintPlan = mongoose.model<TeamSprintPlanDoc>('TeamSprintPlan', teamSprintPlanSchema)
