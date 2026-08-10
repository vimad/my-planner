import mongoose, { Schema, type Types } from 'mongoose'

// A TeamMembership's leave for one Sprint — manual input, 0.5-day
// granularity, defaulting to 0 (no leave) when absent. See spec's "Domain
// model — Capacity".
export interface CapacityEntryDoc {
  teamMembershipId: Types.ObjectId
  sprintId: Types.ObjectId
  leaveDays: number
  createdAt: Date
  updatedAt: Date
}

const capacityEntrySchema = new Schema<CapacityEntryDoc>(
  {
    teamMembershipId: { type: Schema.Types.ObjectId, ref: 'TeamMembership', required: true },
    sprintId: { type: Schema.Types.ObjectId, ref: 'Sprint', required: true },
    leaveDays: { type: Number, default: 0 },
  },
  { timestamps: true },
)

capacityEntrySchema.index({ teamMembershipId: 1, sprintId: 1 }, { unique: true })

export const CapacityEntry = mongoose.model<CapacityEntryDoc>('CapacityEntry', capacityEntrySchema)
