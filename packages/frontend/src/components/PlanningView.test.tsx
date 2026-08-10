import type { DragEndEvent } from '@dnd-kit/core'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { useRef, type ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from 'vitest'
import { PlanningView } from './PlanningView'
import type {
  DevQaRoleResolution,
  Epic,
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

// Configures the next POST /api/sprint-plan-entries/sync stub response
// (ticket 19's "Sync plan" tests): bumps every ticket's lastSyncedAt to now,
// and - when set - reassigns one entry's ticket to a different accountId,
// mirroring the real reassignment-reset behavior that moves a badge into
// its new assignee's row (routes/sprintPlanEntries.ts's
// applyReassignmentResets).
let syncReassign: { entryId: string; newAccountId: string } | null = null

function stubFetch(): FetchMock {
  const mock: FetchMock = vi.fn((url, init) => {
    const href = String(url)
    const method = init?.method ?? 'GET'

    if (href.includes('/api/sprints')) return jsonResponse([sprint])
    if (href.includes('/api/team-memberships')) return jsonResponse([membershipAda, membershipGrace])
    if (href.includes('/api/epics')) return jsonResponse([epicRow])

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

    it("only patches a placement's own role field, never a co-placed role sharing the same entry or an unrelated plain order", async () => {
      // eBoth is a Split ticket resolved dev *and* qa to Ada - it lands in
      // Ada's row twice, once per role (devOrder 0, qaOrder 0). eDevOnly is
      // a second Split ticket resolved dev to Ada (qa to Grace, elsewhere) -
      // devOrder 1, giving the dev-role group two members so a drag among
      // them produces a real devOrder change. Dragging eDevOnly's dev badge
      // ahead of eBoth's dev badge must only ever patch devOrder - eBoth's
      // own qaOrder (same entry id!) and e1's unrelated plain order must
      // never be touched (ticket 19: "dragging one only ever writes that
      // role's own devOrder/qaOrder, never the other").
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

      await waitFor(() =>
        expect(fetchMock).toHaveBeenCalledWith(
          'http://localhost:4100/api/sprint-plan-entries/e-both',
          expect.objectContaining({ method: 'PATCH', body: JSON.stringify({ devOrder: 1 }) }),
        ),
      )
      expect(fetchMock).toHaveBeenCalledWith(
        'http://localhost:4100/api/sprint-plan-entries/e-devonly',
        expect.objectContaining({ method: 'PATCH', body: JSON.stringify({ devOrder: 0 }) }),
      )
      expect(fetchMock).not.toHaveBeenCalledWith(
        'http://localhost:4100/api/sprint-plan-entries/e-both',
        expect.objectContaining({ body: expect.stringContaining('qaOrder') }),
      )
      expect(fetchMock).not.toHaveBeenCalledWith('http://localhost:4100/api/sprint-plan-entries/e1', expect.anything())
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
      const badgeBefore = await within(adaRow).findByText('900')
      expect(badgeBefore).toHaveAttribute('title', expect.stringContaining('2h ago'))

      fireEvent.click(screen.getByRole('button', { name: 'Sync plan' }))

      await waitFor(() => {
        const badgeAfter = within(adaRow).getByText('900')
        expect(badgeAfter).toHaveAttribute('title', expect.stringContaining('just now'))
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
})
