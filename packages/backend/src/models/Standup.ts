import mongoose, { Schema, type Types } from 'mongoose'

// One roster member's per-day standup timing - keyed by `teamMembershipId`
// (not personId), mirroring CapacityEntry's own join key, so a person
// leaving/rejoining the team under a fresh membership doesn't retroactively
// touch a past day's record. `activeStartedAt` is non-null only while that
// person's timer is currently running (POST .../timer/start);
// `totalSeconds` is the accumulated total across however many start/stop
// cycles they got today.
export interface StandupEntrySubdoc {
  teamMembershipId: Types.ObjectId
  totalSeconds: number
  activeStartedAt: Date | null
}

// One team's standup record for one calendar day. `date` is a plain
// 'YYYY-MM-DD' string taken from the *client's* clock (see
// routes/standups.ts), not the server's — unlike every other 'YYYY-MM-DD'
// field in this codebase (server-computed via utils/localDate.ts), standup
// "today" specifically means the browser's own clock, so this one is
// trusted as given by the request body. `entries` order is the standup's
// reading order for the day, fixed at creation time by whatever order the
// roster was shuffled into client-side (StatusView.tsx's old ephemeral
// `shuffled()` helper, now persisted here instead of being pure client
// state) — never reordered after.
export interface StandupDoc {
  teamId: Types.ObjectId
  date: string
  entries: StandupEntrySubdoc[]
  endedAt: Date | null
  createdAt: Date
  updatedAt: Date
}

const standupEntrySchema = new Schema<StandupEntrySubdoc>(
  {
    teamMembershipId: { type: Schema.Types.ObjectId, ref: 'TeamMembership', required: true },
    totalSeconds: { type: Number, default: 0, min: 0 },
    activeStartedAt: { type: Date, default: null },
  },
  { _id: false },
)

const standupSchema = new Schema<StandupDoc>(
  {
    teamId: { type: Schema.Types.ObjectId, ref: 'Team', required: true },
    date: { type: String, required: true },
    entries: { type: [standupEntrySchema], default: [] },
    endedAt: { type: Date, default: null },
  },
  { timestamps: true },
)

standupSchema.index({ teamId: 1, date: 1 }, { unique: true })

export const Standup = mongoose.model<StandupDoc>('Standup', standupSchema)
