import mongoose, { Schema } from 'mongoose'

// The ONE representation of a Jira issue (Bug/Story/Task/Sub-task), shared
// unmodified across Planning, Status, and Epic views — no per-view
// duplication. See CONTEXT.md ("Ticket") and spec's "Domain model".
export interface TicketDoc {
  jiraKey: string // full key e.g. "WOSMVP-14782", unique
  // null only for a ticket discovered exclusively via Lightweight sync
  // (search/jql's fields=summary,status doesn't include issuetype) — renders
  // as a muted "?" type badge until some Full sync fills it in.
  type: string | null
  title: string
  status: string
  // Matched against Person.jiraAccountId; no match = unmapped, a
  // display-time-only comparison (see ADR 0001). NOT the display fields
  // below.
  assigneeAccountId: string | null
  // Display-only, captured straight from the Jira response at sync time —
  // never used for matching (ADR 0001) — added so ticket 22's "promote
  // unmapped assignee" flow has something to pre-fill besides a bare
  // accountId.
  assigneeDisplayName: string | null
  assigneeEmail: string | null
  estimateHours: number | null // raw Jira value, as-is even when sub-tasks also carry estimates
  labels: string[]
  stream: string | null
  epicKey: string | null
  parentKey: string | null // sub-task -> parent ticket
  subtaskKind: 'Dev' | 'Test' | null // parsed from the "[Dev]"/"[Test]" title prefix at sync time
  currentSprintKey: string | null // snapshot of Jira's live sprint field — see SprintPlanEntry, ADR 0002
  lastSyncedAt: Date
}

const ticketSchema = new Schema<TicketDoc>({
  jiraKey: { type: String, required: true, unique: true },
  type: { type: String, default: null },
  title: { type: String, required: true },
  status: { type: String, required: true },
  assigneeAccountId: { type: String, default: null },
  assigneeDisplayName: { type: String, default: null },
  assigneeEmail: { type: String, default: null },
  estimateHours: { type: Number, default: null },
  labels: { type: [String], default: [] },
  stream: { type: String, default: null },
  epicKey: { type: String, default: null },
  parentKey: { type: String, default: null },
  subtaskKind: { type: String, enum: ['Dev', 'Test', null], default: null },
  currentSprintKey: { type: String, default: null },
  lastSyncedAt: { type: Date, required: true },
})

export const Ticket = mongoose.model<TicketDoc>('Ticket', ticketSchema)
