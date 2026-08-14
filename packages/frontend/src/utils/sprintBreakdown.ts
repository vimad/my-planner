// Sprint Breakdown card's aggregation (.scratch/sprint-breakdown-card/
// map.md's Notes): duplicates just enough of PlanningView's
// ticketsByMembershipId placement-resolution logic to know which membership
// (if any) each hours-contributing placement lands on, since that
// computation isn't exported from PlanningView. Validated as a prototype
// (branch prototype/sprint-breakdown-card,
// components/prototypeSprintBreakdown/sprintBreakdownMath.ts) against an
// in-memory isFeature stub — now reading the real `entry.isFeature` field
// the backend populates (routes/sprintPlanEntries.ts) instead.
import { DEV_ROLES } from '../constants/roles'
import { getId } from './getId'
import { buildMembershipIdByPersonId } from './ticketPlacements'
import { ticketTypeAccent } from './ticketType'
import type { SprintPlanEntry, TeamMembership } from '../types'

export type Bucket = 'Features' | 'Technical items' | 'Bugs'

export const BUCKETS: Bucket[] = ['Features', 'Technical items', 'Bugs']

// Pale strength of the app's existing story=green/task=blue/bug=red hues
// (typeColorClasses in PlanningView.tsx), per the map's Notes.
export const BUCKET_COLOR: Record<Bucket, string> = {
  Features: '#86efac', // Tailwind green-300
  'Technical items': '#93c5fd', // Tailwind blue-300
  Bugs: '#fca5a5', // Tailwind red-300
}

function rolePlannedHours(entry: SprintPlanEntry, role: 'dev' | 'qa' | undefined): number {
  if (role === 'dev') return entry.devPlannedHours ?? 0
  if (role === 'qa') return entry.qaPlannedHours ?? 0
  return entry.plannedHours ?? 0
}

function bucketFor(entry: SprintPlanEntry): Bucket {
  const accent = ticketTypeAccent(entry.ticketId.type)
  if (accent === 'story') return 'Features'
  if (accent === 'bug') return 'Bugs'
  return entry.isFeature ? 'Features' : 'Technical items'
}

export interface BreakdownSlice {
  bucket: Bucket
  hours: number
  percent: number
  color: string
}

export interface Breakdown {
  totalHours: number
  slices: BreakdownSlice[]
}

export function computeSprintBreakdown(entries: SprintPlanEntry[], memberships: TeamMembership[]): Breakdown {
  const devMembershipIds = new Set(memberships.filter((m) => DEV_ROLES.includes(m.role)).map((m) => getId(m) ?? ''))
  const membershipIdByAccountId = new Map(memberships.map((m) => [m.personId.jiraAccountId, getId(m) ?? '']))
  const membershipIdByPersonId = buildMembershipIdByPersonId(memberships)

  const totals: Record<Bucket, number> = { Features: 0, 'Technical items': 0, Bugs: 0 }

  // A Split ticket's qa-role placement is never counted (map's Notes) - role
  // === 'qa' bails before the membership-row check even runs.
  function credit(entry: SprintPlanEntry, role: 'dev' | 'qa' | undefined, membershipId: string | undefined) {
    if (role === 'qa') return
    if (!membershipId || !devMembershipIds.has(membershipId)) return
    totals[bucketFor(entry)] += rolePlannedHours(entry, role)
  }

  for (const entry of entries) {
    if (entry.devQa) {
      for (const role of ['dev', 'qa'] as const) {
        const resolution = entry.devQa[role]
        if (resolution.status === 'resolved') {
          credit(entry, role, membershipIdByPersonId.get(resolution.personId))
        }
        // unmapped/needs-assignment placements have no TeamMembership row at
        // all, so they're excluded by construction - nothing further to do.
      }
    } else {
      const membershipId = entry.assigneeOverridePersonId
        ? membershipIdByPersonId.get(entry.assigneeOverridePersonId)
        : entry.ticketId.assigneeAccountId
          ? membershipIdByAccountId.get(entry.ticketId.assigneeAccountId)
          : undefined
      credit(entry, undefined, membershipId)
    }
  }

  const totalHours = totals.Features + totals['Technical items'] + totals.Bugs

  // Percentage rounding: largest-remainder method, so the three slices'
  // rounded whole-percent figures always sum to exactly 100 rather than
  // drifting to 99 or 101 the way independently-rounded figures can.
  const raw = BUCKETS.map((b) => (totalHours > 0 ? (totals[b] / totalHours) * 100 : 0))
  const floors = raw.map(Math.floor)
  let remainder = 100 - floors.reduce((a, b) => a + b, 0)
  const byRemainderDesc = BUCKETS.map((_, i) => i).sort((a, b) => (raw[b] - floors[b]) - (raw[a] - floors[a]))
  const percents = [...floors]
  for (const i of byRemainderDesc) {
    if (remainder <= 0) break
    percents[i] += 1
    remainder -= 1
  }

  const slices: BreakdownSlice[] = BUCKETS.map((b, i) => ({
    bucket: b,
    hours: totals[b],
    percent: totalHours > 0 ? percents[i] : 0,
    color: BUCKET_COLOR[b],
  }))

  return { totalHours, slices }
}
