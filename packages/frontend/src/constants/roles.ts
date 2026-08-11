import type { Role } from '../types'

// Mirrors packages/backend/src/models/Role.ts exactly - a fixed TS union,
// not fetched from the API, so both sides hardcode the same values rather
// than the frontend round-tripping through a request just to render a
// <select> and a placeholder.
export const ROLES: Role[] = ['TL', 'ATL', 'SSE', 'SE', 'SQA', 'QA', 'QA Intern', 'Dev Intern']

export const ROLE_DEFAULT_CAPACITY_PERCENT: Record<Role, number> = {
  TL: 50,
  ATL: 70,
  SSE: 80,
  SE: 80,
  SQA: 80,
  QA: 80,
  'QA Intern': 50,
  'Dev Intern': 50,
}
