import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { AtlasPlanningGanttButton } from './AtlasPlanningGanttChart'
import type { AtlasPlanningEntry, AtlasPlanningHoliday, AtlasPlanningLeaveMark, AtlasRosterMember } from '../types'

// SVAR's real Gantt renders to <canvas>-backed layout jsdom can't provide -
// same posture as SprintGanttChart.test.tsx stubbing the library rather than
// re-testing its own rendering contract. Stubbed here with a plain list of
// the `tasks` prop it was handed - each task carries its real `id` as a
// `data-id` attribute (mirroring SVAR's own real DOM output, per
// SprintGanttChart.test.tsx's own established convention) so these tests can
// assert on this file's own task-tree building (person rows, ticket bars,
// leave/holiday siblings) without depending on SVAR's internal
// chart/canvas implementation.
//
// The drag-to-reschedule readback (`init`/`api.on('update-task', ...)`/
// `api.getTask` contract) is exercised by capturing the `init` callback
// AtlasPlanningGanttChart passes in and handing it a minimal fake `IApi` -
// `on('update-task', cb)` stashes `cb` in `updateTaskHandler` so a test can
// call it directly (simulating SVAR firing the event), and `getTask(id)`
// looks the id up in the same `tasks` array the mocked `<Gantt>` was
// rendered with (optionally overridden per-test via `setFakeTaskOverride`,
// simulating "the user dragged this bar to a new date").
let updateTaskHandler: ((ev: { id: string | number; inProgress?: boolean }) => void) | null = null
let dragTaskInterceptor: ((ev: { id: string | number }) => boolean | undefined) | null = null
const fakeTaskOverrides = new Map<string, { start?: Date; end?: Date }>()

function setFakeTaskOverride(id: string, override: { start?: Date; end?: Date }) {
  fakeTaskOverrides.set(id, override)
}

vi.mock('@svar-ui/react-gantt', () => ({
  Gantt: (props: {
    tasks: { id: string | number; text?: string; parent?: string | number; start?: Date; end?: Date }[]
    init?: (api: unknown) => void
  }) => {
    const { tasks, init } = props
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
      </ul>
    )
  },
  WillowDark: ({ children }: { children: ReactNode }) => <>{children}</>,
}))

function member(id: string, name: string): AtlasRosterMember {
  return { _id: id, personId: { _id: `p-${id}`, name, email: `${name}@x.com`, jiraAccountId: `acc-${id}` }, createdAt: '2026-08-01T00:00:00.000Z' }
}

const alice = member('m1', 'Alice')
const bob = member('m2', 'Bob')

// 14 consecutive 'YYYY-MM-DD' dates starting at `startISO`, the same shape
// utils/rollingWindow.ts's computeRollingWindowDates produces - built here
// directly (rather than calling that util with a fixed `now`) so these
// tests own a fully deterministic window regardless of the real clock.
function makeWindowDates(startISO: string): string[] {
  const [y, m, d] = startISO.split('-').map(Number)
  const cursor = new Date(y, m - 1, d)
  const dates: string[] = []
  for (let i = 0; i < 14; i++) {
    const yyyy = cursor.getFullYear()
    const mm = String(cursor.getMonth() + 1).padStart(2, '0')
    const dd = String(cursor.getDate()).padStart(2, '0')
    dates.push(`${yyyy}-${mm}-${dd}`)
    cursor.setDate(cursor.getDate() + 1)
  }
  return dates
}

const windowDates = makeWindowDates('2026-08-10')

const entry1: AtlasPlanningEntry = { _id: 'e1', rosterMemberId: 'm1', jiraKey: 'WOSMVP-100', startDate: '2026-08-12', endDate: '2026-08-13' }
const entryUnset: AtlasPlanningEntry = { _id: 'e2', rosterMemberId: 'm2', jiraKey: 'WOSMVP-200', startDate: null, endDate: null }

const noop = () => {}

beforeEach(() => {
  updateTaskHandler = null
  dragTaskInterceptor = null
  fakeTaskOverrides.clear()
})

describe('AtlasPlanningGanttButton', () => {
  it('renders a "Gantt chart" trigger button, closed by default', () => {
    render(<AtlasPlanningGanttButton roster={[]} entries={[]} leaveMarks={[]} holidays={[]} windowDates={windowDates} onDragReschedule={noop} />)
    expect(screen.getByRole('button', { name: 'Gantt chart' })).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Planning Gantt chart' })).not.toBeInTheDocument()
  })

  it('opens a modal rendering one row per roster member, and closes on the × button', async () => {
    render(
      <AtlasPlanningGanttButton
        roster={[alice, bob]}
        entries={[entry1]}
        leaveMarks={[]}
        holidays={[]}
        windowDates={windowDates}
        onDragReschedule={noop}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Gantt chart' }))
    expect(await screen.findByRole('heading', { name: 'Planning Gantt chart' })).toBeInTheDocument()

    // SVAR's own grid pane renders each person's row label as cell text.
    await waitFor(() => expect(screen.getByText('Alice')).toBeInTheDocument())
    expect(screen.getByText('Bob')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Close' }))
    expect(screen.queryByRole('heading', { name: 'Planning Gantt chart' })).not.toBeInTheDocument()
  })

  it('shows an empty-roster message instead of the chart when no one is on the roster', async () => {
    render(<AtlasPlanningGanttButton roster={[]} entries={[]} leaveMarks={[]} holidays={[]} windowDates={windowDates} onDragReschedule={noop} />)
    fireEvent.click(screen.getByRole('button', { name: 'Gantt chart' }))
    expect(await screen.findByText('No one on the Atlas roster yet.')).toBeInTheDocument()
  })

  it("renders a bar for an attached ticket under its person's row, keyed to its entry id", async () => {
    render(
      <AtlasPlanningGanttButton roster={[alice]} entries={[entry1]} leaveMarks={[]} holidays={[]} windowDates={windowDates} onDragReschedule={noop} />,
    )
    fireEvent.click(screen.getByRole('button', { name: 'Gantt chart' }))
    await waitFor(() => expect(screen.getByText('Alice')).toBeInTheDocument())

    expect(document.body.querySelector('[data-id="entry-e1"]')).not.toBeNull()
    expect(screen.getByText('WOSMVP-100')).toBeInTheDocument()
  })

  it('never renders a ticket bar under the wrong person', async () => {
    render(
      <AtlasPlanningGanttButton
        roster={[alice, bob]}
        entries={[entry1]}
        leaveMarks={[]}
        holidays={[]}
        windowDates={windowDates}
        onDragReschedule={noop}
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: 'Gantt chart' }))
    await waitFor(() => expect(screen.getByText('Alice')).toBeInTheDocument())

    const bar = document.body.querySelector('[data-id="entry-e1"]')
    expect(bar?.closest('li')).not.toBeNull()
    // entry1 belongs to m1 (Alice) - only one ticket bar should exist at all.
    expect(document.body.querySelectorAll('[data-id^="entry-"]')).toHaveLength(1)
  })

  it('defaults a ticket with no dates yet to a 1-day bar on the window\'s first day, keyed with the "unset" id prefix', async () => {
    render(
      <AtlasPlanningGanttButton
        roster={[bob]}
        entries={[entryUnset]}
        leaveMarks={[]}
        holidays={[]}
        windowDates={windowDates}
        onDragReschedule={noop}
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: 'Gantt chart' }))
    await waitFor(() => expect(screen.getByText('Bob')).toBeInTheDocument())

    expect(document.body.querySelector('[data-id="entry-unset-e2"]')).not.toBeNull()
    expect(document.body.querySelector('[data-id="entry-e2"]')).toBeNull()
  })

  it('renders full-leave and half-leave marks plus a shared holiday as leave-prefixed sibling tasks', async () => {
    const leaveMarks: AtlasPlanningLeaveMark[] = [
      { _id: 'l1', rosterMemberId: 'm1', date: '2026-08-11', portion: 'full' },
      { _id: 'l2', rosterMemberId: 'm1', date: '2026-08-12', portion: 'half' },
    ]
    const holidays: AtlasPlanningHoliday[] = [{ _id: 'h1', date: '2026-08-13' }]
    render(
      <AtlasPlanningGanttButton
        roster={[alice]}
        entries={[]}
        leaveMarks={leaveMarks}
        holidays={holidays}
        windowDates={windowDates}
        onDragReschedule={noop}
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: 'Gantt chart' }))
    await waitFor(() => expect(screen.getByText('Alice')).toBeInTheDocument())

    expect(document.body.querySelector('[data-id="leave-full-leave-m1-2026-08-11"]')).not.toBeNull()
    expect(document.body.querySelector('[data-id="leave-half-leave-m1-2026-08-12"]')).not.toBeNull()
    expect(document.body.querySelector('[data-id="leave-full-holiday-m1-2026-08-13"]')).not.toBeNull()
  })

  describe('drag-to-reschedule', () => {
    it('on drop, calls onDragReschedule with the entry id and the resolved inclusive start/end dates', async () => {
      const onDragReschedule = vi.fn()
      render(
        <AtlasPlanningGanttButton
          roster={[alice]}
          entries={[entry1]}
          leaveMarks={[]}
          holidays={[]}
          windowDates={windowDates}
          onDragReschedule={onDragReschedule}
        />,
      )
      fireEvent.click(screen.getByRole('button', { name: 'Gantt chart' }))
      await waitFor(() => expect(screen.getByText('Alice')).toBeInTheDocument())

      // Simulate dragging WOSMVP-100's bar to start Fri 8/14 - SVAR's
      // exclusive `end` for a 2-day bar landing 8/14-8/15 would be 8/16.
      // Month is 0-indexed, so August is 7.
      setFakeTaskOverride('entry-e1', { start: new Date(2026, 7, 14), end: new Date(2026, 7, 16) })
      updateTaskHandler?.({ id: 'entry-e1', inProgress: false })

      expect(onDragReschedule).toHaveBeenCalledTimes(1)
      expect(onDragReschedule).toHaveBeenCalledWith('e1', '2026-08-14', '2026-08-15')
    })

    it('resolves a dragged, previously-unset placeholder bar back to its plain entry id', async () => {
      const onDragReschedule = vi.fn()
      render(
        <AtlasPlanningGanttButton
          roster={[bob]}
          entries={[entryUnset]}
          leaveMarks={[]}
          holidays={[]}
          windowDates={windowDates}
          onDragReschedule={onDragReschedule}
        />,
      )
      fireEvent.click(screen.getByRole('button', { name: 'Gantt chart' }))
      await waitFor(() => expect(screen.getByText('Bob')).toBeInTheDocument())

      setFakeTaskOverride('entry-unset-e2', { start: new Date(2026, 7, 15), end: new Date(2026, 7, 16) })
      updateTaskHandler?.({ id: 'entry-unset-e2', inProgress: false })

      expect(onDragReschedule).toHaveBeenCalledWith('e2', '2026-08-15', '2026-08-15')
    })

    it('ignores an in-progress drag frame - only the final drop autosaves', async () => {
      const onDragReschedule = vi.fn()
      render(
        <AtlasPlanningGanttButton
          roster={[alice]}
          entries={[entry1]}
          leaveMarks={[]}
          holidays={[]}
          windowDates={windowDates}
          onDragReschedule={onDragReschedule}
        />,
      )
      fireEvent.click(screen.getByRole('button', { name: 'Gantt chart' }))
      await waitFor(() => expect(screen.getByText('Alice')).toBeInTheDocument())

      setFakeTaskOverride('entry-e1', { start: new Date(2026, 7, 14), end: new Date(2026, 7, 16) })
      updateTaskHandler?.({ id: 'entry-e1', inProgress: true })

      expect(onDragReschedule).not.toHaveBeenCalled()
    })

    it("never reschedules from the hidden synthetic person row's own summary bar", async () => {
      const onDragReschedule = vi.fn()
      render(
        <AtlasPlanningGanttButton
          roster={[alice]}
          entries={[entry1]}
          leaveMarks={[]}
          holidays={[]}
          windowDates={windowDates}
          onDragReschedule={onDragReschedule}
        />,
      )
      fireEvent.click(screen.getByRole('button', { name: 'Gantt chart' }))
      await waitFor(() => expect(screen.getByText('Alice')).toBeInTheDocument())

      updateTaskHandler?.({ id: 'person-m1', inProgress: false })

      expect(onDragReschedule).not.toHaveBeenCalled()
    })

    it('blocks dragging a leave/holiday bar via a drag-task interceptor (read-only, no click/drag affordance)', async () => {
      const leaveMarks: AtlasPlanningLeaveMark[] = [{ _id: 'l1', rosterMemberId: 'm1', date: '2026-08-11', portion: 'full' }]
      render(
        <AtlasPlanningGanttButton
          roster={[alice]}
          entries={[entry1]}
          leaveMarks={leaveMarks}
          holidays={[]}
          windowDates={windowDates}
          onDragReschedule={noop}
        />,
      )
      fireEvent.click(screen.getByRole('button', { name: 'Gantt chart' }))
      await waitFor(() => expect(screen.getByText('Alice')).toBeInTheDocument())

      expect(dragTaskInterceptor).not.toBeNull()
      expect(dragTaskInterceptor?.({ id: 'leave-full-leave-m1-2026-08-11' })).toBe(false)
      // An ordinary ticket bar's drag is left uncancelled (interceptor
      // returns undefined, not false) - only leave/holiday ids are blocked.
      expect(dragTaskInterceptor?.({ id: 'entry-e1' })).toBeUndefined()
    })
  })
})
