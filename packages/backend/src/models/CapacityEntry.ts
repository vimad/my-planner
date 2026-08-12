import mongoose, { Schema, type Types } from 'mongoose'
import type { LeavePortion } from '../services/leaveEntries.ts'

// A TeamMembership's leave for one Sprint - a set of per-date entries picked
// directly against the sprint's working-day calendar (see
// .scratch/sprint-leave-picker/spec.md), rather than a single manually-typed
// number. `date` is a plain 'YYYY-MM-DD' calendar-day string, never
// `Date`/toISOString() - same timezone rule as TeamSprintPlan.startDate/
// holidays (see sprint-period-picker/spec.md's timezone decision). Stored
// entries are reconciled against the sprint's *current* working dates at
// read time (routes/capacity.ts), never swept/mutated here when a
// TeamSprintPlan's period changes - a stale entry just stops counting until
// its date is working again.
export interface LeaveEntrySubdoc {
  date: string
  portion: LeavePortion
}

export interface CapacityEntryDoc {
  teamMembershipId: Types.ObjectId
  sprintId: Types.ObjectId
  leaveEntries: LeaveEntrySubdoc[]
  // A single manually-typed hours figure for the sprint (e.g. on-call/
  // support duty), unlike leaveEntries' per-date picks - comes off Available
  // the same unscaled way a leave day does (services/capacityFormula.ts).
  extraHours: number
  createdAt: Date
  updatedAt: Date
}

const leaveEntrySchema = new Schema<LeaveEntrySubdoc>(
  {
    date: { type: String, required: true },
    portion: { type: String, enum: ['full', 'half'], required: true },
  },
  { _id: false },
)

const capacityEntrySchema = new Schema<CapacityEntryDoc>(
  {
    teamMembershipId: { type: Schema.Types.ObjectId, ref: 'TeamMembership', required: true },
    sprintId: { type: Schema.Types.ObjectId, ref: 'Sprint', required: true },
    leaveEntries: { type: [leaveEntrySchema], default: [] },
    extraHours: { type: Number, default: 0, min: 0 },
  },
  { timestamps: true },
)

capacityEntrySchema.index({ teamMembershipId: 1, sprintId: 1 }, { unique: true })

export const CapacityEntry = mongoose.model<CapacityEntryDoc>('CapacityEntry', capacityEntrySchema)
