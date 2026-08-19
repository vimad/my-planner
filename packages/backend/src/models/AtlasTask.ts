import mongoose, { Schema, type Types } from 'mongoose'

// To Do / In Progress / Done — collapsed from Jira's
// fields.status.statusCategory.key ('new'/'indeterminate'/'done') by
// services/atlasSync.ts. See spec §2.
export type AtlasTaskStatus = 'To Do' | 'In Progress' | 'Done'

// A Task or Sub-task belonging to a tracked AtlasEpic — one recursive
// collection/schema for both (spec §2: "Task and Sub-task share one
// recursive shape"). Depth hard-floors at one level of nesting (Epic ->
// Task -> Sub-task, never deeper — services/atlasSync.ts never walks past
// two hops from the epic).
export interface AtlasTaskDoc {
  epicId: Types.ObjectId
  // Ref to another AtlasTask, null for a top-level (depth-0) task. Set for a
  // sub-task.
  parentTaskId: Types.ObjectId | null
  jiraKey: string
  title: string
  jiraUrl: string
  // fields.assignee.accountId — durable identifier; display name/email can
  // be null per Jira's account-privacy rules, so accountId is the only
  // field this stores (informational only, same convention as
  // Ticket.assigneeAccountId).
  assigneeAccountId: string | null
  status: AtlasTaskStatus
  // Manual, set in Atlas — independent of Jira (ticket 09). Null until then.
  startDate: Date | null
  endDate: Date | null
  // Auto-computed (once today passes endDate while status isn't Done) but
  // manually overridable — an explicit stored flag, not a derived value, so
  // an override persists across resyncs (ticket 09). False until then.
  atRisk: boolean
  // Rich text, Atlas-local only (ticket 09). Empty until then.
  notes: string
  // Refs to other AtlasTask docs, any epic — no cycle validation (ticket
  // 09). Empty until then.
  blockedBy: Types.ObjectId[]
  // Soft-delete flag for a Jira-side delete detected on a later sync (spec
  // §4.5). Never set by ticket 07's initial track/sync.
  archived: boolean
}

const atlasTaskSchema = new Schema<AtlasTaskDoc>({
  epicId: { type: Schema.Types.ObjectId, ref: 'AtlasEpic', required: true },
  parentTaskId: { type: Schema.Types.ObjectId, ref: 'AtlasTask', default: null },
  jiraKey: { type: String, required: true, unique: true },
  title: { type: String, required: true },
  jiraUrl: { type: String, required: true },
  assigneeAccountId: { type: String, default: null },
  status: { type: String, enum: ['To Do', 'In Progress', 'Done'], required: true },
  startDate: { type: Date, default: null },
  endDate: { type: Date, default: null },
  atRisk: { type: Boolean, default: false },
  notes: { type: String, default: '' },
  blockedBy: { type: [{ type: Schema.Types.ObjectId, ref: 'AtlasTask' }], default: [] },
  archived: { type: Boolean, default: false },
})

export const AtlasTask = mongoose.model<AtlasTaskDoc>('AtlasTask', atlasTaskSchema)
