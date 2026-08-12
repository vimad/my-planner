import type { Types } from 'mongoose'
import { Ticket, type TicketDoc } from '../models/Ticket.ts'
import { TicketDevQaOverride } from '../models/TicketDevQaOverride.ts'

// A Story or Bug — the Planning view always tracks these as two independent
// roles (dev, qa) instead of one shared assignee. Task/Sub-task/anything
// else is never split and keeps using Ticket.assigneeAccountId directly in
// every consumer. See CONTEXT.md ("Split ticket").
export function isSplitTicket(type: string | null | undefined): boolean {
  return type === 'Story' || type === 'Bug'
}

// A team's current TeamMembership roster, reduced to just what role
// resolution needs (ADR 0001's match key). Callers already have
// TeamMembership populated with Person for their own purposes
// (capacity.ts, sprintPlanEntries.ts) — this keeps this module decoupled
// from exactly how that population happened.
export interface MembershipForResolution {
  personId: Types.ObjectId
  jiraAccountId: string
}

// One role's resolved owner (CONTEXT.md "Role assignment"):
// - resolved: an Override or a mapped Sub-task assignee -> personId, plus
//   `source` so a caller (ticket 24's popup) can tell an Override apart from
//   a Jira-sourced Sub-task match.
// - unmapped: a real Sub-task assignee that doesn't match any current
//   TeamMembership (CONTEXT.md "Unmapped assignee") -> carries the same raw
//   Jira display fields Ticket already caches, for the frontend to render
//   like today's unmapped bucket.
// - needs-assignment: no real Sub-task of this kind at all, or it exists
//   but is unassigned, and no Override is set for the role either.
//
// Every variant also carries `jiraAssigneeDisplayName` - the role's
// `[Dev]`/`[Test]` Sub-task's own current Jira assignee, independent of
// resolution (so it stays populated even once an Override is in play and
// wins over it per ADR 0004). The popup shows this alongside its select so
// the actual Jira assignee is always visible, mirroring how
// TicketInfoPopup always shows Jira's own assignee next to a non-split
// ticket's Assignee Override select (ADR 0005).
export type DevQaRoleResolution =
  | { status: 'resolved'; source: 'override' | 'subtask'; personId: Types.ObjectId; jiraAssigneeDisplayName: string | null }
  | {
      status: 'unmapped'
      assigneeAccountId: string
      assigneeDisplayName: string | null
      assigneeEmail: string | null
      jiraAssigneeDisplayName: string | null
    }
  | { status: 'needs-assignment'; jiraAssigneeDisplayName: string | null }

export interface DevQaResolution {
  dev: DevQaRoleResolution
  qa: DevQaRoleResolution
}

type SubtaskForResolution = Pick<TicketDoc, 'assigneeAccountId' | 'assigneeDisplayName' | 'assigneeEmail'>

function resolveRole(
  overridePersonId: Types.ObjectId | null | undefined,
  subtask: SubtaskForResolution | null,
  personIdByAccountId: Map<string, Types.ObjectId>,
): DevQaRoleResolution {
  // The Sub-task's own current Jira assignee - tracked separately from
  // resolution below (which an Override can override) so it's always
  // available for display, per this type's doc comment.
  const jiraAssigneeDisplayName = subtask?.assigneeDisplayName ?? null

  // (a) An Override, once set for this role, always wins over Jira resync
  // data — full stop, per ADR 0004. A real Sub-task assignee is never even
  // consulted once an Override exists for the role.
  if (overridePersonId) {
    return { status: 'resolved', source: 'override', personId: overridePersonId, jiraAssigneeDisplayName }
  }

  // (d) No real Sub-task of this kind, or it exists but is unassigned, and
  // no Override.
  if (!subtask || !subtask.assigneeAccountId) {
    return { status: 'needs-assignment', jiraAssigneeDisplayName }
  }

  // (b) A real Sub-task whose assignee matches a current TeamMembership.
  const personId = personIdByAccountId.get(subtask.assigneeAccountId)
  if (personId) {
    return { status: 'resolved', source: 'subtask', personId, jiraAssigneeDisplayName }
  }

  // (c) A real Sub-task whose assignee doesn't match any current membership.
  return {
    status: 'unmapped',
    assigneeAccountId: subtask.assigneeAccountId,
    assigneeDisplayName: subtask.assigneeDisplayName,
    assigneeEmail: subtask.assigneeEmail,
    jiraAssigneeDisplayName,
  }
}

// Resolves a Split ticket's dev and qa Role assignment independently
// (ticket 23; CONTEXT.md "Role assignment"). Never called for a
// non-Story/Bug ticket.
export async function resolveDevQa(
  ticket: Pick<TicketDoc, 'jiraKey'> & { _id: Types.ObjectId },
  memberships: MembershipForResolution[],
): Promise<DevQaResolution> {
  const [override, subtasks] = await Promise.all([
    TicketDevQaOverride.findOne({ ticketId: ticket._id }),
    Ticket.find({ parentKey: ticket.jiraKey, subtaskKind: { $in: ['Dev', 'Test'] } }),
  ])

  const personIdByAccountId = new Map(memberships.map((m) => [m.jiraAccountId, m.personId]))
  // The [Dev]/[Test] title-prefix convention (ticketSync.ts's
  // parseSubtaskKind) is assumed to produce at most one Sub-task per kind;
  // if Jira ever has more, the first one found wins, same as
  // roleSubtaskEstimateHours below sums every one found instead.
  const devSubtask = subtasks.find((t) => t.subtaskKind === 'Dev') ?? null
  const qaSubtask = subtasks.find((t) => t.subtaskKind === 'Test') ?? null

  return {
    dev: resolveRole(override?.devPersonId, devSubtask, personIdByAccountId),
    qa: resolveRole(override?.qaPersonId, qaSubtask, personIdByAccountId),
  }
}

// Planned's per-role figure for a Split ticket (CONTEXT.md
// "Total/Available/Planned/Remaining"): the raw estimateHours of that
// ticket's own [Dev]/[Test] Sub-task — never a share of the parent's own
// estimateHours, never computeEffortHours's all-children rollup (that
// rollup is for non-split tickets only). 0 when no Sub-task of that kind
// exists, or it exists but carries no estimate — mirrors
// ticketSync.ts's computeEffortHours in spirit, but deliberately never
// falls back to the parent's own estimateHours.
export async function roleSubtaskEstimateHours(jiraKey: string, kind: 'Dev' | 'Test'): Promise<number> {
  const subtasks = await Ticket.find({ parentKey: jiraKey, subtaskKind: kind })
  return subtasks.reduce((sum, subtask) => sum + (subtask.estimateHours ?? 0), 0)
}
