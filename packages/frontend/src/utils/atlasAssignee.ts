// AtlasTask only stores `assigneeAccountId` (backend models/AtlasTask.ts:
// "the only field this stores... informational only") - unlike
// Ticket.assigneeDisplayName elsewhere in the app, there's no display name
// synced from Jira for an Atlas task's assignee. AtlasTaskBoard.tsx shows a
// real name anyway by cross-referencing the same non-team-scoped
// `GET /api/people` directory StatusView's roster is built from (see
// hooks/usePeopleDirectory.ts) - a task assigned to someone already tracked
// as a Person here resolves to their name; a real Jira assignee who was
// never entered as a Person falls back to an "Unmapped" badge, same concept
// as PlanningView's off-roster badge (docs/ui-conventions.md's amber
// Unmapped convention). If this cross-reference proves worth keeping
// long-term, the real fix is adding assigneeDisplayName to AtlasTask/
// atlasSync.ts so it isn't needed at all.
import type { Person } from '../types'

export interface AssigneeInfo {
  // Stable identity for filter selection/grouping - the real accountId when
  // there is one, else one of two synthetic buckets.
  key: string
  label: string
  kind: 'named' | 'unmapped' | 'unassigned'
}

export function resolveAssignee(accountId: string | null, peopleByAccountId: Map<string, Person>): AssigneeInfo {
  if (!accountId) return { key: 'unassigned', label: 'Unassigned', kind: 'unassigned' }
  const person = peopleByAccountId.get(accountId)
  if (person) return { key: accountId, label: person.name, kind: 'named' }
  return { key: accountId, label: 'Unmapped assignee', kind: 'unmapped' }
}
