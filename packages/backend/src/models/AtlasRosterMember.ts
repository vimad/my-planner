import mongoose, { Schema, type Types } from 'mongoose'

// The join between Atlas (a single, non-team-scoped roster) and a Person -
// who's relevant to Atlas, so AtlasTaskBoard can resolve an
// AtlasTask.assigneeAccountId to a real name (frontend's
// utils/atlasAssignee.ts). Deliberately not a TeamMembership: Atlas has no
// team scoping at all (spec.md §1), so this carries no teamId, no role, no
// capacity - just "this person is part of Atlas's roster." Unique on
// personId alone since there is exactly one Atlas roster to join against.
export interface AtlasRosterMemberDoc {
  personId: Types.ObjectId
  createdAt: Date
  updatedAt: Date
}

const atlasRosterMemberSchema = new Schema<AtlasRosterMemberDoc>(
  {
    personId: { type: Schema.Types.ObjectId, ref: 'Person', required: true, unique: true },
  },
  { timestamps: true },
)

export const AtlasRosterMember = mongoose.model<AtlasRosterMemberDoc>('AtlasRosterMember', atlasRosterMemberSchema)
