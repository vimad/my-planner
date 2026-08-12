import type { Role } from '../types'

// Mirrors packages/backend/src/models/Role.ts exactly - a fixed TS union,
// not fetched from the API, so both sides hardcode the same values rather
// than the frontend round-tripping through a request just to render a
// <select> and a placeholder.
export const ROLES: Role[] = ['TL', 'ATL', 'SSE', 'SE', 'SQA', 'QA', 'QA Intern', 'Dev Intern', 'PO']

// PO has no capacity concept (Planning excludes every PO membership before
// this is ever read - see PlanningView.tsx's planningMemberships) - 0 is a
// placeholder value, never actually used in a computation.
export const ROLE_DEFAULT_CAPACITY_PERCENT: Record<Role, number> = {
  TL: 50,
  ATL: 70,
  SSE: 80,
  SE: 80,
  SQA: 80,
  QA: 80,
  'QA Intern': 50,
  'Dev Intern': 50,
  PO: 0,
}

// Which roles count as "dev" vs "qa" for reassignment pickers (Dev/QA
// Assignment popup) - a role not in either list simply can't be picked for
// either slot. Doesn't gate what the backend accepts (dev-qa-override has no
// server-side role check), only which memberships a picker offers.
export const DEV_ROLES: Role[] = ['TL', 'ATL', 'SSE', 'SE', 'Dev Intern']
export const QA_ROLES: Role[] = ['SQA', 'QA', 'QA Intern']
