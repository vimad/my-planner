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
// isSplitTicket is real (a trivial pure predicate) — only the two
// DB-touching functions are mocked, same posture as computeEffortHours
// above: the route's own wiring is under test here, resolveDevQa's actual
// resolution logic gets its own coverage in devQaResolution.test.ts.
vi.mock('../src/services/devQaResolution.ts', () => ({
  isSplitTicket: (type: unknown) => type === 'Story' || type === 'Bug',
  resolveDevQa: vi.fn(),
  roleSubtaskEstimateHours: vi.fn(),
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
const { resolveDevQa, roleSubtaskEstimateHours } = (await import('../src/services/devQaResolution.ts')) as unknown as {
  resolveDevQa: Mock
  roleSubtaskEstimateHours: Mock
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

  it("defaults 'QA Intern' and 'Dev Intern' to a 50% effectivePercentage when no override is set", async () => {
    TeamSprintPlan.findOne.mockResolvedValue({ workingDays: 8 })
    TeamMembership.find.mockReturnValue(
      withPopulate([
        membership({ role: 'QA Intern', capacityPercentOverride: null }),
        membership({ role: 'Dev Intern', capacityPercentOverride: null, personId: { _id: 'p2', jiraAccountId: 'acct-b' } }),
      ]),
    )
    CapacityEntry.findOne.mockResolvedValue(null)
    CapacityLookup.find.mockResolvedValue([])
    SprintPlanEntry.find.mockReturnValue(withPopulate([]))

    const app = createApp()
    const res = await request(app).get('/api/teams/t1/sprints/s1/capacity')

    expect(res.status).toBe(200)
    expect(res.body).toHaveLength(2)
    expect(res.body[0]).toMatchObject({ role: 'QA Intern', effectivePercentage: 50 })
    expect(res.body[1]).toMatchObject({ role: 'Dev Intern', effectivePercentage: 50 })
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

  describe('Split ticket (Story/Bug) Planned — ticket 23', () => {
    function twoMemberships() {
      return [
        membership({ _id: 'm1', personId: { _id: 'p1', name: 'Ada', jiraAccountId: 'acct-a' } }),
        membership({ _id: 'm2', personId: { _id: 'p2', name: 'Bob', jiraAccountId: 'acct-b' } }),
      ]
    }

    it("sums only the ticket's own [Dev]/[Test] Sub-task estimate onto whichever person each role resolves to — never the parent's own estimateHours, never computeEffortHours", async () => {
      TeamSprintPlan.findOne.mockResolvedValue({ workingDays: 10 })
      TeamMembership.find.mockReturnValue(withPopulate(twoMemberships()))
      CapacityEntry.findOne.mockResolvedValue({ leaveDays: 0 })
      CapacityLookup.find.mockResolvedValue([])
      SprintPlanEntry.find.mockReturnValue(
        withPopulate([
          { ticketId: { jiraKey: 'WOSMVP-10', type: 'Story', assigneeAccountId: null, estimateHours: 999 } },
        ]),
      )
      resolveDevQa.mockResolvedValue({
        dev: { status: 'resolved', source: 'subtask', personId: 'p1' },
        qa: { status: 'resolved', source: 'subtask', personId: 'p2' },
      })
      roleSubtaskEstimateHours.mockImplementation(async (jiraKey: string, kind: string) => (kind === 'Dev' ? 5 : 3))

      const app = createApp()
      const res = await request(app).get('/api/teams/t1/sprints/s1/capacity')

      expect(res.status).toBe(200)
      expect(computeEffortHours).not.toHaveBeenCalled()
      expect(roleSubtaskEstimateHours).toHaveBeenCalledWith('WOSMVP-10', 'Dev')
      expect(roleSubtaskEstimateHours).toHaveBeenCalledWith('WOSMVP-10', 'Test')
      const byPerson = Object.fromEntries(res.body.map((c: { personId: string; planned: number }) => [c.personId, c.planned]))
      expect(byPerson.p1).toBe(5)
      expect(byPerson.p2).toBe(3)
    })

    it('a role resolved (e.g. via Override) with no real Sub-task of that kind contributes 0, and a needs-assignment role is never queried for hours', async () => {
      TeamSprintPlan.findOne.mockResolvedValue({ workingDays: 10 })
      TeamMembership.find.mockReturnValue(withPopulate([membership({ personId: { _id: 'p1', jiraAccountId: 'acct-a' } })]))
      CapacityEntry.findOne.mockResolvedValue({ leaveDays: 0 })
      CapacityLookup.find.mockResolvedValue([])
      SprintPlanEntry.find.mockReturnValue(
        withPopulate([{ ticketId: { jiraKey: 'WOSMVP-11', type: 'Bug', assigneeAccountId: null } }]),
      )
      resolveDevQa.mockResolvedValue({
        dev: { status: 'resolved', source: 'override', personId: 'p1' },
        qa: { status: 'needs-assignment' },
      })
      roleSubtaskEstimateHours.mockResolvedValue(0)

      const app = createApp()
      const res = await request(app).get('/api/teams/t1/sprints/s1/capacity')

      expect(res.status).toBe(200)
      expect(roleSubtaskEstimateHours).toHaveBeenCalledTimes(1)
      expect(roleSubtaskEstimateHours).toHaveBeenCalledWith('WOSMVP-11', 'Dev')
      expect(res.body[0].planned).toBe(0)
    })

    it("a Split ticket never falls into the non-split assigneeAccountId/computeEffortHours path, even when the parent's own assigneeAccountId happens to match a person", async () => {
      TeamSprintPlan.findOne.mockResolvedValue({ workingDays: 10 })
      TeamMembership.find.mockReturnValue(withPopulate([membership({ personId: { _id: 'p1', jiraAccountId: 'acct-a' } })]))
      CapacityEntry.findOne.mockResolvedValue({ leaveDays: 0 })
      CapacityLookup.find.mockResolvedValue([])
      SprintPlanEntry.find.mockReturnValue(
        withPopulate([
          { ticketId: { jiraKey: 'WOSMVP-12', type: 'Story', assigneeAccountId: 'acct-a', estimateHours: 999 } },
        ]),
      )
      resolveDevQa.mockResolvedValue({ dev: { status: 'needs-assignment' }, qa: { status: 'needs-assignment' } })

      const app = createApp()
      const res = await request(app).get('/api/teams/t1/sprints/s1/capacity')

      expect(res.status).toBe(200)
      expect(computeEffortHours).not.toHaveBeenCalled()
      expect(roleSubtaskEstimateHours).not.toHaveBeenCalled()
      expect(res.body[0].planned).toBe(0)
    })
  })
})
