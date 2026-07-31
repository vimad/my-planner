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
    expect(officeCell.closest('button')).toHaveAttribute('title', 'Next office day')
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

  describe('month navigation', () => {
    it('moves forward and backward a month at a time, independent of "today"', () => {
      render(<MiniCalendar todos={[]} />)

      fireEvent.click(screen.getByRole('button', { name: 'Next month' }))
      expect(screen.getByText('August 2026')).toBeInTheDocument()

      fireEvent.click(screen.getByRole('button', { name: 'Previous month' }))
      fireEvent.click(screen.getByRole('button', { name: 'Previous month' }))
      expect(screen.getByText('June 2026')).toBeInTheDocument()
    })

    it('keeps the due-date and office-day markers tied to the real current date after navigating months', () => {
      render(<MiniCalendar todos={[{ dueDate: '2026-07-28' }]} nextOfficeDay="2026-07-28" />)

      fireEvent.click(screen.getByRole('button', { name: 'Next month' }))
      expect(screen.getByText('August 2026')).toBeInTheDocument()
      // July's due-date/office-day marker isn't visible while viewing August...
      expect(screen.queryByText('28')?.closest('button')).not.toHaveAttribute('title', 'Next office day')

      fireEvent.click(screen.getByRole('button', { name: 'Previous month' }))
      // ...but reappears back on July 28, proving it's computed from the
      // real "today"/todos data rather than the viewed month.
      expect(screen.getByText('28').closest('button')).toHaveAttribute('title', 'Next office day')
    })
  })

  describe('date/range selection', () => {
    it('does not call onSelectRange on the first click - only previews a pending selection', () => {
      const onSelectRange = vi.fn()
      render(<MiniCalendar todos={[]} onSelectRange={onSelectRange} />)

      fireEvent.click(screen.getByText('10'))

      expect(onSelectRange).not.toHaveBeenCalled()
    })

    it('commits a single-day range when the same day is clicked twice', () => {
      const onSelectRange = vi.fn()
      render(<MiniCalendar todos={[]} onSelectRange={onSelectRange} />)

      fireEvent.click(screen.getByText('10'))
      fireEvent.click(screen.getByText('10'))

      expect(onSelectRange).toHaveBeenCalledWith({ start: '2026-07-10', end: '2026-07-10' })
    })

    it('commits a normalized range on a second, later click', () => {
      const onSelectRange = vi.fn()
      render(<MiniCalendar todos={[]} onSelectRange={onSelectRange} />)

      fireEvent.click(screen.getByText('10'))
      fireEvent.click(screen.getByText('15'))

      expect(onSelectRange).toHaveBeenCalledWith({ start: '2026-07-10', end: '2026-07-15' })
    })

    it('normalizes the range even when the second click lands on an earlier day', () => {
      const onSelectRange = vi.fn()
      render(<MiniCalendar todos={[]} onSelectRange={onSelectRange} />)

      fireEvent.click(screen.getByText('15'))
      fireEvent.click(screen.getByText('10'))

      expect(onSelectRange).toHaveBeenCalledWith({ start: '2026-07-10', end: '2026-07-15' })
    })

    it('previews the in-progress range on hover, without committing it', () => {
      const onSelectRange = vi.fn()
      render(<MiniCalendar todos={[]} onSelectRange={onSelectRange} />)

      fireEvent.click(screen.getByText('10'))
      fireEvent.mouseEnter(screen.getByText('13'))

      expect(onSelectRange).not.toHaveBeenCalled()
      // The cells between the pending start and the hovered day preview the
      // would-be range.
      expect(screen.getByText('11').closest('button')?.className).toMatch(/violet/)
      expect(screen.getByText('12').closest('button')?.className).toMatch(/violet/)
      // A day outside the hovered range stays unstyled.
      expect(screen.getByText('20').closest('button')?.className).not.toMatch(/violet/)
    })

    it('starts a fresh selection after a range is already committed', () => {
      const onSelectRange = vi.fn()
      render(<MiniCalendar todos={[]} onSelectRange={onSelectRange} />)

      fireEvent.click(screen.getByText('10'))
      fireEvent.click(screen.getByText('15'))
      onSelectRange.mockClear()

      fireEvent.click(screen.getByText('20'))
      expect(onSelectRange).not.toHaveBeenCalled()

      fireEvent.click(screen.getByText('22'))
      expect(onSelectRange).toHaveBeenCalledWith({ start: '2026-07-20', end: '2026-07-22' })
    })

    it('renders a clear-filter control only while a range is committed, and calls onSelectRange(null)', () => {
      const onSelectRange = vi.fn()
      const { rerender } = render(<MiniCalendar todos={[]} selectedRange={null} onSelectRange={onSelectRange} />)

      expect(screen.queryByRole('button', { name: 'Clear date filter' })).not.toBeInTheDocument()

      rerender(
        <MiniCalendar
          todos={[]}
          selectedRange={{ start: '2026-07-10', end: '2026-07-15' }}
          onSelectRange={onSelectRange}
        />,
      )

      fireEvent.click(screen.getByRole('button', { name: 'Clear date filter' }))
      expect(onSelectRange).toHaveBeenCalledWith(null)
    })
  })

  describe('overlapping visual states', () => {
    it('keeps "today" and "selected" both visible when today falls inside the committed range', () => {
      render(<MiniCalendar todos={[]} selectedRange={{ start: '2026-07-20', end: '2026-07-26' }} />)

      const todayCell = screen.getByText('25').closest('button')
      expect(todayCell?.className).toMatch(/from-violet-500/) // still shows as "today"
      expect(todayCell?.className).toMatch(/border-violet-400/) // and as "selected"
    })

    it('keeps "office day" and "selected" both visible when they land on the same non-today cell', () => {
      render(
        <MiniCalendar
          todos={[]}
          nextOfficeDay="2026-07-12"
          selectedRange={{ start: '2026-07-10', end: '2026-07-15' }}
        />,
      )

      const cell = screen.getByText('12').closest('button')
      expect(cell?.className).toMatch(/ring-violet-400/) // still shows as "office day"
      expect(cell?.className).toMatch(/border-violet-400/) // and as "selected"
    })
  })
})
