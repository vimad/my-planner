import mongoose, { Schema } from 'mongoose'

// The coarse grouping layer above Category (see .scratch/profiles/spec.md).
// No `system`/protected flag — every Profile, including the seeded "Work"
// default, is an ordinary, fully user-manageable document. The "can't delete
// the last profile" invariant is enforced in the route layer (there's always
// at least one, so there's never nowhere for Categories/Todos to live), not
// here in the schema.
export interface ProfileDoc {
  name: string
  color?: string
  createdAt: Date
  updatedAt: Date
}

const profileSchema = new Schema<ProfileDoc>(
  {
    name: { type: String, required: true },
    color: { type: String },
  },
  { timestamps: true },
)

export const Profile = mongoose.model<ProfileDoc>('Profile', profileSchema)
