import type { Types } from 'mongoose'
import { TicketFeatureOverride } from '../models/TicketFeatureOverride.ts'

// Batch-fetches every TicketFeatureOverride for a set of non-split ticket
// ids in one query, keyed by ticketId string - the same "load once, resolve
// many" shape assigneeResolution.ts's loadAssigneeOverrides uses, avoiding a
// per-ticket round trip. Never called for a Split ticket (Story/Bug) - those
// have their bucket fixed by type (map's Notes), no classification to load.
// A ticket id with no Override doc defaults to `false` (Technical item) -
// baked in here so every caller gets a plain boolean, never undefined/null.
export async function loadFeatureOverrides(ticketIds: Types.ObjectId[]): Promise<Map<string, boolean>> {
  if (ticketIds.length === 0) return new Map()
  const overrides = await TicketFeatureOverride.find({ ticketId: { $in: ticketIds } })
  const byTicketId = new Map(overrides.map((o) => [String(o.ticketId), o.isFeature]))
  return new Map(ticketIds.map((id) => [String(id), byTicketId.get(String(id)) ?? false]))
}
