import mongoose, { Schema, type Types } from 'mongoose'

// One roster member's leave mark for one absolute calendar date, on the
// Atlas Planning tab's rolling two-week window (.scratch/
// atlas-planning-tab, ticket 02). Deliberately its own standalone
// collection, not CapacityEntry.leaveEntries (Sprint Planning's own model,
// off-limits per this feature's module boundary) - there is no per-sprint
// parent doc to nest this under here, since this feature has no sprint
// concept at all. One document per (rosterMemberId, date) rather than an
// array-on-a-parent-doc, since there's no natural parent doc (unlike
// CapacityEntry, which nests leaveEntries under a per-membership-per-sprint
// document) - this shape also lets a single cell's click-to-cycle map
// directly onto create/update/delete of one small doc, instead of a
// full-array-replacement PATCH.
//
// `date` is a plain 'YYYY-MM-DD' calendar-day string, matching every other
// date field in this codebase (see utils/rollingWindow.ts's own comment on
// why - never a `Date`/UTC timestamp). Marks persist by absolute date
// forever; nothing here ever deletes/archives a mark just because its date
// has aged out of the current rolling window - GET /api/atlas-planning-leave
// reconciles that at read time (filters to the current window) rather than
// cascade-writing, mirroring CapacityEntry's existing "reconcile at read
// time, never cascade-write" convention (see routes/capacity.ts).
export type AtlasPlanningLeavePortion = 'full' | 'half'

export interface AtlasPlanningLeaveDoc {
  rosterMemberId: Types.ObjectId
  date: string
  portion: AtlasPlanningLeavePortion
  createdAt: Date
  updatedAt: Date
}

const atlasPlanningLeaveSchema = new Schema<AtlasPlanningLeaveDoc>(
  {
    rosterMemberId: { type: Schema.Types.ObjectId, ref: 'AtlasRosterMember', required: true },
    date: { type: String, required: true },
    portion: { type: String, enum: ['full', 'half'], required: true },
  },
  { timestamps: true },
)

// One mark per person per date - a click-to-cycle re-mark of the same cell
// goes through PATCH (portion change) or DELETE (back to "none"), never a
// second POST for the same (rosterMemberId, date) pair.
atlasPlanningLeaveSchema.index({ rosterMemberId: 1, date: 1 }, { unique: true })

export const AtlasPlanningLeave = mongoose.model<AtlasPlanningLeaveDoc>('AtlasPlanningLeave', atlasPlanningLeaveSchema)
