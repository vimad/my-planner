import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { AtlasPlanningHolidayChips } from './AtlasPlanningHolidayChips'
import type { AtlasPlanningHoliday, AtlasRosterMember } from '../types'

function member(id: string, name: string): AtlasRosterMember {
  return { _id: id, personId: { _id: `p-${id}`, name, email: `${name.toLowerCase()}@x.com`, jiraAccountId: `acc-${id}` }, createdAt: '2026-08-01T00:00:00.000Z' }
}

const WINDOW_DATES = ['2026-08-22', '2026-08-23', '2026-08-24']

describe('AtlasPlanningHolidayChips', () => {
  it('renders nothing when the roster is empty', () => {
    const { container } = render(
      <AtlasPlanningHolidayChips roster={[]} windowDates={WINDOW_DATES} holidays={[]} toggling={false} toggleError={null} onToggle={vi.fn()} />,
    )
    expect(container).toBeEmptyDOMElement()
  })

  it('renders one chip per window date, none pressed by default', () => {
    render(
      <AtlasPlanningHolidayChips
        roster={[member('m1', 'Alice')]}
        windowDates={WINDOW_DATES}
        holidays={[]}
        toggling={false}
        toggleError={null}
        onToggle={vi.fn()}
      />,
    )
    const chip = screen.getByLabelText('Toggle holiday for 2026-08-22')
    expect(chip).toHaveAttribute('aria-pressed', 'false')
    expect(screen.getAllByRole('button')).toHaveLength(WINDOW_DATES.length)
  })

  it('does not render a chip for a date outside the current window', () => {
    render(
      <AtlasPlanningHolidayChips
        roster={[member('m1', 'Alice')]}
        windowDates={WINDOW_DATES}
        holidays={[]}
        toggling={false}
        toggleError={null}
        onToggle={vi.fn()}
      />,
    )
    expect(screen.queryByLabelText('Toggle holiday for 2026-09-10')).not.toBeInTheDocument()
  })

  it('clicking an unmarked chip toggles it on', () => {
    const onToggle = vi.fn().mockResolvedValue(undefined)
    render(
      <AtlasPlanningHolidayChips
        roster={[member('m1', 'Alice')]}
        windowDates={WINDOW_DATES}
        holidays={[]}
        toggling={false}
        toggleError={null}
        onToggle={onToggle}
      />,
    )
    fireEvent.click(screen.getByLabelText('Toggle holiday for 2026-08-22'))
    expect(onToggle).toHaveBeenCalledWith('2026-08-22')
  })

  it('shows an existing holiday as pressed, clicking it toggles off', () => {
    const holidays: AtlasPlanningHoliday[] = [{ _id: 'h1', date: '2026-08-23' }]
    const onToggle = vi.fn().mockResolvedValue(undefined)
    render(
      <AtlasPlanningHolidayChips
        roster={[member('m1', 'Alice')]}
        windowDates={WINDOW_DATES}
        holidays={holidays}
        toggling={false}
        toggleError={null}
        onToggle={onToggle}
      />,
    )
    const chip = screen.getByLabelText('Toggle holiday for 2026-08-23')
    expect(chip).toHaveAttribute('aria-pressed', 'true')
    fireEvent.click(chip)
    expect(onToggle).toHaveBeenCalledWith('2026-08-23')
  })

  it('surfaces a toggle error', () => {
    render(
      <AtlasPlanningHolidayChips
        roster={[member('m1', 'Alice')]}
        windowDates={WINDOW_DATES}
        holidays={[]}
        toggling={false}
        toggleError="boom"
        onToggle={vi.fn()}
      />,
    )
    expect(screen.getByText('Error: boom')).toBeInTheDocument()
  })

  it('disables every chip while a toggle is in flight', () => {
    render(
      <AtlasPlanningHolidayChips
        roster={[member('m1', 'Alice')]}
        windowDates={WINDOW_DATES}
        holidays={[]}
        toggling={true}
        toggleError={null}
        onToggle={vi.fn()}
      />,
    )
    expect(screen.getByLabelText('Toggle holiday for 2026-08-22')).toBeDisabled()
  })
})
