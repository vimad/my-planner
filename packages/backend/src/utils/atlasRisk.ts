import type { AtlasTaskStatus } from '../models/AtlasTask.ts'
import { toLocalDateString } from './localDate.ts'

// The auto-risk rule (ticket 09, spec §5.1): a task auto-flags at-risk once
// today's date has *passed* its endDate while status isn't Done. Reactive
// only - no configurable window, no "approaching deadline" pre-flagging, so
// endDate === today is deliberately not yet at-risk (strictly-after only).
// Pure and `today`-injectable for testability; real call sites pass
// toLocalDateString(new Date()) (see resolveAtRisk's default below). Dates
// are opaque 'YYYY-MM-DD' local-calendar strings (Todo.dueDate's convention,
// reused for AtlasTask.startDate/endDate - see models/AtlasTask.ts), so a
// plain string compare is both correct and day-shift-bug-free.
export function computeAutoRisk(endDate: string | null, status: AtlasTaskStatus, today: string): boolean {
  if (!endDate || status === 'Done') return false
  return today > endDate
}

// Resolves the *effective* at-risk value a caller (GET /api/atlas/epics)
// should show, reconciling the auto rule above with a manual override.
//
// Design choice (ticket 09 asks this be picked and documented): at-risk is
// never written to Mongo by anything other than an explicit manual PATCH
// (routes/atlasTasks.ts) - there's no cron/background job, and
// atlasSync.ts's resync deliberately never touches it either way (its
// $setOnInsert-only handling of atRisk/atRiskOverride is what makes a
// manual override survive a later sync - the whole point of storing an
// explicit flag per spec §5.1). Instead, the auto-computed value is
// recomputed fresh on every read for any task that has never been manually
// overridden - a pure read-time projection, exactly like the rest of
// Atlas's derived stats (epicStats, spec §2's "derived at read time"). That
// makes the flag "reactive" (flips the instant today crosses endDate)
// without ever needing a sync or a write to trigger it.
//
// Once a human manually toggles at-risk (atRiskOverride flips true, via the
// PATCH route below), the stored `atRisk` value is sticky forever after -
// the auto rule is never consulted again for that task, even across syncs.
export function resolveAtRisk(
  task: { endDate: string | null; status: AtlasTaskStatus; atRisk: boolean; atRiskOverride: boolean },
  today: string = toLocalDateString(new Date()),
): boolean {
  if (task.atRiskOverride) return task.atRisk
  return computeAutoRisk(task.endDate, task.status, today)
}
