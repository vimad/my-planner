import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { GanttChartButton } from './SprintGanttChart'
import type { SprintPeriod } from '../hooks/useSprintPlan'
import type { DevQaRoleResolution, Person, SprintCapacity, SprintPlanEntry, TeamMembership, Ticket } from '../types'

// SVAR's real Gantt renders to <canvas>-backed layout jsdom can't provide
// (`HTMLCanvasElement#getContext`, real box metrics) - same posture as
// PlanningView.test.tsx stubbing @dnd-kit's DndContext rather than
// re-testing a third-party library's own rendering contract. Stubbed here
// with a plain list of the `tasks`/`links` props it was handed - each task
// carries its real `id` as a `data-id` attribute (mirroring SVAR's own real
// DOM output per ticket 01's prototype findings) so these tests can assert
// on this file's own task-tree building (person rows, ticket-03 exclusion,
// ticket-04 placement dates, ticket-08 leave/holiday siblings and Dev/QA
// link ids feeding through) without depending on SVAR's internal
// chart/canvas implementation.
//
// Ticket 09's drag readback (ticket 01's confirmed `init`/`api.on('update-
// task', ...)`/`api.getTask` contract) is exercised here by capturing the
// `init` callback SprintGanttChart passes in and handing it a minimal fake
// `IApi` - `on('update-task', cb)` stashes `cb` in `updateTaskHandler` so a
// test can call it directly (simulating SVAR firing the event), and
// `getTask(id)` looks the id up in the same `tasks` array the mocked
// `<Gantt>` was rendered with (optionally overridden per-test via
// `setFakeTaskOverride`, simulating "the user dragged this bar to a new
// date").
let updateTaskHandler: ((ev: { id: string | number; inProgress?: boolean }) => void) | null = null
let lastGanttProps: Record<string, unknown> | null = null
const fakeTaskOverrides = new Map<string, { start?: Date; parent?: string | number }>()

function setFakeTaskOverride(id: string, override: { start?: Date; parent?: string | number }) {
  fakeTaskOverrides.set(id, override)
}

// Mirrors updateTaskHandler above - captures the `drag-task` interceptor
// SprintGanttChart registers to block leave/holiday bars from being dragged
// at all (see the component's handleInit). Returns the interceptor's own
// return value so a test can assert whether a given drag was cancelled
// (`false`) or allowed through (`undefined`).
let dragTaskInterceptor: ((ev: { id: string | number }) => boolean | undefined) | null = null

vi.mock('@svar-ui/react-gantt', () => ({
  Gantt: (props: {
    tasks: { id: string | number; text?: string; parent?: string | number; start?: Date }[]
    links?: { id: string | number; source: string | number; target: string | number; type: string }[]
    init?: (api: unknown) => void
  }) => {
    lastGanttProps = props
    const { tasks, links, init } = props
    if (init) {
      init({
        on: (event: string, cb: (ev: { id: string | number; inProgress?: boolean }) => void) => {
          if (event === 'update-task') updateTaskHandler = cb
        },
        intercept: (event: string, cb: (ev: { id: string | number }) => boolean | undefined) => {
          if (event === 'drag-task') dragTaskInterceptor = cb
        },
        getTask: (id: string | number) => {
          const base = tasks.find((t) => String(t.id) === String(id)) ?? {}
          const override = fakeTaskOverrides.get(String(id))
          return { ...base, ...override }
        },
      })
    }
    return (
      <ul aria-label="Gantt tasks">
        {tasks.map((t) => (
          <li key={String(t.id)} data-id={String(t.id)}>
            {t.text}
          </li>
        ))}
        {(links ?? []).map((l) => (
          <li key={String(l.id)} data-testid="gantt-link" data-source={String(l.source)} data-target={String(l.target)} data-link-type={l.type} />
        ))}
      </ul>
    )
  },
  WillowDark: ({ children }: { children: ReactNode }) => <>{children}</>,
}))

const ada: Person = { _id: 'p1', name: 'Ada', email: 'ada@example.com', jiraAccountId: 'acc-ada' }
const bob: Person = { _id: 'p2', name: 'Bob', email: 'bob@example.com', jiraAccountId: 'acc-bob' }
const adaMembership: TeamMembership = { _id: 'm1', teamId: 't1', personId: ada, role: 'SE', capacityPercentOverride: null }
const bobMembership: TeamMembership = { _id: 'm2', teamId: 't1', personId: bob, role: 'SE', capacityPercentOverride: null }

function ticket(overrides: Partial<Ticket> & { jiraKey: string }): Ticket {
  return {
    _id: overrides.jiraKey,
    type: 'Task',
    title: 'A ticket',
    status: 'To Do',
    assigneeAccountId: null,
    assigneeDisplayName: null,
    assigneeEmail: null,
    estimateHours: null,
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

function nonSplitEntry(id: string, t: Ticket, plannedHours: number, assigneeAccountId: string | null): SprintPlanEntry {
  return {
    _id: id,
    teamId: 't1',
    sprintId: 's1',
    ticketId: { ...t, assigneeAccountId },
    order: 0,
    devOrder: null,
    qaOrder: null,
    estimateHours: plannedHours,
    planHours: null,
    spillHours: null,
    plannedHours,
  }
}

function needsAssignment(): DevQaRoleResolution {
  return { status: 'needs-assignment', jiraAssigneeDisplayName: null }
}
function resolved(personId: string): DevQaRoleResolution {
  return { status: 'resolved', source: 'subtask', personId, jiraAssigneeDisplayName: null }
}

function capacityFor(membership: TeamMembership): SprintCapacity {
  return {
    teamMembershipId: membership._id!,
    personId: (membership.personId as Person)._id!,
    personName: (membership.personId as Person).name,
    role: membership.role,
    capacityPercentOverride: null,
    effectivePercentage: 100,
    leaveDays: 0,
    extraHours: 0,
    capacityEntryId: null,
    leaveEntries: [],
    total: 0,
    available: 0,
    planned: 0,
    remaining: 0,
  }
}

const sprintPeriod: SprintPeriod = { startDate: '2026-08-10', endDate: '2026-08-21', holidays: [], workingDays: 10 }
const noop = () => {}

beforeEach(() => {
  updateTaskHandler = null
  dragTaskInterceptor = null
  lastGanttProps = null
  fakeTaskOverrides.clear()
})

describe('GanttChartButton', () => {
  it('renders a "Gantt chart" trigger button, closed by default', () => {
    render(<GanttChartButton memberships={[]} entries={[]} capacity={[]} sprintPeriod={sprintPeriod} onDragReschedule={noop} />)
    expect(screen.getByRole('button', { name: 'Gantt chart' })).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Sprint Gantt chart' })).not.toBeInTheDocument()
  })

  it('opens a modal rendering one row per membership, and closes on the × button', async () => {
    const entry = nonSplitEntry('e1', ticket({ jiraKey: 'PROJ-1' }), 16, 'acc-ada')
    render(
      <GanttChartButton
        memberships={[adaMembership, bobMembership]}
        entries={[entry]}
        capacity={[capacityFor(adaMembership), capacityFor(bobMembership)]}
        sprintPeriod={sprintPeriod}
        onDragReschedule={noop}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Gantt chart' }))
    expect(await screen.findByRole('heading', { name: 'Sprint Gantt chart' })).toBeInTheDocument()

    // SVAR's own grid pane renders each person's row label as cell text.
    await waitFor(() => expect(screen.getByText('Ada')).toBeInTheDocument())
    expect(screen.getByText('Bob')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Close' }))
    expect(screen.queryByRole('heading', { name: 'Sprint Gantt chart' })).not.toBeInTheDocument()
  })

  it('shows a "set the sprint period" message instead of the chart when no period is configured', async () => {
    render(<GanttChartButton memberships={[adaMembership]} entries={[]} capacity={[]} sprintPeriod={null} onDragReschedule={noop} />)
    fireEvent.click(screen.getByRole('button', { name: 'Gantt chart' }))
    expect(await screen.findByText(/Set this sprint's period/)).toBeInTheDocument()
  })

  it('never renders a placement with no resolved assignee (ticket 03) - e.g. a needs-assignment Split role', async () => {
    const split = ticket({ jiraKey: 'PROJ-9', type: 'Story' })
    const splitEntry: SprintPlanEntry = {
      _id: 'e9',
      teamId: 't1',
      sprintId: 's1',
      ticketId: split,
      order: 0,
      devOrder: 0,
      qaOrder: 0,
      devQa: { dev: resolved('p1'), qa: needsAssignment() },
      devEstimateHours: 8,
      devPlanHours: null,
      devSpillHours: null,
      devPlannedHours: 8,
      qaEstimateHours: 4,
      qaPlanHours: null,
      qaSpillHours: null,
      qaPlannedHours: 4,
    }
    render(
      <GanttChartButton
        memberships={[adaMembership]}
        entries={[splitEntry]}
        capacity={[capacityFor(adaMembership)]}
        sprintPeriod={sprintPeriod}
        onDragReschedule={noop}
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: 'Gantt chart' }))
    await waitFor(() => expect(screen.getByText('Ada')).toBeInTheDocument())
    // Only the resolved Dev bar should render - the needs-assignment QA role
    // never appears anywhere on the chart.
    expect(screen.getAllByText(/PROJ-9/)).toHaveLength(1)
    expect(screen.getByText(/PROJ-9 \[DEV\]/)).toBeInTheDocument()
  })

  it('renders a full-leave day and a sprint holiday as red-keyed sibling tasks, and a half-leave day as amber-keyed (ticket 08)', async () => {
    const capacity: SprintCapacity = {
      ...capacityFor(adaMembership),
      leaveEntries: [
        { date: '2026-08-11', portion: 'full' },
        { date: '2026-08-12', portion: 'half' },
      ],
    }
    const periodWithHoliday: SprintPeriod = { ...sprintPeriod, holidays: ['2026-08-13'] }
    render(
      <GanttChartButton memberships={[adaMembership]} entries={[]} capacity={[capacity]} sprintPeriod={periodWithHoliday} onDragReschedule={noop} />,
    )
    fireEvent.click(screen.getByRole('button', { name: 'Gantt chart' }))
    await waitFor(() => expect(screen.getByText('Ada')).toBeInTheDocument())

    // Full-leave and holiday days both use the `leave-full-` id prefix the
    // component's CSS targets for red-400/500 shading; the half-leave day
    // uses `leave-half-` for amber-300/500 - not `highlightTime`, per
    // ticket 01's confirmed approach. Queried against document.body, not the
    // render `container`, since the modal now portals out of it (see
    // SprintGanttChart.tsx's GanttChartModal comment).
    expect(document.body.querySelector('[data-id="leave-full-leave-m1-2026-08-11"]')).not.toBeNull()
    expect(document.body.querySelector('[data-id="leave-full-holiday-m1-2026-08-13"]')).not.toBeNull()
    expect(document.body.querySelector('[data-id="leave-half-leave-m1-2026-08-12"]')).not.toBeNull()
  })

  it("links a Split ticket's rendered Dev and QA bars across two different rows, via a native s2s link and matching dev-/qa- data-ids (ticket 08)", async () => {
    const split = ticket({ jiraKey: 'PROJ-201', type: 'Story' })
    const splitEntry: SprintPlanEntry = {
      _id: 'e201',
      teamId: 't1',
      sprintId: 's1',
      ticketId: split,
      order: 0,
      devOrder: 0,
      qaOrder: 0,
      devQa: { dev: resolved('p1'), qa: resolved('p2') },
      devEstimateHours: 8,
      devPlanHours: null,
      devSpillHours: null,
      devPlannedHours: 8,
      qaEstimateHours: 4,
      qaPlanHours: null,
      qaSpillHours: null,
      qaPlannedHours: 4,
    }
    render(
      <GanttChartButton
        memberships={[adaMembership, bobMembership]}
        entries={[splitEntry]}
        capacity={[capacityFor(adaMembership), capacityFor(bobMembership)]}
        sprintPeriod={sprintPeriod}
        onDragReschedule={noop}
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: 'Gantt chart' }))
    await waitFor(() => expect(screen.getByText('Ada')).toBeInTheDocument())

    // Deterministic dev-<jiraKey>/qa-<jiraKey> ids, not the default
    // ticket-07 `bar.key` - what the `[data-id^=":dev-"]`/`[data-id^=":qa-"]`
    // CSS rules and the native dependency link both target. Queried against
    // document.body since the modal portals out of the render container.
    expect(document.body.querySelector('[data-id="dev-PROJ-201"]')).not.toBeNull()
    expect(document.body.querySelector('[data-id="qa-PROJ-201"]')).not.toBeNull()

    const link = screen.getByTestId('gantt-link')
    expect(link).toHaveAttribute('data-source', 'dev-PROJ-201')
    expect(link).toHaveAttribute('data-target', 'qa-PROJ-201')
    expect(link).toHaveAttribute('data-link-type', 's2s')
  })

  it("does not link a Split ticket whose QA role is still needs-assignment (ticket 03's exclusion) - no link, default bar id kept", async () => {
    const split = ticket({ jiraKey: 'PROJ-9', type: 'Story' })
    const splitEntry: SprintPlanEntry = {
      _id: 'e9',
      teamId: 't1',
      sprintId: 's1',
      ticketId: split,
      order: 0,
      devOrder: 0,
      qaOrder: 0,
      devQa: { dev: resolved('p1'), qa: needsAssignment() },
      devEstimateHours: 8,
      devPlanHours: null,
      devSpillHours: null,
      devPlannedHours: 8,
      qaEstimateHours: 4,
      qaPlanHours: null,
      qaSpillHours: null,
      qaPlannedHours: 4,
    }
    render(
      <GanttChartButton memberships={[adaMembership]} entries={[splitEntry]} capacity={[capacityFor(adaMembership)]} sprintPeriod={sprintPeriod} onDragReschedule={noop} />,
    )
    fireEvent.click(screen.getByRole('button', { name: 'Gantt chart' }))
    await waitFor(() => expect(screen.getByText('Ada')).toBeInTheDocument())

    expect(document.body.querySelector('[data-id="e9-dev"]')).not.toBeNull()
    expect(document.body.querySelector('[data-id^="dev-"]')).toBeNull()
    expect(screen.queryByTestId('gantt-link')).not.toBeInTheDocument()
  })

  describe('drag-to-reschedule (ticket 09)', () => {
    it('is not readonly, and wires an init callback for SVAR\'s update-task readback', async () => {
      render(
        <GanttChartButton
          memberships={[adaMembership]}
          entries={[]}
          capacity={[capacityFor(adaMembership)]}
          sprintPeriod={sprintPeriod}
          onDragReschedule={noop}
        />,
      )
      fireEvent.click(screen.getByRole('button', { name: 'Gantt chart' }))
      await waitFor(() => expect(screen.getByText('Ada')).toBeInTheDocument())

      expect(lastGanttProps?.readonly).toBeUndefined()
      expect(typeof lastGanttProps?.init).toBe('function')
    })

    it('on drop, persists the recomputed order + start-date override in one patch (Ticket 05 write-back composition)', async () => {
      const onDragReschedule = vi.fn()
      const entry = nonSplitEntry('e1', ticket({ jiraKey: 'PROJ-1' }), 16, 'acc-ada')
      render(
        <GanttChartButton
          memberships={[adaMembership]}
          entries={[entry]}
          capacity={[capacityFor(adaMembership)]}
          sprintPeriod={sprintPeriod}
          onDragReschedule={onDragReschedule}
        />,
      )
      fireEvent.click(screen.getByRole('button', { name: 'Gantt chart' }))
      await waitFor(() => expect(screen.getByText('Ada')).toBeInTheDocument())

      // Simulate the user dragging PROJ-1's bar to start Thursday 8/13
      // instead of its auto-placed Monday 8/10 - month is 0-indexed, so
      // August is 7.
      setFakeTaskOverride('e1-main', { start: new Date(2026, 7, 13) })
      updateTaskHandler?.({ id: 'e1-main', inProgress: false })

      expect(onDragReschedule).toHaveBeenCalledTimes(1)
      expect(onDragReschedule).toHaveBeenCalledWith([{ entryId: 'e1', body: { order: 0, ganttStartDate: '2026-08-13' } }])
    })

    it('ignores an in-progress drag frame - only the final drop autosaves (no separate Save button/state)', async () => {
      const onDragReschedule = vi.fn()
      const entry = nonSplitEntry('e1', ticket({ jiraKey: 'PROJ-1' }), 16, 'acc-ada')
      render(
        <GanttChartButton
          memberships={[adaMembership]}
          entries={[entry]}
          capacity={[capacityFor(adaMembership)]}
          sprintPeriod={sprintPeriod}
          onDragReschedule={onDragReschedule}
        />,
      )
      fireEvent.click(screen.getByRole('button', { name: 'Gantt chart' }))
      await waitFor(() => expect(screen.getByText('Ada')).toBeInTheDocument())

      setFakeTaskOverride('e1-main', { start: new Date(2026, 7, 13) })
      updateTaskHandler?.({ id: 'e1-main', inProgress: true })

      expect(onDragReschedule).not.toHaveBeenCalled()
    })

    it("never reschedules from the hidden synthetic person-row's own summary bar (no cross-row drag)", async () => {
      const onDragReschedule = vi.fn()
      const entry = nonSplitEntry('e1', ticket({ jiraKey: 'PROJ-1' }), 16, 'acc-ada')
      render(
        <GanttChartButton
          memberships={[adaMembership]}
          entries={[entry]}
          capacity={[capacityFor(adaMembership)]}
          sprintPeriod={sprintPeriod}
          onDragReschedule={onDragReschedule}
        />,
      )
      fireEvent.click(screen.getByRole('button', { name: 'Gantt chart' }))
      await waitFor(() => expect(screen.getByText('Ada')).toBeInTheDocument())

      updateTaskHandler?.({ id: 'person-m1', inProgress: false })

      expect(onDragReschedule).not.toHaveBeenCalled()
    })

    it('blocks dragging a leave/holiday bar via a drag-task interceptor (ticket 08: read-only, no click/drag affordance)', async () => {
      const capacity: SprintCapacity = {
        ...capacityFor(adaMembership),
        leaveEntries: [{ date: '2026-08-11', portion: 'full' }],
      }
      render(<GanttChartButton memberships={[adaMembership]} entries={[]} capacity={[capacity]} sprintPeriod={sprintPeriod} onDragReschedule={noop} />)
      fireEvent.click(screen.getByRole('button', { name: 'Gantt chart' }))
      await waitFor(() => expect(screen.getByText('Ada')).toBeInTheDocument())

      expect(dragTaskInterceptor).not.toBeNull()
      expect(dragTaskInterceptor?.({ id: 'leave-full-leave-m1-2026-08-11' })).toBe(false)
      // An ordinary ticket bar's drag is left uncancelled (interceptor
      // returns undefined, not false) - only leave/holiday ids are blocked.
      expect(dragTaskInterceptor?.({ id: 'e1-main' })).toBeUndefined()
    })
  })
})
