// Shared bug/story/task classification, used by both Planning's ticket
// badges and Status's ticket cards so a ticket's color-coding means the same
// thing on both surfaces. Substring-matched since `type` is Jira's raw
// issuetype.name, not a closed enum (e.g. "Dev Story" still buckets as a
// story). Each surface still hand-writes its own Tailwind class string per
// docs/ui-conventions.md - only this classification is shared.
export type TicketTypeAccent = 'bug' | 'story' | 'task'

export function ticketTypeAccent(type: string | null): TicketTypeAccent | null {
  const t = type?.toLowerCase() ?? ''
  if (t.includes('bug')) return 'bug'
  if (t.includes('story')) return 'story'
  if (t.includes('task')) return 'task'
  return null
}

// Jira's own issuetype.name for a Story, exact match (unlike
// ticketTypeAccent's substring match above) - mirrors the backend's
// devQaResolution.ts::isPoEligibleTicket exactly. PO assignment applies to a
// Story ticket only, never a Bug even though both get ticketTypeAccent's
// 'story'/'bug' treatment elsewhere.
export function isPoEligibleTicket(type: string | null | undefined): boolean {
  return type === 'Story'
}

// Jira's own issuetype.name for a Story or Bug - the two types Planning
// tracks as independent dev/qa roles rather than one shared assignee (see
// CONTEXT.md "Split ticket"). Mirrors the backend's devQaResolution.ts::
// isSplitTicket exactly. Needed frontend-side by AddFromBacklogPopover.tsx
// (ticket 02 of .scratch/add-from-backlog), since a raw backlog search
// result has no `devQa` object yet to branch on the way an already-added
// SprintPlanEntry does.
export function isSplitTicket(type: string | null | undefined): boolean {
  return type === 'Story' || type === 'Bug'
}
