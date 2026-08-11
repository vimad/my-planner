import mongoose, { Schema } from 'mongoose'

// Global, admin-editable (settings view) lookup of exact hours for a given
// (percentage, working days) pair — overrides the fallback formula
// (workingDays x 8 x percentage/100) when a row matches. `days` is the
// sprint's raw working days, before any leave is subtracted - leave comes
// off the resulting Available hours afterward, unscaled (see
// services/capacityFormula.ts). Seeded at boot (seed.ts's
// seedCapacityLookup) but never overwritten once a row exists, so later
// admin edits survive restarts.
export interface CapacityLookupDoc {
  percentage: number
  days: number
  hours: number
  createdAt: Date
  updatedAt: Date
}

const capacityLookupSchema = new Schema<CapacityLookupDoc>(
  {
    percentage: { type: Number, required: true },
    days: { type: Number, required: true },
    hours: { type: Number, required: true },
  },
  { timestamps: true },
)

capacityLookupSchema.index({ percentage: 1, days: 1 }, { unique: true })

export const CapacityLookup = mongoose.model<CapacityLookupDoc>('CapacityLookup', capacityLookupSchema)
