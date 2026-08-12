import type { Types } from 'mongoose'
import { TicketAssigneeOverride } from '../models/TicketAssigneeOverride.ts'
import type { TicketDoc } from '../models/Ticket.ts'

// Batch-fetches every TicketAssigneeOverride for a set of non-split ticket
// ids in one query, keyed by ticketId string - the same "load once, resolve
// many" shape devQaResolution.ts's callers use for TicketDevQaOverride,
// avoiding a per-ticket round trip. Never called for a Split ticket
// (Story/Bug) - those use their own dev/qa Role assignment (devQa) instead.
export async function loadAssigneeOverrides(ticketIds: Types.ObjectId[]): Promise<Map<string, Types.ObjectId | null>> {
  if (ticketIds.length === 0) return new Map()
  const overrides = await TicketAssigneeOverride.find({ ticketId: { $in: ticketIds } })
  return new Map(overrides.map((o) => [String(o.ticketId), o.personId]))
}

// A non-split ticket's resolved Planning-only owner (CONTEXT.md "Assignee
// Override"): its Override's personId if one is set, else its raw Jira
// assigneeAccountId mapped to a current TeamMembership, else null (no
// current team member owns it - the Unmapped catch-all in the Planning
// table). Mirrors devQaResolution.ts's Override-wins-over-Jira precedence
// (ADR 0004) for a single slot instead of a dev/qa pair. Shared by both
// sprintPlanEntries.ts's GET (table placement) and capacity.ts's Planned sum
// so the two can never disagree about who "owns" a ticket.
export function resolveAssignee(
  ticket: Pick<TicketDoc, 'assigneeAccountId'> & { _id: Types.ObjectId },
  overrideByTicketId: Map<string, Types.ObjectId | null>,
  personIdByAccountId: Map<string, Types.ObjectId>,
): Types.ObjectId | null {
  const overridePersonId = overrideByTicketId.get(String(ticket._id))
  if (overridePersonId) return overridePersonId
  if (!ticket.assigneeAccountId) return null
  return personIdByAccountId.get(ticket.assigneeAccountId) ?? null
}
