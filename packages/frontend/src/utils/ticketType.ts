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
