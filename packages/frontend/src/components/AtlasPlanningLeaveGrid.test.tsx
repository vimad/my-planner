import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { AtlasPlanningLeaveGrid } from './AtlasPlanningLeaveGrid'
import type { AtlasPlanningLeaveMark, AtlasRosterMember } from '../types'

function member(id: string, name: string): AtlasRosterMember {
  return { _id: id, personId: { _id: `p-${id}`, name, email: `${name.toLowerCase()}@x.com`, jiraAccountId: `acc-${id}` }, createdAt: '2026-08-01T00:00:00.000Z' }
}

const WINDOW_DATES = ['2026-08-22', '2026-08-23', '2026-08-24']

describe('AtlasPlanningLeaveGrid', () => {
  it('renders nothing when the roster is empty', () => {
    const { container } = render(
      <AtlasPlanningLeaveGrid roster={[]} windowDates={WINDOW_DATES} leaveMarks={[]} cycling={false} cycleError={null} onCycle={vi.fn()} />,
    )
    expect(container).toBeEmptyDOMElement()
  })

  it('renders one row per roster member and one column per window date, unmarked by default', () => {
    render(
      <AtlasPlanningLeaveGrid
        roster={[member('m1', 'Alice'), member('m2', 'Bob')]}
        windowDates={WINDOW_DATES}
        leaveMarks={[]}
        cycling={false}
        cycleError={null}
        onCycle={vi.fn()}
      />,
    )
    expect(screen.getByText('Alice')).toBeInTheDocument()
    expect(screen.getByText('Bob')).toBeInTheDocument()
    const cell = screen.getByLabelText('Toggle leave for Alice on 2026-08-22 (currently no leave)')
    expect(cell).toHaveAttribute('aria-pressed', 'false')
  })

  it('does not render a column for a date outside the current window', () => {
    render(
      <AtlasPlanningLeaveGrid
        roster={[member('m1', 'Alice')]}
        windowDates={WINDOW_DATES}
        leaveMarks={[]}
        cycling={false}
        cycleError={null}
        onCycle={vi.fn()}
      />,
    )
    expect(screen.queryByLabelText(/on 2026-09-10/)).not.toBeInTheDocument()
  })

  it('clicking an unmarked cell cycles to full day', () => {
    const onCycle = vi.fn().mockResolvedValue(undefined)
    render(
      <AtlasPlanningLeaveGrid
        roster={[member('m1', 'Alice')]}
        windowDates={WINDOW_DATES}
        leaveMarks={[]}
        cycling={false}
        cycleError={null}
        onCycle={onCycle}
      />,
    )
    fireEvent.click(screen.getByLabelText('Toggle leave for Alice on 2026-08-22 (currently no leave)'))
    expect(onCycle).toHaveBeenCalledWith('m1', '2026-08-22')
  })

  it('shows a full-day mark as pressed with an "F" label', () => {
    const marks: AtlasPlanningLeaveMark[] = [{ _id: 'l1', rosterMemberId: 'm1', date: '2026-08-22', portion: 'full' }]
    render(
      <AtlasPlanningLeaveGrid
        roster={[member('m1', 'Alice')]}
        windowDates={WINDOW_DATES}
        leaveMarks={marks}
        cycling={false}
        cycleError={null}
        onCycle={vi.fn()}
      />,
    )
    const cell = screen.getByLabelText('Toggle leave for Alice on 2026-08-22 (currently full day)')
    expect(cell).toHaveAttribute('aria-pressed', 'true')
    expect(cell).toHaveTextContent('F')
  })

  it('shows a half-day mark with an "H" label, clicking it cycles onward', () => {
    const marks: AtlasPlanningLeaveMark[] = [{ _id: 'l1', rosterMemberId: 'm1', date: '2026-08-22', portion: 'half' }]
    const onCycle = vi.fn().mockResolvedValue(undefined)
    render(
      <AtlasPlanningLeaveGrid
        roster={[member('m1', 'Alice')]}
        windowDates={WINDOW_DATES}
        leaveMarks={marks}
        cycling={false}
        cycleError={null}
        onCycle={onCycle}
      />,
    )
    const cell = screen.getByLabelText('Toggle leave for Alice on 2026-08-22 (currently half day)')
    expect(cell).toHaveTextContent('H')
    fireEvent.click(cell)
    expect(onCycle).toHaveBeenCalledWith('m1', '2026-08-22')
  })

  it('surfaces a cycle error', () => {
    render(
      <AtlasPlanningLeaveGrid
        roster={[member('m1', 'Alice')]}
        windowDates={WINDOW_DATES}
        leaveMarks={[]}
        cycling={false}
        cycleError="boom"
        onCycle={vi.fn()}
      />,
    )
    expect(screen.getByText('Error: boom')).toBeInTheDocument()
  })

  it('disables every cell while a cycle is in flight', () => {
    render(
      <AtlasPlanningLeaveGrid
        roster={[member('m1', 'Alice')]}
        windowDates={WINDOW_DATES}
        leaveMarks={[]}
        cycling={true}
        cycleError={null}
        onCycle={vi.fn()}
      />,
    )
    expect(screen.getByLabelText('Toggle leave for Alice on 2026-08-22 (currently no leave)')).toBeDisabled()
  })
})
