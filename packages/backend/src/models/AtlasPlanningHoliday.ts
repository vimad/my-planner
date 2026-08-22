import mongoose, { Schema } from 'mongoose'

// A shared holiday mark for one absolute calendar date on the Atlas
// Planning tab's rolling two-week window (.scratch/atlas-planning-tab,
// ticket 02) - applies to the whole roster, not any one person (contrast
// with AtlasPlanningLeave, which is per rosterMemberId). Mirrors the
// semantics of TeamSprintPlan.holidays (a string array on a sprint-plan
// header doc) but as its own standalone collection, since there is no
// sprint-plan-header doc to hang it off here - this feature has no sprint
// concept at all, and deliberately does not import TeamSprintPlan.
//
// `date` is a plain 'YYYY-MM-DD' calendar-day string (see utils/
// rollingWindow.ts's comment). A holiday mark persists by absolute date
// forever; nothing here deletes/archives it once its date ages out of the
// current rolling window - GET /api/atlas-planning-holidays reconciles that
// at read time (filters to the current window), mirroring CapacityEntry's
// "reconcile at read time, never cascade-write" convention.
export interface AtlasPlanningHolidayDoc {
  date: string
  createdAt: Date
  updatedAt: Date
}

const atlasPlanningHolidaySchema = new Schema<AtlasPlanningHolidayDoc>(
  {
    date: { type: String, required: true, unique: true },
  },
  { timestamps: true },
)

export const AtlasPlanningHoliday = mongoose.model<AtlasPlanningHolidayDoc>(
  'AtlasPlanningHoliday',
  atlasPlanningHolidaySchema,
)
