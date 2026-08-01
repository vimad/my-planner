import mongoose, { Schema, type Types } from 'mongoose'

// The coarse grouping layer above Category (see .scratch/profiles/spec.md).
// No `system`/protected flag — every Profile, including the seeded "Work"
// default, is an ordinary, fully user-manageable document. The "can't delete
// the last profile" invariant is enforced in the route layer (there's always
// at least one, so there's never nowhere for Categories/Todos to live), not
// here in the schema.
export interface ProfileDoc {
  name: string
  color?: string
  // "Active board" == "the board currently shown in the Boards view" — a
  // single pointer (not a Board.isActive flag) so switching is one write and
  // "no active board" falls out naturally as null. See Boards spec's Data
  // Model section for the full rationale.
  activeBoardId: Types.ObjectId | null
  createdAt: Date
  updatedAt: Date
}

const profileSchema = new Schema<ProfileDoc>(
  {
    name: { type: String, required: true },
    color: { type: String },
    activeBoardId: { type: Schema.Types.ObjectId, ref: 'Board', default: null },
  },
  { timestamps: true },
)

export const Profile = mongoose.model<ProfileDoc>('Profile', profileSchema)
