import { render, screen } from '@testing-library/react'
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
})
