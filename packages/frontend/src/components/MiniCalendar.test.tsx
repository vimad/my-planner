import { fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { MiniCalendar } from './MiniCalendar'

describe('MiniCalendar', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(2026, 6, 25, 9, 0)) // July 25, 2026
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('renders the current month and year', () => {
    render(<MiniCalendar todos={[]} />)
    expect(screen.getByText('July 2026')).toBeInTheDocument()
  })

  it('marks the day with a due todo, but not days without one', () => {
    render(<MiniCalendar todos={[{ dueDate: '2026-07-28' }]} />)

    const dueCell = screen.getByText('28')
    expect(dueCell.querySelector('span')).not.toBeNull()

    const otherCell = screen.getByText('27')
    expect(otherCell.querySelector('span')).toBeNull()
  })

  it('does not double-mark today even if a todo is due today', () => {
    render(<MiniCalendar todos={[{ dueDate: '2026-07-25' }]} />)

    const todayCell = screen.getByText('25')
    expect(todayCell.querySelector('span')).toBeNull()
  })

  it('marks the next office day distinctly from a due date', () => {
    render(<MiniCalendar todos={[]} nextOfficeDay="2026-07-28" />)

    const officeCell = screen.getByText('28')
    expect(officeCell.closest('div')).toHaveAttribute('title', 'Next office day')
  })

  it('reflects the current nextOfficeDay in the date input', () => {
    render(<MiniCalendar todos={[]} nextOfficeDay="2026-07-28" onSetOfficeDay={() => {}} />)

    expect(screen.getByLabelText('Next office day')).toHaveValue('2026-07-28')
  })

  it('calls onSetOfficeDay when a new date is chosen', () => {
    const onSetOfficeDay = vi.fn()
    render(<MiniCalendar todos={[]} nextOfficeDay={null} onSetOfficeDay={onSetOfficeDay} />)

    fireEvent.change(screen.getByLabelText('Next office day'), {
      target: { value: '2026-07-30' },
    })

    expect(onSetOfficeDay).toHaveBeenCalledWith('2026-07-30')
  })

  it('calls onSetOfficeDay with null when cleared', () => {
    const onSetOfficeDay = vi.fn()
    render(<MiniCalendar todos={[]} nextOfficeDay="2026-07-28" onSetOfficeDay={onSetOfficeDay} />)

    fireEvent.click(screen.getByRole('button', { name: 'Clear next office day' }))

    expect(onSetOfficeDay).toHaveBeenCalledWith(null)
  })
})
