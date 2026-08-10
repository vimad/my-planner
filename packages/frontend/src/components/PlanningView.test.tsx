import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from 'vitest'
import { PlanningView } from './PlanningView'
import type {
  DevQaRoleResolution,
  Person,
  Sprint,
  SprintCapacity,
  SprintPlanEntry,
  Team,
  TeamMembership,
  Ticket,
} from '../types'

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
function resolvedSubtask(personId: string): DevQaRoleResolution {
  return { status: 'resolved', source: 'subtask', personId }
}
function resolvedOverride(personId: string): DevQaRoleResolution {
  return { status: 'resolved', source: 'override', personId }
}
function needsAssignment(): DevQaRoleResolution {
  return { status: 'needs-assignment' }
}
function unmappedRole(accountId: string, displayName: string): DevQaRoleResolution {
  return { status: 'unmapped', assigneeAccountId: accountId, assigneeDisplayName: displayName, assigneeEmail: null }
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

const capacityRow: SprintCapacity = {
  teamMembershipId: 'm1',
  personId: 'p1',
  personName: 'Ada Lovelace',
  role: 'SE',
  capacityPercentOverride: null,
  effectivePercentage: 80,
  leaveDays: 1,
  total: 72,
  available: 57.6,
  planned: 32,
  remaining: 25.6,
}

let entriesData: SprintPlanEntry[]
let fetchMock: FetchMock

function entry(
  id: string,
  t: Ticket,
  order: number,
  extra?: { devOrder?: number | null; qaOrder?: number | null; devQa?: { dev: DevQaRoleResolution; qa: DevQaRoleResolution } },
): SprintPlanEntry {
  return {
    _id: id,
    teamId: 'team-a',
    sprintId: 'sprint-1',
    ticketId: t,
    order,
    devOrder: extra?.devOrder ?? null,
    qaOrder: extra?.qaOrder ?? null,
    // `devQa` is present only for a Split entry - omitted (not null) for a
    // non-split one, matching the real GET contract exactly (ticket 23's
    // comments).
    ...(extra?.devQa ? { devQa: extra.devQa } : {}),
  }
}

function stubFetch(): FetchMock {
  const mock: FetchMock = vi.fn((url, init) => {
    const href = String(url)
    const method = init?.method ?? 'GET'

    if (href.includes('/api/sprints')) return jsonResponse([sprint])
    if (href.includes('/api/team-memberships')) return jsonResponse([membershipAda, membershipGrace])

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

    if (href.includes('/capacity')) return jsonResponse([capacityRow])

    return jsonResponse([])
  })
  vi.stubGlobal('fetch', mock)
  return mock
}

describe('PlanningView', () => {
  beforeEach(() => {
    entriesData = [entry('e1', adaTicket, 0), entry('e2', unmappedTicket, 0)]
    fetchMock = stubFetch()
  })

  afterEach(() => {
    vi.unstubAllGlobals()
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

  it('lands a ticket whose assignee is not on the team in the flagged unmapped row', async () => {
    render(<PlanningView team={team} />)

    // Same fix as above - wait on the badge itself, not just the row label.
    const unmappedRow = await screen.findByLabelText('Tickets for Unmapped')
    await waitFor(() => expect(within(unmappedRow).getByText('150')).toBeInTheDocument())
    expect(screen.getByText('⚠ Unmapped')).toBeInTheDocument()
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
    it("renders a Split ticket's badge under both its resolved dev and qa rows with DEV/QA sub-labels", async () => {
      entriesData = [...entriesData, entry('e-split', splitTicket, 1, { devQa: splitDevQa, devOrder: 0, qaOrder: 0 })]
      render(<PlanningView team={team} />)

      const adaRow = await screen.findByLabelText('Tickets for Ada Lovelace')
      await waitFor(() => expect(within(adaRow).getByText('300')).toBeInTheDocument())
      expect(within(adaRow).getByText('DEV')).toBeInTheDocument()

      const graceRow = screen.getByLabelText('Tickets for Grace Hopper')
      await waitFor(() => expect(within(graceRow).getByText('300')).toBeInTheDocument())
      expect(within(graceRow).getByText('QA')).toBeInTheDocument()
    })

    it('renders a non-split ticket in a single row, unchanged, with no role sub-label', async () => {
      render(<PlanningView team={team} />)

      const adaRow = await screen.findByLabelText('Tickets for Ada Lovelace')
      await waitFor(() => expect(within(adaRow).getByText('100')).toBeInTheDocument())
      expect(within(adaRow).queryByText('DEV')).not.toBeInTheDocument()
      expect(within(adaRow).queryByText('QA')).not.toBeInTheDocument()
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

    it('renders a resolved-via-Jira (subtask) role read-only in the popup, with an editable select for the other role', async () => {
      entriesData = [...entriesData, entry('e-needs-qa', needsQaTicket, 1, { devQa: needsQaDevQa })]
      render(<PlanningView team={team} />)

      const flagButton = await screen.findByRole('button', { name: 'Assign dev/qa for WOSMVP-400' })
      fireEvent.click(flagButton)

      const dialog = await screen.findByRole('dialog', { name: 'Assign dev/qa for WOSMVP-400' })
      expect(within(dialog).getByText(/Ada Lovelace.*from Jira/)).toBeInTheDocument()
      expect(within(dialog).queryByLabelText('Dev assignee')).not.toBeInTheDocument()
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
})
