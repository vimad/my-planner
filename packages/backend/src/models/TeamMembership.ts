import mongoose, { Schema, type Types } from 'mongoose'
import type { Role } from './Role.ts'
import { ROLES } from './Role.ts'

// The join between a Team and a Person — carries that person's Role on the
// team and their capacity override. A Person may hold a separate
// TeamMembership in more than one Team. See CONTEXT.md ("Team Membership").
export interface TeamMembershipDoc {
  teamId: Types.ObjectId
  personId: Types.ObjectId
  role: Role
  // Effective capacity % = capacityPercentOverride ??
  // ROLE_DEFAULT_CAPACITY_PERCENT[role] — computed, never stored as-is.
  capacityPercentOverride: number | null
  createdAt: Date
  updatedAt: Date
}

const teamMembershipSchema = new Schema<TeamMembershipDoc>(
  {
    teamId: { type: Schema.Types.ObjectId, ref: 'Team', required: true },
    personId: { type: Schema.Types.ObjectId, ref: 'Person', required: true },
    role: { type: String, enum: ROLES, required: true },
    capacityPercentOverride: { type: Number, default: null },
  },
  { timestamps: true },
)

teamMembershipSchema.index({ teamId: 1, personId: 1 }, { unique: true })

export const TeamMembership = mongoose.model<TeamMembershipDoc>('TeamMembership', teamMembershipSchema)
