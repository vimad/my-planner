import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { SprintLeaveGrid, type SprintLeaveGridColumn } from './SprintLeaveGrid'
import type { SprintCapacity } from '../types'

function makeCapacity(overrides: Partial<SprintCapacity> & { teamMembershipId: string; personName: string }): SprintCapacity {
  return {
    personId: overrides.teamMembershipId,
    role: 'SE',
    capacityPercentOverride: null,
    effectivePercentage: 100,
    leaveDays: 0,
    extraHours: 0,
    capacityEntryId: null,
    leaveEntries: [],
    total: 40,
    available: 40,
    planned: 0,
    remaining: 40,
    ...overrides,
  }
}

const columns: SprintLeaveGridColumn[] = [{ date: '2026-08-10', writable: true }]

describe('SprintLeaveGrid row highlighting', () => {
  it('gives the clicked person a highlighted row and clears it on a second click', () => {
    const capacity = [
      makeCapacity({ teamMembershipId: 'm1', personName: 'Alice' }),
      makeCapacity({ teamMembershipId: 'm2', personName: 'Bob' }),
    ]
    render(
      <SprintLeaveGrid
        capacity={capacity}
        columns={columns}
        error={null}
        onSetLeaveEntries={vi.fn()}
        onSetExtraHours={vi.fn()}
      />,
    )

    const aliceCell = screen.getByRole('button', { name: "Highlight Alice's row" })
    const bobCell = screen.getByRole('button', { name: "Highlight Bob's row" })

    expect(aliceCell).toHaveAttribute('aria-pressed', 'false')
    expect(bobCell).toHaveAttribute('aria-pressed', 'false')

    fireEvent.click(aliceCell)
    expect(aliceCell).toHaveAttribute('aria-pressed', 'true')
    expect(bobCell).toHaveAttribute('aria-pressed', 'false')

    fireEvent.click(bobCell)
    expect(aliceCell).toHaveAttribute('aria-pressed', 'false')
    expect(bobCell).toHaveAttribute('aria-pressed', 'true')

    fireEvent.click(bobCell)
    expect(bobCell).toHaveAttribute('aria-pressed', 'false')
  })
})
