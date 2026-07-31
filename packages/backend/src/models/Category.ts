import mongoose, { Schema, type Types } from 'mongoose'

export interface CategoryDoc {
  name: string
  color: string
  system: boolean
  // A category's profile is fixed at creation and never re-parented — see
  // the "Category (changed)" note in .scratch/profiles/spec.md. Derived
  // read-scoping by profileId is later-ticket work, not this schema's job.
  profileId: Types.ObjectId
  createdAt: Date
  updatedAt: Date
}

const categorySchema = new Schema<CategoryDoc>(
  {
    name: { type: String, required: true },
    color: { type: String, required: true },
    system: { type: Boolean, default: false },
    profileId: { type: Schema.Types.ObjectId, ref: 'Profile', required: true },
  },
  { timestamps: true },
)

export const Category = mongoose.model<CategoryDoc>('Category', categorySchema)
