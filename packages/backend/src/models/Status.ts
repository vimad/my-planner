import mongoose, { Schema } from 'mongoose'

// One value from the Jira board's actual workflow column configuration
// (name, column order, category), mirrored locally so the Status view's
// columns match the real board. Refreshed wholesale from Jira on every sync
// (see services/statusSync.ts) — never hand-edited. See CONTEXT.md
// ("Status") and spec's "Domain model — Sprint, Ticket, Epic, Status".
export interface StatusDoc {
  name: string
  order: number
  category: 'todo' | 'in_progress' | 'done'
  lastSyncedAt: Date
}

const statusSchema = new Schema<StatusDoc>({
  name: { type: String, required: true, unique: true },
  order: { type: Number, required: true },
  category: { type: String, enum: ['todo', 'in_progress', 'done'], required: true },
  lastSyncedAt: { type: Date, required: true },
})

export const Status = mongoose.model<StatusDoc>('Status', statusSchema)
