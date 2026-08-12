import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { GanttChartButton } from './SprintGanttChart'
import type { SprintPeriod } from '../hooks/useSprintPlan'
import type { DevQaRoleResolution, Person, SprintCapacity, SprintPlanEntry, TeamMembership, Ticket } from '../types'

// SVAR's real Gantt renders to <canvas>-backed layout jsdom can't provide
// (`HTMLCanvasElement#getContext`, real box metrics) - same posture as
// PlanningView.test.tsx stubbing @dnd-kit's DndContext rather than
// re-testing a third-party library's own rendering contract. Stubbed here
// with a plain list of the `tasks` prop it was handed, so these tests cover
// this file's own task-tree building (person rows, ticket-03 exclusion,
// ticket-04 placement dates feeding through) without depending on SVAR's
// internal chart/canvas implementation.
vi.mock('@svar-ui/react-gantt', () => ({
  Gantt: ({ tasks }: { tasks: { id: string | number; text?: string; parent?: string | number }[] }) => (
    <ul aria-label="Gantt tasks">
      {tasks.map((t) => (
        <li key={String(t.id)}>{t.text}</li>
      ))}
    </ul>
  ),
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

describe('GanttChartButton', () => {
  it('renders a "Gantt chart" trigger button, closed by default', () => {
    render(<GanttChartButton memberships={[]} entries={[]} capacity={[]} sprintPeriod={sprintPeriod} />)
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
    render(<GanttChartButton memberships={[adaMembership]} entries={[]} capacity={[]} sprintPeriod={null} />)
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
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: 'Gantt chart' }))
    await waitFor(() => expect(screen.getByText('Ada')).toBeInTheDocument())
    // Only the resolved Dev bar should render - the needs-assignment QA role
    // never appears anywhere on the chart.
    expect(screen.getAllByText(/PROJ-9/)).toHaveLength(1)
    expect(screen.getByText(/PROJ-9 \[DEV\]/)).toBeInTheDocument()
  })
})
