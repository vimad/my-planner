import mongoose, { Schema, type Types } from 'mongoose'
import type { TiptapNode } from '../utils/tiptapText.ts'

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
  // Manual, set in Atlas — independent of Jira. Opaque local-calendar-day
  // strings ('YYYY-MM-DD'), same convention as Todo.dueDate — deliberately
  // never a Date/timestamp, to avoid the day-shift bug a bare Date would
  // introduce when a value like "2026-07-01" gets UTC-cast then rendered
  // back in the browser's local timezone (see routes/todos.ts's own
  // comment on dueDate). Null until set.
  startDate: string | null
  endDate: string | null
  // The *effective* at-risk flag, as last written — auto-seeded false, then
  // either recomputed fresh at read time (utils/atlasRisk.ts's
  // resolveAtRisk) while atRiskOverride is false, or held sticky at
  // whatever a manual PATCH last set once atRiskOverride flips true. Stored
  // (rather than purely derived) specifically so a manual override survives
  // a later Jira resync — atlasSync.ts's $setOnInsert-only handling of both
  // this and atRiskOverride is what makes that persistence work (spec §5.1).
  atRisk: boolean
  // Whether a human has ever manually toggled at-risk for this task (via
  // PATCH /api/atlas/tasks/:id). false (the default) means `atRisk` is not
  // meaningful on its own — resolveAtRisk recomputes the auto rule fresh on
  // every read instead of trusting this stored value. Sticky once true:
  // nothing (including a resync) ever resets it back to false.
  atRiskOverride: boolean
  // Rich text (Tiptap JSON), Atlas-local only — same Schema.Types.Mixed
  // convention as Todo.body/Note.body. Null until the notes editor (ticket
  // 09) has ever been saved.
  notes: TiptapNode | null
  // Denormalized plain-text extract of `notes`, maintained by the PATCH
  // route whenever `notes` is set (mirrors Todo.bodyText/tiptapText.ts) —
  // used for the Dashboard's "non-empty notes" indicator (ticket 08) since
  // Tiptap JSON isn't directly truthy/falsy-checkable the way a plain
  // string was before this ticket.
  notesText: string
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
  startDate: { type: String, default: null },
  endDate: { type: String, default: null },
  atRisk: { type: Boolean, default: false },
  atRiskOverride: { type: Boolean, default: false },
  notes: { type: Schema.Types.Mixed, default: null },
  notesText: { type: String, default: '' },
  blockedBy: { type: [{ type: Schema.Types.ObjectId, ref: 'AtlasTask' }], default: [] },
  archived: { type: Boolean, default: false },
})

export const AtlasTask = mongoose.model<AtlasTaskDoc>('AtlasTask', atlasTaskSchema)
