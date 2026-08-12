import type { DragEndEvent } from '@dnd-kit/core'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { useRef, type ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from 'vitest'
import { PlanningView } from './PlanningView'
import { computeWorkingDates } from '../utils/sprintWorkingDates'
import type {
  DevQaRoleResolution,
  Epic,
  LeaveEntry,
  Person,
  Sprint,
  SprintCapacity,
  SprintPlanEntry,
  Team,
  TeamMembership,
  Ticket,
} from '../types'

// dnd-kit's real drag gesture recognition needs real layout
// (getBoundingClientRect) that jsdom can't provide, so pointer/keyboard drag
// physics aren't ours to re-test here - dnd-kit owns that contract. Instead,
// DndContext is stubbed to hand back its onDragEnd callback directly,
// same approach BoardsView.test.tsx/TodoDetail.test.tsx already established.
// PlanningView mounts one independent DndContext per person row (ticket 19's
// "no cross-row dragging"), so - unlike those single-DndContext views - each
// mounted DndContext is captured by row-mount-order index (stable across
// re-renders via useRef, since membership row order never changes) rather
// than a single shared variable.
let dragEndByRowIndex: Array<(event: DragEndEvent) => void | Promise<void>> = []
let nextRowIndex = 0
vi.mock('@dnd-kit/core', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@dnd-kit/core')>()
  return {
    ...actual,
    DndContext: ({
      children,
      onDragEnd,
    }: {
      children: ReactNode
      onDragEnd: (event: DragEndEvent) => void | Promise<void>
    }) => {
      const indexRef = useRef<number | null>(null)
      if (indexRef.current === null) indexRef.current = nextRowIndex++
      dragEndByRowIndex[indexRef.current] = onDragEnd
      return children
    },
  }
})
vi.mock('@dnd-kit/sortable', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@dnd-kit/sortable')>()
  return {
    ...actual,
    SortableContext: ({ children }: { children: ReactNode }) => children,
    useSortable: () => ({
      attributes: {},
      listeners: {},
      setNodeRef: () => {},
      transform: null,
      transition: null,
      isDragging: false,
    }),
  }
})

interface FakeResponse {
  ok: boolean
  status: number
  json: () => Promise<unknown>
}

interface FetchCallInit {
  method?: string
  headers?: Record<string, string>
  body?: string
}

type FetchMock = Mock<(url: string, init?: FetchCallInit) => Promise<FakeResponse>>

function jsonResponse(body: unknown, status = 200): Promise<FakeResponse> {
  return Promise.resolve({ ok: status < 400, status, json: () => Promise.resolve(body) })
}

const team: Team = { _id: 'team-a', name: 'Team A', jiraLabels: ['team-a-label'] }
const sprint: Sprint = { _id: 'sprint-1', jiraSprintId: '132', name: 'WOSMVP Sprint 132', state: 'active' }

const ada: Person = { _id: 'p1', name: 'Ada Lovelace', email: 'ada@example.com', jiraAccountId: 'acc-1' }
const membershipAda: TeamMembership = { _id: 'm1', teamId: 'team-a', personId: ada, role: 'SE', capacityPercentOverride: null }

// A second roster member - needed for ticket 24's dual-row Split-ticket
// tests (a dev/qa placement landing under two different people's rows) and
// for the DevQaAssignmentPopup's roster <select>.
const grace: Person = { _id: 'p2', name: 'Grace Hopper', email: 'grace@example.com', jiraAccountId: 'acc-2' }
const membershipGrace: TeamMembership = { _id: 'm2', teamId: 'team-a', personId: grace, role: 'QA', capacityPercentOverride: null }

// DevQaRoleResolution builders (ticket 23's discriminated union, mirrored in
// ../types) - one per status, matching services/devQaResolution.ts exactly.
// `jiraAssigneeDisplayName` defaults to the roster name a resolved personId
// maps to (the common case: the Sub-task's own assignee is who it resolved
// to) - pass it explicitly to simulate an Override pointing away from
// Jira's current raw assignee.
const PERSON_DISPLAY_NAMES: Record<string, string> = { p1: ada.name, p2: grace.name }

function resolvedSubtask(
  personId: string,
  jiraAssigneeDisplayName: string | null = PERSON_DISPLAY_NAMES[personId] ?? null,
): DevQaRoleResolution {
  return { status: 'resolved', source: 'subtask', personId, jiraAssigneeDisplayName }
}
function resolvedOverride(personId: string, jiraAssigneeDisplayName: string | null = null): DevQaRoleResolution {
  return { status: 'resolved', source: 'override', personId, jiraAssigneeDisplayName }
}
function needsAssignment(jiraAssigneeDisplayName: string | null = null): DevQaRoleResolution {
  return { status: 'needs-assignment', jiraAssigneeDisplayName }
}
function unmappedRole(accountId: string, displayName: string): DevQaRoleResolution {
  return {
    status: 'unmapped',
    assigneeAccountId: accountId,
    assigneeDisplayName: displayName,
    assigneeEmail: null,
    jiraAssigneeDisplayName: displayName,
  }
}

function ticket(overrides: Partial<Ticket> & { jiraKey: string; assigneeAccountId: string | null }): Ticket {
  return {
    _id: overrides.jiraKey,
    type: 'Story',
    title: 'A ticket',
    status: 'To Do',
    assigneeDisplayName: null,
    assigneeEmail: null,
    estimateHours: 4,
    labels: [],
    stream: null,
    epicKey: null,
    parentKey: null,
    subtaskKind: null,
    currentSprintKey: null,
    lastSyncedAt: new Date().toISOString(),
    ...overrides,
  }
}

const adaTicket = ticket({ jiraKey: 'WOSMVP-100', assigneeAccountId: 'acc-1', title: 'Fix login' })
const unmappedTicket = ticket({ jiraKey: 'WOSMVP-150', assigneeAccountId: 'acc-x', title: 'Mystery ticket' })
const newTicket = ticket({ jiraKey: 'WOSMVP-200', assigneeAccountId: 'acc-1', title: 'New feature' })

// Ticket 24 fixtures - each pairs an add-to-plan jiraKey with the devQa
// GET would resolve for it, driving the "Add to plan -> POST (no devQa,
// see routes/sprintPlanEntries.ts) -> refreshPlan -> GET (devQa-decorated)"
// round trip that the auto-open-popup tests exercise.
const splitTicket = ticket({ jiraKey: 'WOSMVP-300', assigneeAccountId: null, title: 'Split feature' })
const splitDevQa = { dev: resolvedSubtask('p1'), qa: resolvedSubtask('p2') }

const needsQaTicket = ticket({ jiraKey: 'WOSMVP-400', assigneeAccountId: null, title: 'Needs QA' })
const needsQaDevQa = { dev: resolvedSubtask('p1'), qa: needsAssignment() }

const fullyResolvedAddTicket = ticket({ jiraKey: 'WOSMVP-500', assigneeAccountId: null, title: 'Fully resolved add' })
const fullyResolvedDevQa = { dev: resolvedSubtask('p1'), qa: resolvedSubtask('p2') }

const nonSplitAddTicket = ticket({ jiraKey: 'WOSMVP-600', assigneeAccountId: 'acc-1', title: 'Non split add', type: 'Task' })

const unmappedQaAddTicket = ticket({ jiraKey: 'WOSMVP-700', assigneeAccountId: null, title: 'Unmapped qa add' })
const unmappedQaDevQa = { dev: resolvedSubtask('p1'), qa: unmappedRole('acc-x', 'Mystery QA') }

const overrideDevTicket = ticket({ jiraKey: 'WOSMVP-800', assigneeAccountId: null, title: 'Override dev' })
const overrideDevQa = { dev: resolvedOverride('p1'), qa: needsAssignment() }

const addTicketCatalog: Record<string, { ticket: Ticket; devQa?: { dev: DevQaRoleResolution; qa: DevQaRoleResolution } }> = {
  'WOSMVP-200': { ticket: newTicket },
  'WOSMVP-300': { ticket: splitTicket, devQa: splitDevQa },
  'WOSMVP-400': { ticket: needsQaTicket, devQa: needsQaDevQa },
  'WOSMVP-500': { ticket: fullyResolvedAddTicket, devQa: fullyResolvedDevQa },
  'WOSMVP-600': { ticket: nonSplitAddTicket },
  'WOSMVP-700': { ticket: unmappedQaAddTicket, devQa: unmappedQaDevQa },
}

const epicRow: Epic = {
  _id: 'epic-1',
  jiraKey: 'WOSMVP-900',
  title: 'Checkout revamp',
  status: 'In Progress',
  lastSyncedAt: new Date().toISOString(),
  childCount: 6,
  doneCount: 2,
}

const capacityRow: SprintCapacity = {
  teamMembershipId: 'm1',
  personId: 'p1',
  personName: 'Ada Lovelace',
  role: 'SE',
  capacityPercentOverride: null,
  effectivePercentage: 80,
  leaveDays: 1,
  extraHours: 0,
  capacityEntryId: 'ce1',
  leaveEntries: [{ date: '2026-08-03', portion: 'full' }],
  total: 72,
  available: 57.6,
  planned: 32,
  remaining: 25.6,
}

let entriesData: SprintPlanEntry[]
let capacityData: SprintCapacity[]
let fetchMock: FetchMock

// Sprint leave grid (`.scratch/sprint-leave-picker/spec.md`) test state:
// recomputes a capacity row's leaveDays/total/available/remaining from a
// posted/patched leaveEntries array the same way capacityFormula.ts's
// fallback branch (no CapacityLookup row) does, so the "Available/Remaining
// figure updates after a save" test has real numbers to assert on.
// `workingDays` is fixed per describe block via the closed-over
// teamSprintPlanDoc rather than recomputed here, since the stub doesn't
// re-derive it from startDate/endDate/holidays - callers keep the two in
// sync by construction (see `sprintLeavePlan` below).
function recomputeCapacityRow(
  row: SprintCapacity,
  leaveEntries: LeaveEntry[],
  workingDays: number,
  extraHours: number,
): SprintCapacity {
  const leaveDays = leaveEntries.reduce((sum, e) => sum + (e.portion === 'full' ? 1 : 0.5), 0)
  const total = (workingDays - leaveDays) * 8
  // extraHours comes off Available unscaled, same as capacityFormula.ts's
  // own (percentage-scaled leave, unscaled extraHours) treatment.
  const available = total * (row.effectivePercentage / 100) - extraHours
  return { ...row, leaveEntries, leaveDays, extraHours, total, available, remaining: available - row.planned }
}

function entry(
  id: string,
  t: Ticket,
  order: number,
  extra?: {
    devOrder?: number | null
    qaOrder?: number | null
    devQa?: { dev: DevQaRoleResolution; qa: DevQaRoleResolution }
    devEstimateHours?: number
    qaEstimateHours?: number
    assigneeOverridePersonId?: string | null
  },
): SprintPlanEntry {
  return {
    _id: id,
    teamId: 'team-a',
    sprintId: 'sprint-1',
    ticketId: t,
    order,
    devOrder: extra?.devOrder ?? null,
    qaOrder: extra?.qaOrder ?? null,
    // `devQa`/estimate fields are present only for a Split entry - omitted
    // (not null) for a non-split one, matching the real GET contract
    // exactly (ticket 23's comments).
    ...(extra?.devQa ? { devQa: extra.devQa } : {}),
    ...(extra?.devEstimateHours != null ? { devEstimateHours: extra.devEstimateHours } : {}),
    ...(extra?.qaEstimateHours != null ? { qaEstimateHours: extra.qaEstimateHours } : {}),
    // Present (possibly null) only for a non-split entry (docs/adr/0005) -
    // omitted here when unset so it doesn't spuriously appear on a Split
    // fixture, matching the real GET contract's "the two never coexist".
    ...(extra && 'assigneeOverridePersonId' in extra ? { assigneeOverridePersonId: extra.assigneeOverridePersonId } : {}),
  }
}

// Configures the next POST /api/sprint-plan-entries/sync stub response
// (ticket 19's "Sync plan" tests): bumps every ticket's lastSyncedAt to now,
// and - when set - reassigns one entry's ticket to a different accountId,
// mirroring the real reassignment-reset behavior that moves a badge into
// its new assignee's row (routes/sprintPlanEntries.ts's
// applyReassignmentResets).
let syncReassign: { entryId: string; newAccountId: string } | null = null

// Sprint period picker (`.scratch/sprint-period-picker/spec.md`) test state:
// the single TeamSprintPlan doc backing GET/POST/PATCH
// /api/team-sprint-plans, `null` meaning "no plan saved yet" (the same
// state a test gets by simply not touching this variable).
let teamSprintPlanDoc: { _id: string; teamId: string; sprintId: string; startDate?: string; endDate?: string; holidays: string[]; workingDays: number } | null =
  null

function stubFetch(): FetchMock {
  const mock: FetchMock = vi.fn((url, init) => {
    const href = String(url)
    const method = init?.method ?? 'GET'

    if (href.includes('/api/sprints')) return jsonResponse([sprint])
    if (href.includes('/api/team-memberships')) return jsonResponse([membershipAda, membershipGrace])
    if (href.includes('/api/epics')) return jsonResponse([epicRow])

    if (href.includes('/api/team-sprint-plans')) {
      const patchMatch = href.match(/\/api\/team-sprint-plans\/([^/?]+)$/)
      if (patchMatch && method === 'PATCH') {
        const body: { startDate: string; endDate: string; holidays?: string[] } = JSON.parse(init?.body ?? '{}')
        teamSprintPlanDoc = {
          ...(teamSprintPlanDoc as NonNullable<typeof teamSprintPlanDoc>),
          startDate: body.startDate,
          endDate: body.endDate,
          holidays: body.holidays ?? [],
          workingDays: 0,
        }
        return jsonResponse(teamSprintPlanDoc)
      }
      if (method === 'POST') {
        const body: { teamId: string; sprintId: string; startDate: string; endDate: string; holidays?: string[] } = JSON.parse(
          init?.body ?? '{}',
        )
        teamSprintPlanDoc = {
          _id: 'plan-1',
          teamId: body.teamId,
          sprintId: body.sprintId,
          startDate: body.startDate,
          endDate: body.endDate,
          holidays: body.holidays ?? [],
          workingDays: 0,
        }
        return jsonResponse(teamSprintPlanDoc, 201)
      }
      // GET /api/team-sprint-plans?teamId=&sprintId=
      return teamSprintPlanDoc ? jsonResponse(teamSprintPlanDoc) : jsonResponse({ error: 'not found' }, 404)
    }

    if (href.includes('/dev-qa-override') && method === 'PUT') {
      const match = href.match(/\/api\/tickets\/([^/]+)\/dev-qa-override/)
      const ticketId = match?.[1]
      const body: { devPersonId?: string | null; qaPersonId?: string | null } = JSON.parse(init?.body ?? '{}')
      entriesData = entriesData.map((e) => {
        if (e.ticketId._id !== ticketId || !e.devQa) return e
        const nextDevQa = { ...e.devQa }
        if ('devPersonId' in body) {
          nextDevQa.dev = body.devPersonId ? resolvedOverride(body.devPersonId) : needsAssignment()
        }
        if ('qaPersonId' in body) {
          nextDevQa.qa = body.qaPersonId ? resolvedOverride(body.qaPersonId) : needsAssignment()
        }
        return { ...e, devQa: nextDevQa }
      })
      return jsonResponse({ ticketId, ...body })
    }

    if (href.includes('/assignee-override') && method === 'PUT') {
      const match = href.match(/\/api\/tickets\/([^/]+)\/assignee-override/)
      const ticketId = match?.[1]
      const body: { personId: string | null } = JSON.parse(init?.body ?? '{}')
      entriesData = entriesData.map((e) =>
        e.ticketId._id === ticketId ? { ...e, assigneeOverridePersonId: body.personId } : e,
      )
      return jsonResponse({ ticketId, ...body })
    }

    if (href.endsWith('/api/sprint-plan-entries/sync') && method === 'POST') {
      entriesData = entriesData.map((e) => {
        const reassigned = syncReassign && e._id === syncReassign.entryId
        return {
          ...e,
          ticketId: {
            ...e.ticketId,
            ...(reassigned ? { assigneeAccountId: syncReassign!.newAccountId } : {}),
            lastSyncedAt: new Date().toISOString(),
          },
        }
      })
      return jsonResponse(entriesData)
    }

    const patchMatch = href.match(/\/api\/sprint-plan-entries\/([^/?]+)$/)
    if (patchMatch && method === 'PATCH') {
      const id = patchMatch[1]
      const body: { order?: number; devOrder?: number; qaOrder?: number } = JSON.parse(init?.body ?? '{}')
      entriesData = entriesData.map((e) => (e._id === id ? { ...e, ...body } : e))
      return jsonResponse(entriesData.find((e) => e._id === id))
    }

    if (href.includes('/api/sprint-plan-entries') && method === 'POST') {
      const body = JSON.parse(init?.body ?? '{}')
      const catalogEntry = addTicketCatalog[body.jiraKey] ?? { ticket: newTicket }
      const created = entry(`e-${body.jiraKey}`, catalogEntry.ticket, entriesData.length, { devQa: catalogEntry.devQa })
      entriesData = [...entriesData, created]
      // The real POST response is never devQa-decorated - only GET is (see
      // routes/sprintPlanEntries.ts) - so strip it back off here even
      // though `entriesData` (what GET reads from) keeps it.
      const { devQa: _devQa, ...postResponse } = created
      return jsonResponse(postResponse, 201)
    }
    if (href.includes('/api/sprint-plan-entries')) return jsonResponse(entriesData)

    // Sprint leave grid (`.scratch/sprint-leave-picker/spec.md`) - checked
    // before the generic '/capacity' branch below, since
    // '/api/capacity-entries' itself contains that substring.
    if (href.includes('/api/capacity-entries')) {
      const workingDays = teamSprintPlanDoc?.startDate && teamSprintPlanDoc?.endDate
        ? computeWorkingDates(teamSprintPlanDoc.startDate, teamSprintPlanDoc.endDate, teamSprintPlanDoc.holidays).length
        : 0

      const entryPatchMatch = href.match(/\/api\/capacity-entries\/([^/?]+)$/)
      if (entryPatchMatch && method === 'PATCH') {
        const id = entryPatchMatch[1]
        const body: { leaveEntries?: LeaveEntry[]; extraHours?: number } = JSON.parse(init?.body ?? '{}')
        capacityData = capacityData.map((c) =>
          c.capacityEntryId === id
            ? recomputeCapacityRow(c, body.leaveEntries ?? c.leaveEntries, workingDays, body.extraHours ?? c.extraHours)
            : c,
        )
        const updated = capacityData.find((c) => c.capacityEntryId === id)
        return jsonResponse({ _id: id, leaveEntries: updated?.leaveEntries ?? [], extraHours: updated?.extraHours ?? 0 })
      }
      if (method === 'POST') {
        const body: { teamMembershipId: string; sprintId: string; leaveEntries?: LeaveEntry[]; extraHours?: number } = JSON.parse(
          init?.body ?? '{}',
        )
        const newId = `ce-${body.teamMembershipId}`
        capacityData = capacityData.map((c) =>
          c.teamMembershipId === body.teamMembershipId
            ? recomputeCapacityRow({ ...c, capacityEntryId: newId }, body.leaveEntries ?? c.leaveEntries, workingDays, body.extraHours ?? c.extraHours)
            : c,
        )
        return jsonResponse(
          {
            _id: newId,
            teamMembershipId: body.teamMembershipId,
            sprintId: body.sprintId,
            leaveEntries: body.leaveEntries ?? [],
            extraHours: body.extraHours ?? 0,
          },
          201,
        )
      }
      return jsonResponse({ error: 'not found' }, 404)
    }

    if (href.includes('/capacity')) return jsonResponse(capacityData)

    return jsonResponse([])
  })
  vi.stubGlobal('fetch', mock)
  return mock
}

describe('PlanningView', () => {
  beforeEach(() => {
    entriesData = [entry('e1', adaTicket, 0), entry('e2', unmappedTicket, 0)]
    capacityData = [capacityRow]
    teamSprintPlanDoc = null
    fetchMock = stubFetch()
    syncReassign = null
    dragEndByRowIndex = []
    nextRowIndex = 0
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it("renders the selected sprint's active epics as a pill strip, sourced from GET /api/epics", async () => {
    render(<PlanningView team={team} />)

    const strip = await screen.findByLabelText('Active epics')
    expect(within(strip).getByText('Checkout revamp')).toBeInTheDocument()
    expect(within(strip).getByText('(2/6)')).toBeInTheDocument()
    expect(fetchMock).toHaveBeenCalledWith(expect.stringContaining('/api/epics?sprintId=sprint-1'))
  })

  it('renders capacity cards with the API-computed numbers', async () => {
    render(<PlanningView team={team} />)

    // Second pre-existing, order-independent flake found while stress-testing
    // the fix above (reproduces on unmodified main too, even in isolation -
    // confirmed via `git stash`): 'Ada Lovelace' text is ambiguous between
    // the CapacityCard (gated on the capacity fetch) and the "Tickets for
    // Ada Lovelace" row's own label (gated on the independent memberships
    // fetch) - waitFor could resolve as soon as the row appears, before the
    // capacity strip has rendered at all. Wait on a CapacityCard-only string
    // instead, which has exactly one source.
    await waitFor(() => expect(screen.getByText('32h planned')).toBeInTheDocument())
    expect(screen.getByText('57.6h avail')).toBeInTheDocument()
    expect(screen.getByText('25.6h remaining')).toBeInTheDocument()
    expect(screen.getByText('1d leave')).toBeInTheDocument()
  })

  it('lists a synced ticket under its assignee\'s row', async () => {
    render(<PlanningView team={team} />)

    // Pre-existing, order-dependent flake (fails only when the full suite
    // runs, passes in isolation): the row's aria-label is driven by the
    // memberships fetch while the ticket badge inside it is driven by the
    // separate entries fetch (useSprintPlan.ts's two independent effects) -
    // under full-suite CPU contention the label could appear before the
    // badge does. `screen.getByLabelText` right after the outer `waitFor`
    // asserted on the label's appearance, not the badge's, so it could read
    // a still-empty row. Fixed by waiting on the badge's own appearance too
    // rather than assuming it's already there once the row is.
    const adaRow = await screen.findByLabelText('Tickets for Ada Lovelace')
    await waitFor(() => expect(within(adaRow).getByText('100')).toBeInTheDocument())
  })

  it('shows a hand cursor on a ticket badge and a custom (not native title-attribute) hover tooltip with the ticket details', async () => {
    render(<PlanningView team={team} />)

    const adaRow = await screen.findByLabelText('Tickets for Ada Lovelace')
    const badge = await within(adaRow).findByText('100')
    expect(badge).toHaveClass('cursor-pointer')
    expect(badge).not.toHaveAttribute('title')
    expect(within(adaRow).getByText(/Fix login — To Do, synced/)).toBeInTheDocument()
  })

  it('clicking a non-split ticket badge opens an info popup with title, Jira link, and a Planning-assignee picker - not the dev/qa reassignment popup', async () => {
    render(<PlanningView team={team} />)

    const adaRow = await screen.findByLabelText('Tickets for Ada Lovelace')
    const badge = await within(adaRow).findByRole('button', { name: 'Open WOSMVP-100' })
    fireEvent.click(badge)

    const dialog = await screen.findByRole('dialog', { name: 'WOSMVP-100' })
    expect(within(dialog).getByText('Fix login')).toBeInTheDocument()
    const jiraLink = within(dialog).getByRole('link', { name: /Open in Jira/ })
    expect(jiraLink).toHaveAttribute('href', 'https://wealthos.atlassian.net/browse/WOSMVP-100')
    expect(within(dialog).queryByLabelText('Dev assignee')).not.toBeInTheDocument()
    expect(within(dialog).queryByLabelText('QA assignee')).not.toBeInTheDocument()
    // Jira's own assignee is still shown, read-only, current behavior kept.
    expect(within(dialog).getByText('Jira assignee: Unassigned')).toBeInTheDocument()

    fireEvent.click(within(dialog).getByRole('button', { name: 'Close' }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('offers every team member (unrestricted by role) as a Planning assignee, defaulting to "Follow Jira" when no Override is set yet', async () => {
    render(<PlanningView team={team} />)

    const adaRow = await screen.findByLabelText('Tickets for Ada Lovelace')
    const badge = await within(adaRow).findByRole('button', { name: 'Open WOSMVP-100' })
    fireEvent.click(badge)

    const dialog = await screen.findByRole('dialog', { name: 'WOSMVP-100' })
    const select = within(dialog).getByLabelText('Planning assignee')
    expect(select).toHaveValue('')
    expect(within(select).getByText('Ada Lovelace')).toBeInTheDocument()
    expect(within(select).getByText('Grace Hopper')).toBeInTheDocument()
  })

  it("saving a Planning-assignee pick PUTs the Assignee Override and moves the badge into the picked person's row, leaving Jira's own assignee untouched", async () => {
    render(<PlanningView team={team} />)

    const adaRow = await screen.findByLabelText('Tickets for Ada Lovelace')
    const badge = await within(adaRow).findByRole('button', { name: 'Open WOSMVP-100' })
    fireEvent.click(badge)

    const dialog = await screen.findByRole('dialog', { name: 'WOSMVP-100' })
    fireEvent.change(within(dialog).getByLabelText('Planning assignee'), { target: { value: 'p2' } })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Save' }))

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        'http://localhost:4100/api/tickets/WOSMVP-100/assignee-override',
        expect.objectContaining({ method: 'PUT', body: JSON.stringify({ personId: 'p2' }) }),
      ),
    )
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())

    const graceRow = screen.getByLabelText('Tickets for Grace Hopper')
    await waitFor(() => expect(within(graceRow).getByText('100')).toBeInTheDocument())
    expect(within(adaRow).queryByText('100')).not.toBeInTheDocument()
  })

  it('pre-selects an already-set Override, and picking "Follow Jira" clears it (sends personId: null)', async () => {
    entriesData = entriesData.map((e) =>
      e.ticketId._id === 'WOSMVP-100' ? { ...e, assigneeOverridePersonId: 'p2' } : e,
    )
    render(<PlanningView team={team} />)

    const graceRow = await screen.findByLabelText('Tickets for Grace Hopper')
    const badge = await within(graceRow).findByRole('button', { name: 'Open WOSMVP-100' })
    fireEvent.click(badge)

    const dialog = await screen.findByRole('dialog', { name: 'WOSMVP-100' })
    const select = within(dialog).getByLabelText('Planning assignee')
    expect(select).toHaveValue('p2')

    fireEvent.change(select, { target: { value: '' } })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Save' }))

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        'http://localhost:4100/api/tickets/WOSMVP-100/assignee-override',
        expect.objectContaining({ method: 'PUT', body: JSON.stringify({ personId: null }) }),
      ),
    )
  })

  it('closing without changing the Planning-assignee pick does not save anything', async () => {
    render(<PlanningView team={team} />)

    const adaRow = await screen.findByLabelText('Tickets for Ada Lovelace')
    const badge = await within(adaRow).findByRole('button', { name: 'Open WOSMVP-100' })
    fireEvent.click(badge)

    const dialog = await screen.findByRole('dialog', { name: 'WOSMVP-100' })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Close' }))

    expect(fetchMock).not.toHaveBeenCalledWith(
      expect.stringContaining('/assignee-override'),
      expect.anything(),
    )
  })

  it("shows an estimate sub-label (e.g. '1d 4h') instead of the raw type text, and colors the badge by issue type", async () => {
    const bugTicket = ticket({ jiraKey: 'WOSMVP-110', assigneeAccountId: 'acc-1', type: 'Bug', estimateHours: 12 })
    const taskTicket = ticket({ jiraKey: 'WOSMVP-120', assigneeAccountId: 'acc-1', type: 'Dev Task', estimateHours: 1.5 })
    entriesData = [...entriesData, entry('e-bug', bugTicket, 1), entry('e-task', taskTicket, 2)]

    render(<PlanningView team={team} />)
    const adaRow = await screen.findByLabelText('Tickets for Ada Lovelace')

    const storyBadge = await within(adaRow).findByText('100')
    expect(within(adaRow).getByText('4h')).toBeInTheDocument()
    expect(within(adaRow).queryByText('Story')).not.toBeInTheDocument()
    expect(storyBadge).toHaveClass('bg-green-100')

    expect(within(adaRow).getByText('1d 4h')).toBeInTheDocument()
    expect(within(adaRow).getByText('110')).toHaveClass('bg-red-100')

    expect(within(adaRow).getByText('1h 30m')).toBeInTheDocument()
    expect(within(adaRow).getByText('120')).toHaveClass('bg-blue-100')
  })

  it('lands a ticket whose assignee is not on the team in the flagged unmapped row', async () => {
    render(<PlanningView team={team} />)

    // Same fix as above - wait on the badge itself, not just the row label.
    const unmappedRow = await screen.findByLabelText('Tickets for Unmapped')
    await waitFor(() => expect(within(unmappedRow).getByText('150')).toBeInTheDocument())
    expect(screen.getByText('⚠ Unmapped')).toBeInTheDocument()
    // unmappedTicket's type defaults to 'Story' - confirms the amber Unmapped
    // treatment still wins over type-based coloring, not just role state.
    expect(within(unmappedRow).getByText('150')).toHaveClass('bg-amber-100')
  })

  it("shows a DEV/QA sub-label for a Split ticket's placement only when it lands in the Unmapped catch-all row, not a resolved per-person row", async () => {
    const splitUnmappedQa = ticket({ jiraKey: 'WOSMVP-310', assigneeAccountId: null, title: 'Split unmapped qa', type: 'Story' })
    const devQa = { dev: resolvedSubtask('p1'), qa: unmappedRole('acc-x', 'Mystery QA') }
    entriesData = [...entriesData, entry('e-split-unmapped', splitUnmappedQa, 1, { devQa, devOrder: 0 })]
    render(<PlanningView team={team} />)

    const adaRow = await screen.findByLabelText('Tickets for Ada Lovelace')
    await waitFor(() => expect(within(adaRow).getByText('310')).toBeInTheDocument())
    expect(within(adaRow).queryByText('DEV')).not.toBeInTheDocument()

    const unmappedRow = await screen.findByLabelText('Tickets for Unmapped')
    await waitFor(() => expect(within(unmappedRow).getByText('310')).toBeInTheDocument())
    // Text node itself stays lowercase - the `uppercase` Tailwind class does
    // the visual transform, matching capacity.role's sibling badge pattern.
    expect(within(unmappedRow).getByText('qa')).toBeInTheDocument()
  })

  it('adding a ticket via the entry bar populates the right person\'s row', async () => {
    render(<PlanningView team={team} />)
    await waitFor(() => expect(screen.getByLabelText('Tickets for Ada Lovelace')).toBeInTheDocument())

    fireEvent.change(screen.getByLabelText('Ticket number to add to plan'), { target: { value: '200' } })
    fireEvent.click(screen.getByRole('button', { name: 'Add' }))

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        'http://localhost:4100/api/sprint-plan-entries',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({ teamId: 'team-a', sprintId: 'sprint-1', jiraKey: 'WOSMVP-200' }),
        }),
      ),
    )

    await waitFor(() =>
      expect(within(screen.getByLabelText('Tickets for Ada Lovelace')).getByText('200')).toBeInTheDocument(),
    )
    expect(screen.getByLabelText('Ticket number to add to plan')).toHaveValue('')
  })

  describe('Dev/QA split (ticket 24)', () => {
    it("renders a Split ticket's badge under both its resolved dev and qa rows, keyed by person rather than a role sub-label on the badge", async () => {
      entriesData = [...entriesData, entry('e-split', splitTicket, 1, { devQa: splitDevQa, devOrder: 0, qaOrder: 0 })]
      render(<PlanningView team={team} />)

      const adaRow = await screen.findByLabelText('Tickets for Ada Lovelace')
      await waitFor(() => expect(within(adaRow).getByText('300')).toBeInTheDocument())

      const graceRow = screen.getByLabelText('Tickets for Grace Hopper')
      await waitFor(() => expect(within(graceRow).getByText('300')).toBeInTheDocument())
    })

    it("shows each role placement's own Sub-task estimate, never the parent Story/Bug's own estimateHours", async () => {
      entriesData = [
        ...entriesData,
        entry('e-split', splitTicket, 1, { devQa: splitDevQa, devOrder: 0, qaOrder: 0, devEstimateHours: 6, qaEstimateHours: 2 }),
      ]
      render(<PlanningView team={team} />)

      const adaRow = await screen.findByLabelText('Tickets for Ada Lovelace')
      await waitFor(() => expect(within(adaRow).getByText('300')).toBeInTheDocument())
      expect(within(adaRow).getByText('6h')).toBeInTheDocument()

      const graceRow = screen.getByLabelText('Tickets for Grace Hopper')
      await waitFor(() => expect(within(graceRow).getByText('300')).toBeInTheDocument())
      expect(within(graceRow).getByText('2h')).toBeInTheDocument()
    })

    it('renders a needs-assignment role as a distinct flagged badge, separate from Unmapped, that opens the popup on click', async () => {
      entriesData = [...entriesData, entry('e-needs-qa', needsQaTicket, 1, { devQa: needsQaDevQa, devOrder: 0 })]
      render(<PlanningView team={team} />)

      const flagRow = await screen.findByLabelText('Tickets for Needs dev/qa')
      // Same class of race as the pre-existing flake fixed above: the row's
      // label appears from the memberships fetch, but the flagged badge
      // inside it depends on the separate entries fetch resolving too -
      // find (not get) the button so this waits for it.
      const flagButton = await within(flagRow).findByRole('button', { name: 'Assign dev/qa for WOSMVP-400' })
      expect(flagButton.className).toContain('border-sky-300')
      expect(flagButton.className).not.toContain('border-amber-300')

      fireEvent.click(flagButton)

      expect(await screen.findByRole('dialog', { name: 'Assign dev/qa for WOSMVP-400' })).toBeInTheDocument()
    })

    it('renders a resolved-via-Jira (subtask) role as an editable, pre-filled select, so it can be reassigned to a Dev/QA Override', async () => {
      entriesData = [...entriesData, entry('e-needs-qa', needsQaTicket, 1, { devQa: needsQaDevQa })]
      render(<PlanningView team={team} />)

      const flagButton = await screen.findByRole('button', { name: 'Assign dev/qa for WOSMVP-400' })
      fireEvent.click(flagButton)

      const dialog = await screen.findByRole('dialog', { name: 'Assign dev/qa for WOSMVP-400' })
      expect(within(dialog).getByText(/Jira assignee:\s*Ada Lovelace/)).toBeInTheDocument()
      const devSelect = within(dialog).getByLabelText('Dev assignee')
      expect(devSelect).toHaveValue('p1')
      expect(within(dialog).getByLabelText('QA assignee')).toBeInTheDocument()
    })

    it('renders a resolved-via-Override role as an editable, pre-filled select (not read-only)', async () => {
      entriesData = [...entriesData, entry('e-override', overrideDevTicket, 1, { devQa: overrideDevQa })]
      render(<PlanningView team={team} />)

      const flagButton = await screen.findByRole('button', { name: 'Assign dev/qa for WOSMVP-800' })
      fireEvent.click(flagButton)

      const dialog = await screen.findByRole('dialog', { name: 'Assign dev/qa for WOSMVP-800' })
      const devSelect = within(dialog).getByLabelText('Dev assignee')
      expect(devSelect).toHaveValue('p1')
    })

    it('opens the same popup when clicking an already-resolved (non-flagged) Split ticket badge, not just a needs-assignment one', async () => {
      entriesData = [...entriesData, entry('e-split', splitTicket, 1, { devQa: splitDevQa, devOrder: 0, qaOrder: 0 })]
      render(<PlanningView team={team} />)

      const adaRow = await screen.findByLabelText('Tickets for Ada Lovelace')
      const badge = await within(adaRow).findByRole('button', { name: 'Open WOSMVP-300' })

      fireEvent.click(badge)

      const dialog = await screen.findByRole('dialog', { name: 'Assign dev/qa for WOSMVP-300' })
      expect(within(dialog).getByText(/Jira assignee:\s*Ada Lovelace/)).toBeInTheDocument()
      expect(within(dialog).getByText(/Jira assignee:\s*Grace Hopper/)).toBeInTheDocument()
    })

    it('shows an "Open in Jira" link pointing at the ticket, alongside the title', async () => {
      entriesData = [...entriesData, entry('e-needs-qa', needsQaTicket, 1, { devQa: needsQaDevQa })]
      render(<PlanningView team={team} />)

      const flagButton = await screen.findByRole('button', { name: 'Assign dev/qa for WOSMVP-400' })
      fireEvent.click(flagButton)

      const dialog = await screen.findByRole('dialog', { name: 'Assign dev/qa for WOSMVP-400' })
      expect(within(dialog).getByText('Needs QA')).toBeInTheDocument()
      const jiraLink = within(dialog).getByRole('link', { name: /Open in Jira/ })
      expect(jiraLink).toHaveAttribute('href', 'https://wealthos.atlassian.net/browse/WOSMVP-400')
      expect(jiraLink).toHaveAttribute('target', '_blank')
    })

    it('only offers dev-role people for Dev and qa-role people for QA, per role mapping', async () => {
      entriesData = [...entriesData, entry('e-needs-both', splitTicket, 1, { devQa: { dev: needsAssignment(), qa: needsAssignment() } })]
      render(<PlanningView team={team} />)

      const flagRow = await screen.findByLabelText('Tickets for Needs dev/qa')
      const [flagButton] = await within(flagRow).findAllByRole('button', { name: 'Assign dev/qa for WOSMVP-300' })
      fireEvent.click(flagButton)

      const dialog = await screen.findByRole('dialog', { name: 'Assign dev/qa for WOSMVP-300' })
      const devSelect = within(dialog).getByLabelText('Dev assignee')
      const qaSelect = within(dialog).getByLabelText('QA assignee')

      expect(within(devSelect).getByText('Ada Lovelace')).toBeInTheDocument()
      expect(within(devSelect).queryByText('Grace Hopper')).not.toBeInTheDocument()
      expect(within(qaSelect).getByText('Grace Hopper')).toBeInTheDocument()
      expect(within(qaSelect).queryByText('Ada Lovelace')).not.toBeInTheDocument()
    })

    it("saving an override via the popup calls the PUT endpoint with only the changed field and moves the badge into the picked person's row", async () => {
      entriesData = [...entriesData, entry('e-needs-qa', needsQaTicket, 1, { devQa: needsQaDevQa })]
      render(<PlanningView team={team} />)

      const flagButton = await screen.findByRole('button', { name: 'Assign dev/qa for WOSMVP-400' })
      fireEvent.click(flagButton)

      const dialog = await screen.findByRole('dialog', { name: 'Assign dev/qa for WOSMVP-400' })
      fireEvent.change(within(dialog).getByLabelText('QA assignee'), { target: { value: 'p2' } })
      fireEvent.click(within(dialog).getByRole('button', { name: 'Save' }))

      await waitFor(() =>
        expect(fetchMock).toHaveBeenCalledWith(
          'http://localhost:4100/api/tickets/WOSMVP-400/dev-qa-override',
          expect.objectContaining({ method: 'PUT', body: JSON.stringify({ qaPersonId: 'p2' }) }),
        ),
      )

      await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())

      const graceRow = screen.getByLabelText('Tickets for Grace Hopper')
      await waitFor(() => expect(within(graceRow).getByText('400')).toBeInTheDocument())
    })

    it('auto-opens the popup right after add-to-plan when the newly-added Split ticket has a needs-assignment role', async () => {
      render(<PlanningView team={team} />)
      await screen.findByLabelText('Tickets for Ada Lovelace')

      fireEvent.change(screen.getByLabelText('Ticket number to add to plan'), { target: { value: '400' } })
      fireEvent.click(screen.getByRole('button', { name: 'Add' }))

      expect(await screen.findByRole('dialog', { name: 'Assign dev/qa for WOSMVP-400' })).toBeInTheDocument()
    })

    it('does not auto-open the popup for a fully-resolved Split ticket added to the plan', async () => {
      render(<PlanningView team={team} />)
      await screen.findByLabelText('Tickets for Ada Lovelace')

      fireEvent.change(screen.getByLabelText('Ticket number to add to plan'), { target: { value: '500' } })
      fireEvent.click(screen.getByRole('button', { name: 'Add' }))

      await waitFor(() =>
        expect(within(screen.getByLabelText('Tickets for Ada Lovelace')).getByText('500')).toBeInTheDocument(),
      )
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    })

    it('does not auto-open the popup for a non-split ticket added to the plan', async () => {
      render(<PlanningView team={team} />)
      await screen.findByLabelText('Tickets for Ada Lovelace')

      fireEvent.change(screen.getByLabelText('Ticket number to add to plan'), { target: { value: '600' } })
      fireEvent.click(screen.getByRole('button', { name: 'Add' }))

      await waitFor(() =>
        expect(within(screen.getByLabelText('Tickets for Ada Lovelace')).getByText('600')).toBeInTheDocument(),
      )
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    })

    it("does not auto-open the popup when a Split ticket's only unresolved role is unmapped, not needs-assignment", async () => {
      render(<PlanningView team={team} />)
      await screen.findByLabelText('Tickets for Ada Lovelace')

      fireEvent.change(screen.getByLabelText('Ticket number to add to plan'), { target: { value: '700' } })
      fireEvent.click(screen.getByRole('button', { name: 'Add' }))

      await waitFor(() =>
        expect(within(screen.getByLabelText('Tickets for Ada Lovelace')).getByText('700')).toBeInTheDocument(),
      )
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    })
  })

  describe('Option/Alt+click pop (find-the-pair)', () => {
    it('alt+click enlarges a ticket badge; a plain click does not', async () => {
      render(<PlanningView team={team} />)
      const adaRow = await screen.findByLabelText('Tickets for Ada Lovelace')
      const badge = await within(adaRow).findByText('100')

      fireEvent.click(badge)
      expect(badge).not.toHaveClass('scale-125')

      fireEvent.click(badge, { altKey: true })
      expect(badge).toHaveClass('scale-125')
    })

    it('alt+clicking an already-popped badge toggles it back off', async () => {
      render(<PlanningView team={team} />)
      const adaRow = await screen.findByLabelText('Tickets for Ada Lovelace')
      const badge = await within(adaRow).findByText('100')

      fireEvent.click(badge, { altKey: true })
      expect(badge).toHaveClass('scale-125')

      fireEvent.click(badge, { altKey: true })
      expect(badge).not.toHaveClass('scale-125')
    })

    it("propagates the pop to the same ticket's placement in a different person's row (a Split ticket's dev/qa pair)", async () => {
      entriesData = [...entriesData, entry('e-split', splitTicket, 1, { devQa: splitDevQa, devOrder: 0, qaOrder: 0 })]
      render(<PlanningView team={team} />)

      const adaRow = await screen.findByLabelText('Tickets for Ada Lovelace')
      const devBadge = await within(adaRow).findByText('300')
      const graceRow = await screen.findByLabelText('Tickets for Grace Hopper')
      const qaBadge = await within(graceRow).findByText('300')

      fireEvent.click(devBadge, { altKey: true })

      expect(devBadge).toHaveClass('scale-125')
      expect(qaBadge).toHaveClass('scale-125')
    })

    it('only pops one ticket (pair) at a time - alt+clicking a different ticket un-pops the previous one', async () => {
      entriesData = [...entriesData, entry('e-split', splitTicket, 1, { devQa: splitDevQa, devOrder: 0, qaOrder: 0 })]
      render(<PlanningView team={team} />)

      const adaRow = await screen.findByLabelText('Tickets for Ada Lovelace')
      const firstBadge = await within(adaRow).findByText('100')
      const secondBadge = await within(adaRow).findByText('300')

      fireEvent.click(firstBadge, { altKey: true })
      expect(firstBadge).toHaveClass('scale-125')

      fireEvent.click(secondBadge, { altKey: true })
      expect(firstBadge).not.toHaveClass('scale-125')
      expect(secondBadge).toHaveClass('scale-125')
    })
  })

  describe('Drag-reorder (ticket 19)', () => {
    it("reorders two tickets within a person's row via a save-on-drop PATCH, and the new order survives a reload", async () => {
      entriesData = [entry('e1', adaTicket, 0), entry('e2', unmappedTicket, 0), entry('e3', newTicket, 1)]
      fetchMock = stubFetch()

      render(<PlanningView team={team} />)
      const adaRow = await screen.findByLabelText('Tickets for Ada Lovelace')
      await waitFor(() => expect(within(adaRow).getByText('100')).toBeInTheDocument())
      await waitFor(() => expect(within(adaRow).getByText('200')).toBeInTheDocument())

      // Ada's row (memberships[0], mounted first) is dragEndByRowIndex[0] -
      // see the DndContext mock above. Drag WOSMVP-100 (order 0) past
      // WOSMVP-200 (order 1): both entries are "affected" (both cross a
      // position), so both PATCH.
      await dragEndByRowIndex[0]?.({ active: { id: 'e1-main' }, over: { id: 'e3-main' } } as DragEndEvent)

      await waitFor(() =>
        expect(fetchMock).toHaveBeenCalledWith(
          'http://localhost:4100/api/sprint-plan-entries/e1',
          expect.objectContaining({ method: 'PATCH', body: JSON.stringify({ order: 1 }) }),
        ),
      )
      expect(fetchMock).toHaveBeenCalledWith(
        'http://localhost:4100/api/sprint-plan-entries/e3',
        expect.objectContaining({ method: 'PATCH', body: JSON.stringify({ order: 0 }) }),
      )

      // "Survives a reload": entriesData (what GET reads from) was mutated
      // by the PATCH stub, so a fresh mount (a stand-in for a reload) reads
      // the new order back and renders the badges in the new sequence.
      const { container } = render(<PlanningView team={team} />)
      const reloadedAdaRow = await within(container).findByLabelText('Tickets for Ada Lovelace')
      await waitFor(() => expect(within(reloadedAdaRow).getByText('200')).toBeInTheDocument())
      const badges = within(reloadedAdaRow).getAllByText(/^(100|200)$/)
      expect(badges[0].textContent).toContain('200')
      expect(badges[1].textContent).toContain('100')
    })

    it('does not PATCH anything when a drag is dropped back on its own position', async () => {
      entriesData = [entry('e1', adaTicket, 0), entry('e2', unmappedTicket, 0), entry('e3', newTicket, 1)]
      fetchMock = stubFetch()

      render(<PlanningView team={team} />)
      await screen.findByLabelText('Tickets for Ada Lovelace')

      fetchMock.mockClear()
      await dragEndByRowIndex[0]?.({ active: { id: 'e1-main' }, over: { id: 'e1-main' } } as DragEndEvent)

      expect(fetchMock).not.toHaveBeenCalledWith(
        expect.stringContaining('/api/sprint-plan-entries/e1'),
        expect.objectContaining({ method: 'PATCH' }),
      )
    })

    it('drags a placement past a differently-fielded neighbor (mixed dev/qa row) and the new order survives a reload', async () => {
      // eBoth is a Split ticket resolved dev *and* qa to Ada - it lands in
      // Ada's row twice, once per role (devOrder 0, qaOrder 0). eDevOnly is
      // a second Split ticket resolved dev to Ada (qa to Grace, elsewhere) -
      // devOrder 1. Ada's row is therefore [e1 (order), e-both-dev
      // (devOrder), e-both-qa (qaOrder), e-devonly-dev (devOrder)] - three
      // different order fields in one row, same shape as a real person's row
      // mixing Bug/Story badges (every Split ticket independently resolves
      // a dev-role and a qa-role placement - see PlacedEntry above).
      //
      // Dragging eDevOnly's dev badge (index 3) to land just after e1
      // (index 1, in front of both of eBoth's badges) crosses two
      // differently-fielded neighbors on the way. This is exactly what used
      // to silently no-op (ticket 19's original per-field-local-rank scheme
      // couldn't represent it - see computeReorderPatches's comment): eBoth's
      // two badges shift row-wide position without their same-field rank
      // changing (each is the only member of its field in this row), so
      // both devOrder and qaOrder need patching even though only one badge
      // was actually dragged.
      const splitBoth = ticket({ jiraKey: 'WOSMVP-301', assigneeAccountId: null, title: 'Both dev and qa', type: 'Story' })
      const splitDevOnly = ticket({ jiraKey: 'WOSMVP-302', assigneeAccountId: null, title: 'Dev only', type: 'Story' })
      entriesData = [
        entry('e1', adaTicket, 0),
        entry('e-both', splitBoth, 1, { devQa: { dev: resolvedSubtask('p1'), qa: resolvedSubtask('p1') }, devOrder: 0, qaOrder: 0 }),
        entry('e-devonly', splitDevOnly, 2, { devQa: { dev: resolvedSubtask('p1'), qa: resolvedSubtask('p2') }, devOrder: 1 }),
      ]
      fetchMock = stubFetch()

      render(<PlanningView team={team} />)
      const adaRow = await screen.findByLabelText('Tickets for Ada Lovelace')
      await waitFor(() => expect(within(adaRow).getByText('302')).toBeInTheDocument())

      await dragEndByRowIndex[0]?.({ active: { id: 'e-devonly-dev' }, over: { id: 'e-both-dev' } } as DragEndEvent)

      // e-both's dev badge (index 1 -> 2) and qa badge (index 2 -> 3) both
      // shift row-wide position, so both of its order fields get patched -
      // e-devonly-dev itself doesn't need a patch (its row-wide index is
      // unchanged: it lands at index 1, same value it already had).
      await waitFor(() =>
        expect(fetchMock).toHaveBeenCalledWith(
          'http://localhost:4100/api/sprint-plan-entries/e-both',
          expect.objectContaining({ method: 'PATCH', body: JSON.stringify({ devOrder: 2 }) }),
        ),
      )
      expect(fetchMock).toHaveBeenCalledWith(
        'http://localhost:4100/api/sprint-plan-entries/e-both',
        expect.objectContaining({ method: 'PATCH', body: JSON.stringify({ qaOrder: 3 }) }),
      )
      expect(fetchMock).not.toHaveBeenCalledWith(
        'http://localhost:4100/api/sprint-plan-entries/e-devonly',
        expect.anything(),
      )
      expect(fetchMock).not.toHaveBeenCalledWith('http://localhost:4100/api/sprint-plan-entries/e1', expect.anything())

      // Survives a reload, and lands where it was dropped: e-devonly's dev
      // badge (302) now renders ahead of both of e-both's badges (301, 301).
      const { container } = render(<PlanningView team={team} />)
      const reloadedAdaRow = await within(container).findByLabelText('Tickets for Ada Lovelace')
      await waitFor(() => expect(within(reloadedAdaRow).getAllByText(/^(301|302)$/)).toHaveLength(3))
      const badges = within(reloadedAdaRow).getAllByText(/^(301|302)$/)
      expect(badges.map((b) => b.textContent)).toEqual(['302', '301', '301'])
    })

    it('rolls back the optimistic reorder if the PATCH fails', async () => {
      entriesData = [entry('e1', adaTicket, 0), entry('e2', unmappedTicket, 0), entry('e3', newTicket, 1)]
      const base = stubFetch()
      fetchMock = vi.fn((url, init) => {
        const href = String(url)
        const method = init?.method ?? 'GET'
        const patchMatch = href.match(/\/api\/sprint-plan-entries\/([^/?]+)$/)
        if (patchMatch && method === 'PATCH') return jsonResponse({ error: 'boom' }, 500)
        return base(url, init)
      })
      vi.stubGlobal('fetch', fetchMock)

      render(<PlanningView team={team} />)
      const adaRow = await screen.findByLabelText('Tickets for Ada Lovelace')
      await waitFor(() => expect(within(adaRow).getByText('100')).toBeInTheDocument())
      await waitFor(() => expect(within(adaRow).getByText('200')).toBeInTheDocument())

      await dragEndByRowIndex[0]?.({ active: { id: 'e1-main' }, over: { id: 'e3-main' } } as DragEndEvent)

      // The failed PATCH rolls the local optimistic reorder back - badge
      // order in the row returns to its pre-drag order (100 before 200).
      await waitFor(() => {
        const badges = within(adaRow).getAllByText(/^(100|200)$/)
        expect(badges[0].textContent).toContain('100')
        expect(badges[1].textContent).toContain('200')
      })
    })
  })

  describe('Sync plan (ticket 19)', () => {
    it('shows a loading state while syncing, then returns to idle on success', async () => {
      // The default stub resolves the sync POST near-instantly, too fast
      // for the transient "Syncing…" state to be reliably observable -
      // deferred here so the loading state stays put until asserted on.
      let resolveSync: ((response: FakeResponse) => void) | undefined
      const base = stubFetch()
      fetchMock = vi.fn((url, init) => {
        const href = String(url)
        const method = init?.method ?? 'GET'
        if (href.endsWith('/api/sprint-plan-entries/sync') && method === 'POST') {
          return new Promise<FakeResponse>((resolve) => {
            resolveSync = resolve
          })
        }
        return base(url, init)
      })
      vi.stubGlobal('fetch', fetchMock)

      render(<PlanningView team={team} />)
      await screen.findByLabelText('Tickets for Ada Lovelace')

      const button = screen.getByRole('button', { name: 'Sync plan' })
      fireEvent.click(button)

      expect(await screen.findByRole('button', { name: 'Syncing…' })).toBeDisabled()

      resolveSync?.({ ok: true, status: 200, json: () => Promise.resolve(entriesData) })

      expect(await screen.findByRole('button', { name: 'Sync plan' })).not.toBeDisabled()
    })

    it("refreshes every ticket's staleness display on completion", async () => {
      const staleTicket = ticket({
        jiraKey: 'WOSMVP-900',
        assigneeAccountId: 'acc-1',
        title: 'Stale ticket',
        lastSyncedAt: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
      })
      entriesData = [entry('e-stale', staleTicket, 0)]
      fetchMock = stubFetch()

      render(<PlanningView team={team} />)
      const adaRow = await screen.findByLabelText('Tickets for Ada Lovelace')
      await within(adaRow).findByText('900')
      expect(within(adaRow).getByText(/2h ago/)).toBeInTheDocument()

      fireEvent.click(screen.getByRole('button', { name: 'Sync plan' }))

      await waitFor(() => {
        expect(within(adaRow).getByText(/just now/)).toBeInTheDocument()
      })
    })

    it('shows an error message when the sync request fails, and re-enables the button', async () => {
      const base = stubFetch()
      fetchMock = vi.fn((url, init) => {
        const href = String(url)
        if (href.endsWith('/api/sprint-plan-entries/sync')) return jsonResponse({ error: 'Jira unreachable' }, 502)
        return base(url, init)
      })
      vi.stubGlobal('fetch', fetchMock)

      render(<PlanningView team={team} />)
      await screen.findByLabelText('Tickets for Ada Lovelace')

      fireEvent.click(screen.getByRole('button', { name: 'Sync plan' }))

      expect(await screen.findByText('Jira unreachable')).toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'Sync plan' })).not.toBeDisabled()
    })

    it("moves a reassigned ticket's badge into its new assignee's row after a sync", async () => {
      entriesData = [entry('e1', adaTicket, 0)]
      syncReassign = { entryId: 'e1', newAccountId: 'acc-2' }
      fetchMock = stubFetch()

      render(<PlanningView team={team} />)
      const adaRow = await screen.findByLabelText('Tickets for Ada Lovelace')
      await waitFor(() => expect(within(adaRow).getByText('100')).toBeInTheDocument())

      fireEvent.click(screen.getByRole('button', { name: 'Sync plan' }))

      const graceRow = await screen.findByLabelText('Tickets for Grace Hopper')
      await waitFor(() => expect(within(graceRow).getByText('100')).toBeInTheDocument())
      await waitFor(() => expect(within(adaRow).queryByText('100')).not.toBeInTheDocument())
    })
  })

  describe('Sprint period picker (.scratch/sprint-period-picker/spec.md)', () => {
    // 2026-08-01 is a Saturday, 2026-08-07 the following Friday - Aug 1
    // deliberately being the 1st of a month makes this the regression guard
    // for the toISOString() timezone bug (spec's timezone decision): that
    // bug shifts every date back a day in this environment's UTC+5:30
    // timezone, which would have silently turned "Aug 1" into "Jul 31" and
    // dropped "Aug 7" off the end of the range.
    const sprintWithJiraDates: Sprint = {
      _id: 'sprint-2',
      jiraSprintId: '200',
      name: 'Sprint With Dates',
      state: 'active',
      startDate: '2026-08-01',
      endDate: '2026-08-07',
    }
    const sprintNoDates: Sprint = { _id: 'sprint-3', jiraSprintId: '300', name: 'Sprint No Dates', state: 'active' }

    // Overrides just the /api/sprints response on top of the shared
    // stubFetch() (team-sprint-plans/capacity/memberships/entries stay the
    // same), mirroring the "sync error" test's base-plus-override pattern
    // above.
    function stubFetchWithSprint(selectedSprint: Sprint): FetchMock {
      const base = stubFetch()
      const mock: FetchMock = vi.fn((url, init) => {
        const href = String(url)
        if (href.includes('/api/sprints')) return jsonResponse([selectedSprint])
        return base(url, init)
      })
      vi.stubGlobal('fetch', mock)
      return mock
    }

    // The form is now collapsed behind an edit/set-period toggle (see the
    // "collapsible edit panel" describe below) - every test in this outer
    // describe block that needs to assert on the form's own contents opens
    // it first via this helper rather than repeating the click. The toggle's
    // accessible name flips between "Set period" and "Edit period" depending
    // on planConfigured, so match either rather than hardcoding one.
    async function openPeriodForm(): Promise<HTMLElement> {
      const toggle = await screen.findByRole('button', { name: /^(set|edit) period$/i })
      fireEvent.click(toggle)
      return screen.findByLabelText('Sprint period')
    }

    it("pre-fills the period form from the selected Sprint's own Jira dates when no plan is saved yet", async () => {
      fetchMock = stubFetchWithSprint(sprintWithJiraDates)
      render(<PlanningView team={team} />)

      const form = await openPeriodForm()
      expect(within(form).getByLabelText('Start date')).toHaveValue('2026-08-01')
      expect(within(form).getByLabelText('End date')).toHaveValue('2026-08-07')
    })

    it('leaves the date inputs blank when neither a saved plan nor the Sprint itself has dates', async () => {
      fetchMock = stubFetchWithSprint(sprintNoDates)
      render(<PlanningView team={team} />)

      const form = await openPeriodForm()
      expect(within(form).getByLabelText('Start date')).toHaveValue('')
      expect(within(form).getByLabelText('End date')).toHaveValue('')
      expect(screen.getByText('Pick a valid date range')).toBeInTheDocument()
    })

    it('renders exactly the day chips in the picked range, split correctly across weekend/weekday - the timezone regression guard', async () => {
      fetchMock = stubFetchWithSprint(sprintWithJiraDates)
      render(<PlanningView team={team} />)

      await openPeriodForm()

      // 5 weekdays (Mon 08-03 .. Fri 08-07) are interactive toggle buttons.
      const weekdayChips = screen.getAllByRole('button', { name: /Toggle holiday for/ })
      expect(weekdayChips).toHaveLength(5)
      // The exact boundary dates - if the toISOString() bug regressed, these
      // dates would be off by one and these lookups would fail.
      expect(screen.getByLabelText('Toggle holiday for 2026-08-03')).toBeInTheDocument()
      expect(screen.getByLabelText('Toggle holiday for 2026-08-07')).toBeInTheDocument()
      expect(screen.queryByLabelText('Toggle holiday for 2026-08-01')).not.toBeInTheDocument()
      expect(screen.queryByLabelText('Toggle holiday for 2026-08-08')).not.toBeInTheDocument()

      expect(screen.getByText('5/5 working days')).toBeInTheDocument()
    })

    it('toggles a weekday chip to a struck-through holiday state and updates the live working-day count', async () => {
      fetchMock = stubFetchWithSprint(sprintWithJiraDates)
      render(<PlanningView team={team} />)
      await openPeriodForm()

      const chip = screen.getByLabelText('Toggle holiday for 2026-08-05')
      expect(chip).toHaveAttribute('aria-pressed', 'false')
      expect(screen.getByText('5/5 working days')).toBeInTheDocument()

      fireEvent.click(chip)

      expect(chip).toHaveAttribute('aria-pressed', 'true')
      expect(chip).toHaveClass('line-through')
      expect(screen.getByText('4/5 working days')).toBeInTheDocument()

      fireEvent.click(chip)

      expect(chip).toHaveAttribute('aria-pressed', 'false')
      expect(screen.getByText('5/5 working days')).toBeInTheDocument()
    })

    it('saves the period via POST with the exact { startDate, endDate, holidays } body and re-fetches the capacity strip', async () => {
      fetchMock = stubFetchWithSprint(sprintWithJiraDates)
      render(<PlanningView team={team} />)
      await openPeriodForm()

      fireEvent.click(screen.getByLabelText('Toggle holiday for 2026-08-05'))

      const capacityCallsBefore = fetchMock.mock.calls.filter(([url]) => String(url).includes('/capacity')).length

      fireEvent.click(screen.getByRole('button', { name: 'Save period' }))

      await waitFor(() =>
        expect(fetchMock).toHaveBeenCalledWith(
          'http://localhost:4100/api/team-sprint-plans',
          expect.objectContaining({
            method: 'POST',
            body: JSON.stringify({
              teamId: 'team-a',
              sprintId: 'sprint-2',
              startDate: '2026-08-01',
              endDate: '2026-08-07',
              holidays: ['2026-08-05'],
            }),
          }),
        ),
      )

      await waitFor(() => {
        const capacityCallsAfter = fetchMock.mock.calls.filter(([url]) => String(url).includes('/capacity')).length
        expect(capacityCallsAfter).toBeGreaterThan(capacityCallsBefore)
      })
    })

    it('saves an edited period via PATCH /api/team-sprint-plans/:id with the exact { startDate, endDate, holidays } body when a plan already exists', async () => {
      teamSprintPlanDoc = {
        _id: 'plan-existing',
        teamId: 'team-a',
        sprintId: 'sprint-2',
        startDate: '2026-08-03',
        endDate: '2026-08-06',
        holidays: ['2026-08-05'],
        workingDays: 3,
      }
      fetchMock = stubFetchWithSprint(sprintWithJiraDates)
      render(<PlanningView team={team} />)
      const form = await openPeriodForm()
      expect(within(form).getByLabelText('Start date')).toHaveValue('2026-08-03')

      // Un-mark the pre-existing holiday, so the PATCH body proves the edit
      // (not just a re-save of what was already there) round-trips.
      fireEvent.click(screen.getByLabelText('Toggle holiday for 2026-08-05'))
      fireEvent.click(screen.getByRole('button', { name: 'Save period' }))

      await waitFor(() =>
        expect(fetchMock).toHaveBeenCalledWith(
          'http://localhost:4100/api/team-sprint-plans/plan-existing',
          expect.objectContaining({
            method: 'PATCH',
            body: JSON.stringify({ startDate: '2026-08-03', endDate: '2026-08-06', holidays: [] }),
          }),
        ),
      )
      // Never POSTs once a plan already exists - the hook branches
      // internally, PlanningView never has to know which.
      expect(fetchMock).not.toHaveBeenCalledWith('http://localhost:4100/api/team-sprint-plans', expect.objectContaining({ method: 'POST' }))
    })

    it("pre-fills the form from a saved plan's stored dates/holidays (not the Sprint's own Jira dates) and shows capacity cards", async () => {
      teamSprintPlanDoc = {
        _id: 'plan-existing',
        teamId: 'team-a',
        sprintId: 'sprint-2',
        startDate: '2026-08-03',
        endDate: '2026-08-06',
        holidays: ['2026-08-05'],
        workingDays: 3,
      }
      fetchMock = stubFetchWithSprint(sprintWithJiraDates)
      render(<PlanningView team={team} />)

      const form = await openPeriodForm()
      expect(within(form).getByLabelText('Start date')).toHaveValue('2026-08-03')
      expect(within(form).getByLabelText('End date')).toHaveValue('2026-08-06')
      expect(screen.getByLabelText('Toggle holiday for 2026-08-05')).toHaveAttribute('aria-pressed', 'true')
      // Aug 1/2/7 belong to the Sprint's own Jira dates, not the saved
      // plan's range - proves the form used the saved plan, not the Sprint.
      expect(screen.queryByLabelText('Toggle holiday for 2026-08-07')).not.toBeInTheDocument()

      await waitFor(() => expect(screen.getByText('32h planned')).toBeInTheDocument())
    })

    it('narrowing the date range drops a holiday that now falls outside it, without an error', async () => {
      fetchMock = stubFetchWithSprint(sprintWithJiraDates)
      render(<PlanningView team={team} />)
      await openPeriodForm()

      fireEvent.click(screen.getByLabelText('Toggle holiday for 2026-08-07'))
      expect(screen.getByText('4/5 working days')).toBeInTheDocument()

      fireEvent.change(screen.getByLabelText('End date'), { target: { value: '2026-08-05' } })

      expect(screen.queryByLabelText('Toggle holiday for 2026-08-07')).not.toBeInTheDocument()
      expect(screen.getByText('3/3 working days')).toBeInTheDocument()
      expect(screen.queryByText(/error/i)).not.toBeInTheDocument()
    })

    it('blocks Save and hides the working-day count for an invalid (inverted) range', async () => {
      fetchMock = stubFetchWithSprint(sprintNoDates)
      render(<PlanningView team={team} />)
      const form = await openPeriodForm()

      fireEvent.change(within(form).getByLabelText('Start date'), { target: { value: '2026-08-07' } })
      fireEvent.change(within(form).getByLabelText('End date'), { target: { value: '2026-08-03' } })

      expect(screen.getByText('Pick a valid date range')).toBeInTheDocument()
      expect(screen.queryByText(/working days/)).not.toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'Save period' })).toBeDisabled()
    })

    it('shows an error and leaves in-progress selections unchanged when the save fails', async () => {
      fetchMock = stubFetchWithSprint(sprintWithJiraDates)
      const base = fetchMock
      fetchMock = vi.fn((url, init) => {
        const href = String(url)
        const method = init?.method ?? 'GET'
        if (href === 'http://localhost:4100/api/team-sprint-plans' && method === 'POST') {
          return jsonResponse({ error: 'Server exploded' }, 500)
        }
        return base(url, init)
      })
      vi.stubGlobal('fetch', fetchMock)

      render(<PlanningView team={team} />)
      await openPeriodForm()

      fireEvent.click(screen.getByLabelText('Toggle holiday for 2026-08-05'))
      fireEvent.click(screen.getByRole('button', { name: 'Save period' }))

      expect(await screen.findByText('Server exploded')).toBeInTheDocument()
      expect(screen.getByLabelText('Toggle holiday for 2026-08-05')).toHaveAttribute('aria-pressed', 'true')
      expect(screen.getByLabelText('Start date')).toHaveValue('2026-08-01')
      expect(screen.getByLabelText('End date')).toHaveValue('2026-08-07')
    })

    it('renders the "period not set" default (Sprint\'s own dates, not a crash) for a legacy plan that only has workingDays', async () => {
      teamSprintPlanDoc = {
        _id: 'plan-legacy',
        teamId: 'team-a',
        sprintId: 'sprint-2',
        holidays: [],
        workingDays: 9,
      }
      fetchMock = stubFetchWithSprint(sprintWithJiraDates)
      render(<PlanningView team={team} />)

      const form = await openPeriodForm()
      expect(within(form).getByLabelText('Start date')).toHaveValue('2026-08-01')
      expect(within(form).getByLabelText('End date')).toHaveValue('2026-08-07')
    })

    describe('collapsible edit panel', () => {
      it('does not render the form on initial sprint selection - closed by default', async () => {
        fetchMock = stubFetchWithSprint(sprintWithJiraDates)
        render(<PlanningView team={team} />)

        // Wait for the toggle itself (proves the sprint has resolved and
        // the row has settled) before asserting the form's absence.
        await screen.findByRole('button', { name: /^(set|edit) period$/i })
        expect(screen.queryByLabelText('Sprint period')).not.toBeInTheDocument()
      })

      it('reveals the form on click and swaps the toggle to the close affordance', async () => {
        fetchMock = stubFetchWithSprint(sprintWithJiraDates)
        render(<PlanningView team={team} />)

        const toggle = await screen.findByRole('button', { name: /^(set|edit) period$/i })
        fireEvent.click(toggle)

        expect(await screen.findByLabelText('Sprint period')).toBeInTheDocument()
        expect(screen.getByRole('button', { name: 'Close period' })).toBeInTheDocument()
        expect(screen.queryByRole('button', { name: /^(set|edit) period$/i })).not.toBeInTheDocument()
      })

      it('hides the form again on close, restoring the edit/set-period toggle', async () => {
        fetchMock = stubFetchWithSprint(sprintWithJiraDates)
        render(<PlanningView team={team} />)
        await openPeriodForm()

        fireEvent.click(screen.getByRole('button', { name: 'Close period' }))

        expect(screen.queryByLabelText('Sprint period')).not.toBeInTheDocument()
        expect(await screen.findByRole('button', { name: /^(set|edit) period$/i })).toBeInTheDocument()
      })

      it('renders the revealed form before EpicPillStrip in the DOM, not after it', async () => {
        fetchMock = stubFetchWithSprint(sprintWithJiraDates)
        render(<PlanningView team={team} />)
        const form = await openPeriodForm()

        const strip = screen.getByLabelText('Active epics')
        // DOCUMENT_POSITION_FOLLOWING on the strip (from the form's
        // perspective) means the strip comes after the form in the DOM.
        expect(form.compareDocumentPosition(strip) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
      })

      it('keeps rendering capacity cards while the panel is closed, whenever planConfigured is true - the two are independent', async () => {
        render(<PlanningView team={team} />)

        await waitFor(() => expect(screen.getByText('32h planned')).toBeInTheDocument())
        expect(screen.queryByLabelText('Sprint period')).not.toBeInTheDocument()
      })

      it('labels the toggle "Set period" when the sprint has no plan configured yet', async () => {
        fetchMock = stubFetchWithSprint(sprintWithJiraDates)
        const base = fetchMock
        // Force planConfigured=false the same way the real capacity route
        // does - a 404 from GET .../capacity - independent of whether a
        // period doc has been saved (the toggle's copy is driven by
        // planConfigured, not sprintPeriod, per this feature's decision).
        fetchMock = vi.fn((url, init) => {
          const href = String(url)
          if (href.includes('/capacity')) return jsonResponse({ error: 'not found' }, 404)
          return base(url, init)
        })
        vi.stubGlobal('fetch', fetchMock)

        render(<PlanningView team={team} />)

        expect(await screen.findByRole('button', { name: 'Set period' })).toBeInTheDocument()
      })

      it('labels the toggle "Edit period" once a plan is already configured', async () => {
        fetchMock = stubFetchWithSprint(sprintWithJiraDates)
        render(<PlanningView team={team} />)

        expect(await screen.findByRole('button', { name: 'Edit period' })).toBeInTheDocument()
      })
    })
  })

  describe('Sprint leave grid (.scratch/sprint-leave-picker/spec.md)', () => {
    // 2026-08-03 (Mon) .. 2026-08-07 (Fri): 5 working days, no holidays -
    // matches the timezone-bug regression precedent elsewhere in this file
    // (Aug 1 is a Saturday, so a naive calendar-day slice would misplace the
    // boundary). Set directly as the *saved* plan (not the Sprint's own
    // Jira dates) so sprintPeriod resolves without needing the period form
    // opened first.
    function fiveDayPlan(overrides: Partial<NonNullable<typeof teamSprintPlanDoc>> = {}) {
      return {
        _id: 'plan-1',
        teamId: 'team-a',
        sprintId: 'sprint-1',
        startDate: '2026-08-03',
        endDate: '2026-08-07',
        holidays: [],
        workingDays: 5,
        ...overrides,
      }
    }

    function gridCapacityRow(overrides: Partial<SprintCapacity> = {}): SprintCapacity {
      return {
        teamMembershipId: 'm1',
        personId: 'p1',
        personName: 'Ada Lovelace',
        role: 'SE',
        capacityPercentOverride: null,
        effectivePercentage: 80,
        leaveDays: 0,
        extraHours: 0,
        capacityEntryId: null,
        leaveEntries: [],
        total: 40, // (5 working days - 0 leave) * 8
        available: 32, // 40 * 0.8
        planned: 0,
        remaining: 32,
        ...overrides,
      }
    }

    // The grid now lives inside the (closed-by-default) period edit panel -
    // see the "collapsible edit panel" describe above - so every test here
    // opens the panel first, same as the period-picker's own tests do.
    async function openPeriodForm(): Promise<HTMLElement> {
      const toggle = await screen.findByRole('button', { name: /^(set|edit) period$/i })
      fireEvent.click(toggle)
      return screen.findByLabelText('Sprint period')
    }

    beforeEach(() => {
      teamSprintPlanDoc = fiveDayPlan()
      capacityData = [
        gridCapacityRow(),
        gridCapacityRow({ teamMembershipId: 'm2', personId: 'p2', personName: 'Grace Hopper', role: 'QA' }),
      ]
    })

    it('renders one column per working date and one row per membership', async () => {
      render(<PlanningView team={team} />)
      await openPeriodForm()

      const adaCells = await screen.findAllByRole('button', { name: /Toggle leave for Ada Lovelace on/ })
      expect(adaCells).toHaveLength(5)
      const graceCells = screen.getAllByRole('button', { name: /Toggle leave for Grace Hopper on/ })
      expect(graceCells).toHaveLength(5)

      for (const date of ['2026-08-03', '2026-08-04', '2026-08-05', '2026-08-06', '2026-08-07']) {
        expect(screen.getByLabelText(`Toggle leave for Ada Lovelace on ${date}`)).toBeInTheDocument()
      }
    })

    it('grid columns match sprintPeriod\'s working dates exactly (not the raw calendar range) - excludes weekends and holidays', async () => {
      teamSprintPlanDoc = fiveDayPlan({ holidays: ['2026-08-05'] })

      render(<PlanningView team={team} />)
      await openPeriodForm()

      await screen.findByLabelText('Toggle leave for Ada Lovelace on 2026-08-03')
      // 2026-08-05 is now a holiday - not a working date, so no column for
      // it; 2026-08-01/02 (the weekend before the range) and 2026-08-08/09
      // (the weekend after) never had columns either.
      expect(screen.queryByLabelText('Toggle leave for Ada Lovelace on 2026-08-05')).not.toBeInTheDocument()
      expect(screen.queryByLabelText('Toggle leave for Ada Lovelace on 2026-08-01')).not.toBeInTheDocument()
      expect(screen.queryByLabelText('Toggle leave for Ada Lovelace on 2026-08-08')).not.toBeInTheDocument()
      expect(screen.getAllByRole('button', { name: /Toggle leave for Ada Lovelace on/ })).toHaveLength(4)
    })

    it('cycles a cell none -> half -> full -> none, calling POST then PATCH with the full updated entries array each time', async () => {
      render(<PlanningView team={team} />)
      await openPeriodForm()
      const cell = await screen.findByLabelText('Toggle leave for Ada Lovelace on 2026-08-03')

      fireEvent.click(cell)
      await waitFor(() =>
        expect(fetchMock).toHaveBeenCalledWith(
          'http://localhost:4100/api/capacity-entries',
          expect.objectContaining({
            method: 'POST',
            body: JSON.stringify({ teamMembershipId: 'm1', sprintId: 'sprint-1', leaveEntries: [{ date: '2026-08-03', portion: 'half' }] }),
          }),
        ),
      )
      // Waits for the post-save refreshPlan() round trip to actually commit
      // (not just for the save's own fetch call to have fired) before the
      // next click - otherwise the cell's onClick closure still captures the
      // pre-save (empty) entries array and would cycle from "none" again
      // instead of "half", producing a second POST instead of a PATCH.
      await screen.findByText('0.5d leave')

      fireEvent.click(cell)
      await waitFor(() =>
        expect(fetchMock).toHaveBeenCalledWith(
          'http://localhost:4100/api/capacity-entries/ce-m1',
          expect.objectContaining({
            method: 'PATCH',
            body: JSON.stringify({ leaveEntries: [{ date: '2026-08-03', portion: 'full' }] }),
          }),
        ),
      )
      await screen.findByText('1d leave')

      fireEvent.click(cell)
      await waitFor(() =>
        expect(fetchMock).toHaveBeenCalledWith(
          'http://localhost:4100/api/capacity-entries/ce-m1',
          expect.objectContaining({ method: 'PATCH', body: JSON.stringify({ leaveEntries: [] }) }),
        ),
      )
      await waitFor(() => expect(screen.queryByText('1d leave')).not.toBeInTheDocument())
    })

    it("updates the capacity card's Available/Remaining figure after a save", async () => {
      // Grace kept at a different effectivePercentage so her card's
      // "Xh avail" text is never ambiguous with Ada's, before or after the
      // save below.
      capacityData = [
        gridCapacityRow(),
        gridCapacityRow({
          teamMembershipId: 'm2',
          personId: 'p2',
          personName: 'Grace Hopper',
          role: 'QA',
          effectivePercentage: 100,
          total: 40,
          available: 40,
          remaining: 40,
        }),
      ]
      render(<PlanningView team={team} />)
      await openPeriodForm()
      // CapacityCard's root has a distinguishing `w-44` class - scope
      // lookups to it (rather than plain getByText('Ada Lovelace')) since
      // the grid's own sticky Person column also renders the name as plain
      // text.
      const adaCard = (await screen.findByText('32h avail')).closest('.w-44') as HTMLElement

      const cell = screen.getByLabelText('Toggle leave for Ada Lovelace on 2026-08-03')
      fireEvent.click(cell) // none -> half: 0.5 leave day, total = (5 - 0.5) * 8 = 36, available = 36 * 0.8 = 28.8

      await waitFor(() => expect(within(adaCard).getByText('28.8h avail')).toBeInTheDocument())
      expect(within(adaCard).getByText('28.8h remaining')).toBeInTheDocument()
    })

    it("reflows its columns live from the period form's own draft date range, before Save is clicked", async () => {
      render(<PlanningView team={team} />)
      await openPeriodForm()
      await screen.findByLabelText('Toggle leave for Ada Lovelace on 2026-08-07')

      // Narrows the saved 08-03..08-07 range down to 08-03..08-04 - purely a
      // local, unsaved edit (no Save click, no fetch).
      fireEvent.change(screen.getByLabelText('End date'), { target: { value: '2026-08-04' } })

      expect(screen.getAllByRole('button', { name: /Toggle leave for Ada Lovelace on/ })).toHaveLength(2)
      expect(screen.queryByLabelText('Toggle leave for Ada Lovelace on 2026-08-07')).not.toBeInTheDocument()
    })

    it("reflows its columns live when a chip is toggled into a holiday, before Save is clicked", async () => {
      render(<PlanningView team={team} />)
      await openPeriodForm()
      await screen.findByLabelText('Toggle leave for Ada Lovelace on 2026-08-05')

      fireEvent.click(screen.getByLabelText('Toggle holiday for 2026-08-05'))

      expect(screen.queryByLabelText('Toggle leave for Ada Lovelace on 2026-08-05')).not.toBeInTheDocument()
      expect(screen.getAllByRole('button', { name: /Toggle leave for Ada Lovelace on/ })).toHaveLength(4)
    })

    it('renders a draft column outside the saved period as non-interactive, since a click on it would either 400 (PATCH) or silently vanish on refetch (POST)', async () => {
      render(<PlanningView team={team} />)
      await openPeriodForm()
      await screen.findByLabelText('Toggle leave for Ada Lovelace on 2026-08-07')

      // Widens the saved range by one working day (08-10, a Monday) -
      // still unsaved.
      fireEvent.change(screen.getByLabelText('End date'), { target: { value: '2026-08-10' } })

      // 08-10 now has a column (the draft reflow above), but no clickable
      // cell - it isn't in the last-saved plan's working-day calendar yet.
      expect(screen.getAllByRole('button', { name: /Toggle leave for Ada Lovelace on/ })).toHaveLength(5)
      expect(screen.queryByLabelText('Toggle leave for Ada Lovelace on 2026-08-10')).not.toBeInTheDocument()
      expect(screen.getByLabelText('Leave for Ada Lovelace on 2026-08-10 unavailable until the period is saved')).toBeInTheDocument()
      // The already-saved 08-03..08-07 columns stay fully interactive.
      expect(screen.getByLabelText('Toggle leave for Ada Lovelace on 2026-08-07')).toBeInTheDocument()
    })

    describe('Extra allocation hours column', () => {
      it('renders an inline-edited hours input per person, defaulting from the server-stored value', async () => {
        capacityData = [
          gridCapacityRow({ extraHours: 3 }),
          gridCapacityRow({ teamMembershipId: 'm2', personId: 'p2', personName: 'Grace Hopper', role: 'QA' }),
        ]
        render(<PlanningView team={team} />)
        await openPeriodForm()

        expect(await screen.findByLabelText('Extra allocation hours for Ada Lovelace')).toHaveValue(3)
        expect(screen.getByLabelText('Extra allocation hours for Grace Hopper')).toHaveValue(0)
      })

      it('commits a typed value on blur, POSTing then PATCHing extraHours, and reduces Available/Remaining unscaled', async () => {
        render(<PlanningView team={team} />)
        await openPeriodForm()
        const input = await screen.findByLabelText('Extra allocation hours for Ada Lovelace')

        fireEvent.change(input, { target: { value: '4' } })
        fireEvent.blur(input)

        await waitFor(() =>
          expect(fetchMock).toHaveBeenCalledWith(
            'http://localhost:4100/api/capacity-entries',
            expect.objectContaining({
              method: 'POST',
              body: JSON.stringify({ teamMembershipId: 'm1', sprintId: 'sprint-1', extraHours: 4 }),
            }),
          ),
        )
        // available = 40 (total) * 0.8 - 4 (extraHours, unscaled) = 28
        await waitFor(() => expect(screen.getByText('28h avail')).toBeInTheDocument())

        fireEvent.change(input, { target: { value: '6' } })
        fireEvent.blur(input)

        await waitFor(() =>
          expect(fetchMock).toHaveBeenCalledWith(
            'http://localhost:4100/api/capacity-entries/ce-m1',
            expect.objectContaining({ method: 'PATCH', body: JSON.stringify({ extraHours: 6 }) }),
          ),
        )
        await waitFor(() => expect(screen.getByText('26h avail')).toBeInTheDocument())
      })

      it('formats the Total column as days/hours (e.g. "1d 4h"), combining leave hours and extra hours', async () => {
        capacityData = [gridCapacityRow({ leaveDays: 1, extraHours: 4 })]
        render(<PlanningView team={team} />)
        await openPeriodForm()

        expect(await screen.findByText('1d 4h')).toBeInTheDocument()
      })
    })
  })
})
