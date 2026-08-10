// Fixed job-title/seniority union, not a DB collection — each value maps to
// a hardcoded default capacity percentage via the constant below. See
// CONTEXT.md ("Role", "Effective capacity percentage").
export type Role = 'TL' | 'ATL' | 'SSE' | 'SE' | 'SQA' | 'QA' | 'Intern'

export const ROLES: Role[] = ['TL', 'ATL', 'SSE', 'SE', 'SQA', 'QA', 'Intern']

// Seeded from the reference spreadsheet's role defaults. Effective capacity
// % is computed, never stored: TeamMembership.capacityPercentOverride ??
// ROLE_DEFAULT_CAPACITY_PERCENT[role].
export const ROLE_DEFAULT_CAPACITY_PERCENT: Record<Role, number> = {
  TL: 50,
  ATL: 70,
  SSE: 80,
  SE: 80,
  SQA: 80,
  QA: 80,
  Intern: 50,
}
