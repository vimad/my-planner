import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest'
import type { Types } from 'mongoose'

interface MockedTicketModel {
  find: Mock
}
interface MockedTicketDevQaOverrideModel {
  findOne: Mock
}

vi.mock('../src/models/Ticket.ts', () => ({
  Ticket: { find: vi.fn() },
}))
vi.mock('../src/models/TicketDevQaOverride.ts', () => ({
  TicketDevQaOverride: { findOne: vi.fn() },
}))

const { Ticket } = (await import('../src/models/Ticket.ts')) as unknown as { Ticket: MockedTicketModel }
const { TicketDevQaOverride } = (await import('../src/models/TicketDevQaOverride.ts')) as unknown as {
  TicketDevQaOverride: MockedTicketDevQaOverrideModel
}
const { isSplitTicket, resolveDevQa, roleSubtaskEstimateHours } = await import('../src/services/devQaResolution.ts')

function personId(id: string): Types.ObjectId {
  return id as unknown as Types.ObjectId
}

const ticket = { _id: 't-1' as unknown as Types.ObjectId, jiraKey: 'WOSMVP-100' }

const membershipAda = { personId: personId('person-ada'), jiraAccountId: 'acct-ada' }
const membershipBob = { personId: personId('person-bob'), jiraAccountId: 'acct-bob' }
const memberships = [membershipAda, membershipBob]

function subtask(overrides: Record<string, unknown> = {}) {
  return {
    subtaskKind: 'Dev',
    assigneeAccountId: null,
    assigneeDisplayName: null,
    assigneeEmail: null,
    ...overrides,
  }
}

describe('isSplitTicket', () => {
  it('is true for Story and Bug, false for everything else (including null/undefined)', () => {
    expect(isSplitTicket('Story')).toBe(true)
    expect(isSplitTicket('Bug')).toBe(true)
    expect(isSplitTicket('Task')).toBe(false)
    expect(isSplitTicket('Sub-task')).toBe(false)
    expect(isSplitTicket(null)).toBe(false)
    expect(isSplitTicket(undefined)).toBe(false)
  })
})

describe('resolveDevQa', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('resolves dev via a TicketDevQaOverride, full stop, even when a real mapped Sub-task also exists', async () => {
    TicketDevQaOverride.findOne.mockResolvedValue({ devPersonId: personId('person-ada'), qaPersonId: null })
    // A real [Dev] sub-task assigned to Bob exists too — the Override must
    // still win per ADR 0004, never even weighed against it.
    Ticket.find.mockResolvedValue([subtask({ subtaskKind: 'Dev', assigneeAccountId: 'acct-bob' })])

    const resolution = await resolveDevQa(ticket, memberships)

    expect(resolution.dev).toEqual({ status: 'resolved', source: 'override', personId: personId('person-ada') })
  })

  it('resolves via a real mapped Sub-task assignee when no Override is set for that role', async () => {
    TicketDevQaOverride.findOne.mockResolvedValue(null)
    Ticket.find.mockResolvedValue([subtask({ subtaskKind: 'Dev', assigneeAccountId: 'acct-bob' })])

    const resolution = await resolveDevQa(ticket, memberships)

    expect(resolution.dev).toEqual({ status: 'resolved', source: 'subtask', personId: personId('person-bob') })
  })

  it('resolves to unmapped when a real Sub-task assignee does not match any current TeamMembership', async () => {
    TicketDevQaOverride.findOne.mockResolvedValue(null)
    Ticket.find.mockResolvedValue([
      subtask({
        subtaskKind: 'Test',
        assigneeAccountId: 'acct-outsider',
        assigneeDisplayName: 'Outside Contractor',
        assigneeEmail: 'outsider@example.com',
      }),
    ])

    const resolution = await resolveDevQa(ticket, memberships)

    expect(resolution.qa).toEqual({
      status: 'unmapped',
      assigneeAccountId: 'acct-outsider',
      assigneeDisplayName: 'Outside Contractor',
      assigneeEmail: 'outsider@example.com',
    })
  })

  it('resolves to needs-assignment when no Sub-task of that kind exists and no Override is set', async () => {
    TicketDevQaOverride.findOne.mockResolvedValue(null)
    Ticket.find.mockResolvedValue([]) // no [Dev] or [Test] sub-task at all

    const resolution = await resolveDevQa(ticket, memberships)

    expect(resolution.dev).toEqual({ status: 'needs-assignment' })
    expect(resolution.qa).toEqual({ status: 'needs-assignment' })
  })

  it('resolves to needs-assignment when a Sub-task of that kind exists but is unassigned', async () => {
    TicketDevQaOverride.findOne.mockResolvedValue(null)
    Ticket.find.mockResolvedValue([subtask({ subtaskKind: 'Dev', assigneeAccountId: null })])

    const resolution = await resolveDevQa(ticket, memberships)

    expect(resolution.dev).toEqual({ status: 'needs-assignment' })
  })

  it('resolves dev and qa fully independently on the same ticket (dev via Override, qa needs-assignment)', async () => {
    TicketDevQaOverride.findOne.mockResolvedValue({ devPersonId: personId('person-ada'), qaPersonId: null })
    Ticket.find.mockResolvedValue([]) // no real sub-tasks at all

    const resolution = await resolveDevQa(ticket, memberships)

    expect(resolution.dev).toEqual({ status: 'resolved', source: 'override', personId: personId('person-ada') })
    expect(resolution.qa).toEqual({ status: 'needs-assignment' })
  })

  it('resolves dev via a mapped Sub-task while qa is unmapped, on the same ticket', async () => {
    TicketDevQaOverride.findOne.mockResolvedValue(null)
    Ticket.find.mockResolvedValue([
      subtask({ subtaskKind: 'Dev', assigneeAccountId: 'acct-ada' }),
      subtask({ subtaskKind: 'Test', assigneeAccountId: 'acct-outsider' }),
    ])

    const resolution = await resolveDevQa(ticket, memberships)

    expect(resolution.dev).toEqual({ status: 'resolved', source: 'subtask', personId: personId('person-ada') })
    expect(resolution.qa.status).toBe('unmapped')
  })

  it('queries Ticket for parentKey + subtaskKind in [Dev, Test], and TicketDevQaOverride by ticketId', async () => {
    TicketDevQaOverride.findOne.mockResolvedValue(null)
    Ticket.find.mockResolvedValue([])

    await resolveDevQa(ticket, memberships)

    expect(Ticket.find).toHaveBeenCalledWith({ parentKey: 'WOSMVP-100', subtaskKind: { $in: ['Dev', 'Test'] } })
    expect(TicketDevQaOverride.findOne).toHaveBeenCalledWith({ ticketId: ticket._id })
  })

  it("an Override survives a resync that changes the ticket's cached Sub-task data", async () => {
    // Before: Override picks Ada for dev; the real [Dev] sub-task (if any)
    // is irrelevant. Simulate a resync that changed the cached [Dev]
    // sub-task's assignee to Bob (e.g. Jira caught up) — resolveDevQa is
    // re-run against the *new* cached data and must still resolve to Ada,
    // since ticketSync.ts's Ticket upserts never touch TicketDevQaOverride.
    TicketDevQaOverride.findOne.mockResolvedValue({ devPersonId: personId('person-ada'), qaPersonId: null })
    Ticket.find.mockResolvedValueOnce([subtask({ subtaskKind: 'Dev', assigneeAccountId: null })])
    const before = await resolveDevQa(ticket, memberships)

    Ticket.find.mockResolvedValueOnce([subtask({ subtaskKind: 'Dev', assigneeAccountId: 'acct-bob' })])
    const after = await resolveDevQa(ticket, memberships)

    expect(before.dev).toEqual({ status: 'resolved', source: 'override', personId: personId('person-ada') })
    expect(after.dev).toEqual({ status: 'resolved', source: 'override', personId: personId('person-ada') })
  })
})

describe('roleSubtaskEstimateHours', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('sums estimateHours across every Sub-task of that kind, treating a null estimate as 0', async () => {
    Ticket.find.mockResolvedValue([{ estimateHours: 5 }, { estimateHours: null }])
    const hours = await roleSubtaskEstimateHours('WOSMVP-100', 'Dev')
    expect(Ticket.find).toHaveBeenCalledWith({ parentKey: 'WOSMVP-100', subtaskKind: 'Dev' })
    expect(hours).toBe(5)
  })

  it('returns 0 when no Sub-task of that kind exists', async () => {
    Ticket.find.mockResolvedValue([])
    const hours = await roleSubtaskEstimateHours('WOSMVP-100', 'Test')
    expect(hours).toBe(0)
  })

  it('returns 0 when the only Sub-task of that kind has no estimate', async () => {
    Ticket.find.mockResolvedValue([{ estimateHours: null }])
    const hours = await roleSubtaskEstimateHours('WOSMVP-100', 'Test')
    expect(hours).toBe(0)
  })
})
