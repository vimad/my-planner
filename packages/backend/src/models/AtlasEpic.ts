import mongoose, { Schema } from 'mongoose'
import type { TiptapNode } from '../utils/tiptapText.ts'

// A manually-tracked Jira epic (Atlas program tracker — see
// .scratch/sprint-atlas-program/spec.md §2). Brand-new, Atlas-only
// collection — no reuse of the existing Epic model (that one is Sprint/
// Ticket-scoped and populated only as a side effect of ticket syncs; this
// one is populated by explicitly entering an epic key into Atlas). Progress/
// status-bucket counts and date range are deliberately NOT stored here —
// they're derived at read time from this epic's AtlasTask docs (spec §2).
export interface AtlasEpicDoc {
  jiraKey: string
  title: string
  jiraUrl: string
  // Rich text (Tiptap JSON), Atlas-local only — never pulled from/pushed to
  // Jira. Same Schema.Types.Mixed convention as AtlasTask.notes (ticket 09) —
  // ticket 10 reuses that pattern for epic-level notes rather than inventing
  // a second, plain-string notes shape. Null until the editor is ever saved.
  notes: TiptapNode | null
  // Denormalized plain-text extract of `notes`, maintained by the PATCH
  // route whenever `notes` is set (mirrors AtlasTask.notesText) — used for
  // the Dashboard's epic-notes line since Tiptap JSON isn't directly
  // truthy/falsy-checkable the way a plain string was before ticket 10.
  notesText: string
  // Soft-delete flag for "un-tracking" an epic (spec §4.4). Un-tracking
  // never hard-deletes the epic or its tasks' local annotations.
  archived: boolean
  lastSyncedAt: Date
  // True only for the single synthetic "Outside the program" bucket
  // (services/atlasSync.ts's getOrCreateOutsideProgramEpic) that owns every
  // directly-tracked non-Epic ticket (Task/Story/Bug) — not a real Jira
  // epic, so its jiraKey is a sentinel, never a real issue key, and its
  // jiraUrl is empty. Lets it flow through every existing epic-shaped
  // rendering path (AtlasEpicRow, AtlasTaskBoard's "Group by: Epic") for
  // free, with call sites branching on this flag only where the sentinel
  // key/empty URL would otherwise leak into the UI.
  isOutsideProgram: boolean
}

const atlasEpicSchema = new Schema<AtlasEpicDoc>({
  jiraKey: { type: String, required: true, unique: true },
  title: { type: String, required: true },
  jiraUrl: { type: String, required: true },
  notes: { type: Schema.Types.Mixed, default: null },
  notesText: { type: String, default: '' },
  archived: { type: Boolean, default: false },
  lastSyncedAt: { type: Date, required: true },
  isOutsideProgram: { type: Boolean, default: false },
})

export const AtlasEpic = mongoose.model<AtlasEpicDoc>('AtlasEpic', atlasEpicSchema)
