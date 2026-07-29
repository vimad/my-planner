import mongoose, { Schema } from 'mongoose'

// Singleton settings document for app-wide state that isn't per-todo or
// per-category. Currently just `nextOfficeDay`: a local YYYY-MM-DD
// calendar-day string (same opaque-string convention as Todo.dueDate — see
// that model's comment) that todos can link to instead of a real dueDate,
// so office-day todos highlight without ever writing a dueDate onto them.
// There is exactly one Settings document; routes/settings.js always
// upserts against an empty filter to find-or-create it.
export interface SettingsDoc {
  nextOfficeDay: string | null
  createdAt: Date
  updatedAt: Date
}

const settingsSchema = new Schema<SettingsDoc>(
  {
    nextOfficeDay: { type: String, default: null },
  },
  { timestamps: true },
)

export const Settings = mongoose.model<SettingsDoc>('Settings', settingsSchema)
