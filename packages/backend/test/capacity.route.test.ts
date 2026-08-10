import request from 'supertest'
import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest'

interface MockedTeamSprintPlanModel {
  findOne: Mock
}
interface MockedTeamMembershipModel {
  find: Mock
}
interface MockedCapacityEntryModel {
  findOne: Mock
}
interface MockedCapacityLookupModel {
  find: Mock
}
interface MockedSprintPlanEntryModel {
  find: Mock
}

vi.mock('../src/models/TeamSprintPlan.ts', () => ({
  TeamSprintPlan: { findOne: vi.fn() },
}))
vi.mock('../src/models/TeamMembership.ts', () => ({
  TeamMembership: { find: vi.fn() },
}))
vi.mock('../src/models/CapacityEntry.ts', () => ({
  CapacityEntry: { findOne: vi.fn() },
}))
vi.mock('../src/models/CapacityLookup.ts', () => ({
  CapacityLookup: { find: vi.fn() },
}))
vi.mock('../src/models/SprintPlanEntry.ts', () => ({
  SprintPlanEntry: { find: vi.fn() },
}))
vi.mock('../src/services/ticketSync.ts', () => ({
  computeEffortHours: vi.fn(),
}))

const { TeamSprintPlan } = (await import('../src/models/TeamSprintPlan.ts')) as unknown as {
  TeamSprintPlan: MockedTeamSprintPlanModel
}
const { TeamMembership } = (await import('../src/models/TeamMembership.ts')) as unknown as {
  TeamMembership: MockedTeamMembershipModel
}
const { CapacityEntry } = (await import('../src/models/CapacityEntry.ts')) as unknown as {
  CapacityEntry: MockedCapacityEntryModel
}
const { CapacityLookup } = (await import('../src/models/CapacityLookup.ts')) as unknown as {
  CapacityLookup: MockedCapacityLookupModel
}
const { SprintPlanEntry } = (await import('../src/models/SprintPlanEntry.ts')) as unknown as {
  SprintPlanEntry: MockedSprintPlanEntryModel
}
const { computeEffortHours } = (await import('../src/services/ticketSync.ts')) as unknown as {
  computeEffortHours: Mock
}
const { createApp } = await import('../src/app.ts')

function membership(overrides: Record<string, unknown> = {}) {
  return {
    _id: 'm1',
    teamId: 't1',
    role: 'SE',
    capacityPercentOverride: null,
    personId: { _id: 'p1', name: 'Ada Lovelace', jiraAccountId: 'acct-a' },
    ...overrides,
  }
}

function withPopulate(result: unknown) {
  return { populate: vi.fn().mockResolvedValue(result) }
}

describe('GET /api/teams/:teamId/sprints/:sprintId/capacity', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns 404 when no TeamSprintPlan (working days) has been entered for this sprint', async () => {
    TeamSprintPlan.findOne.mockResolvedValue(null)

    const app = createApp()
    const res = await request(app).get('/api/teams/t1/sprints/s1/capacity')

    expect(res.status).toBe(404)
    expect(TeamMembership.find).not.toHaveBeenCalled()
  })

  it('reconciles the worked example (10-day sprint, 1 day leave -> Total = 72) and hits the CapacityLookup row', async () => {
    TeamSprintPlan.findOne.mockResolvedValue({ workingDays: 10 })
    TeamMembership.find.mockReturnValue(withPopulate([membership()]))
    CapacityEntry.findOne.mockResolvedValue({ leaveDays: 1 })
    CapacityLookup.find.mockResolvedValue([{ percentage: 80, days: 9, hours: 58 }])
    SprintPlanEntry.find.mockReturnValue(withPopulate([]))

    const app = createApp()
    const res = await request(app).get('/api/teams/t1/sprints/s1/capacity')

    expect(res.status).toBe(200)
    expect(res.body).toHaveLength(1)
    expect(res.body[0]).toMatchObject({
      personId: 'p1',
      role: 'SE',
      effectivePercentage: 80,
      leaveDays: 1,
      total: 72,
      available: 58,
      planned: 0,
      remaining: 58,
    })
  })

  it('falls back to Total x (effectivePercentage / 100) when no CapacityLookup row matches', async () => {
    TeamSprintPlan.findOne.mockResolvedValue({ workingDays: 10 })
    TeamMembership.find.mockReturnValue(withPopulate([membership()]))
    CapacityEntry.findOne.mockResolvedValue({ leaveDays: 1 })
    CapacityLookup.find.mockResolvedValue([]) // no matching row
    SprintPlanEntry.find.mockReturnValue(withPopulate([]))

    const app = createApp()
    const res = await request(app).get('/api/teams/t1/sprints/s1/capacity')

    expect(res.status).toBe(200)
    expect(res.body[0].available).toBe(72 * 0.8)
  })

  it('defaults leaveDays to 0 and effectivePercentage to the role default when neither is set', async () => {
    TeamSprintPlan.findOne.mockResolvedValue({ workingDays: 8 })
    TeamMembership.find.mockReturnValue(withPopulate([membership({ role: 'SE', capacityPercentOverride: null })]))
    CapacityEntry.findOne.mockResolvedValue(null) // no CapacityEntry doc at all
    CapacityLookup.find.mockResolvedValue([])
    SprintPlanEntry.find.mockReturnValue(withPopulate([]))

    const app = createApp()
    const res = await request(app).get('/api/teams/t1/sprints/s1/capacity')

    expect(res.status).toBe(200)
    expect(res.body[0]).toMatchObject({ leaveDays: 0, effectivePercentage: 80, total: 64 })
  })

  it("sums Planned only across tickets whose current assignee matches this person, ignoring who added the entry", async () => {
    TeamSprintPlan.findOne.mockResolvedValue({ workingDays: 10 })
    TeamMembership.find.mockReturnValue(withPopulate([membership({ personId: { _id: 'p1', jiraAccountId: 'acct-a' } })]))
    CapacityEntry.findOne.mockResolvedValue({ leaveDays: 0 })
    CapacityLookup.find.mockResolvedValue([])
    SprintPlanEntry.find.mockReturnValue(
      withPopulate([
        { ticketId: { jiraKey: 'WOSMVP-1', assigneeAccountId: 'acct-a', estimateHours: 5 } }, // matches
        { ticketId: { jiraKey: 'WOSMVP-2', assigneeAccountId: 'acct-b', estimateHours: 8 } }, // different current assignee
      ]),
    )
    computeEffortHours.mockResolvedValueOnce(5)

    const app = createApp()
    const res = await request(app).get('/api/teams/t1/sprints/s1/capacity')

    expect(res.status).toBe(200)
    expect(computeEffortHours).toHaveBeenCalledTimes(1)
    expect(computeEffortHours).toHaveBeenCalledWith({ jiraKey: 'WOSMVP-1', assigneeAccountId: 'acct-a', estimateHours: 5 })
    expect(res.body[0].planned).toBe(5)
  })

  it('treats a null Effort (no estimate anywhere) as 0 towards Planned', async () => {
    TeamSprintPlan.findOne.mockResolvedValue({ workingDays: 10 })
    TeamMembership.find.mockReturnValue(withPopulate([membership()]))
    CapacityEntry.findOne.mockResolvedValue({ leaveDays: 0 })
    CapacityLookup.find.mockResolvedValue([])
    SprintPlanEntry.find.mockReturnValue(
      withPopulate([{ ticketId: { jiraKey: 'WOSMVP-3', assigneeAccountId: 'acct-a', estimateHours: null } }]),
    )
    computeEffortHours.mockResolvedValueOnce(null)

    const app = createApp()
    const res = await request(app).get('/api/teams/t1/sprints/s1/capacity')

    expect(res.status).toBe(200)
    expect(res.body[0].planned).toBe(0)
  })
})
