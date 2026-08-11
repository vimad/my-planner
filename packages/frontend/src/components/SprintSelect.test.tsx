import { fireEvent, render, screen } from '@testing-library/react'
import { beforeAll, describe, expect, it, vi } from 'vitest'
import { SprintSelect } from './SprintSelect'
import type { Sprint } from '../types'

// jsdom doesn't implement scrollIntoView (same gap BoardSwitcherModal's
// identical highlight-scroll effect has, just never exercised by a test).
beforeAll(() => {
  Element.prototype.scrollIntoView = vi.fn()
})

const sprints: Sprint[] = [
  { _id: 's1', jiraSprintId: '130', name: 'WOSMVP Sprint 130', state: 'closed' },
  { _id: 's2', jiraSprintId: '132', name: 'WOSMVP Sprint 132', state: 'active' },
  { _id: 's3', jiraSprintId: '133', name: 'WOSMVP Sprint 133', state: 'future' },
]

describe('SprintSelect', () => {
  it('shows the selected sprint on the closed trigger', () => {
    render(<SprintSelect id="sprint-select" sprints={sprints} selectedSprintId="s2" onSelect={vi.fn()} />)
    expect(screen.getByRole('button', { name: /WOSMVP Sprint 132 \(active\)/ })).toBeInTheDocument()
  })

  it('opens a searchable list and filters by name', () => {
    render(<SprintSelect id="sprint-select" sprints={sprints} selectedSprintId="s2" onSelect={vi.fn()} />)

    fireEvent.click(screen.getByRole('button', { name: /Sprint 132/ }))
    expect(screen.getByRole('option', { name: /Sprint 130/ })).toBeInTheDocument()

    fireEvent.change(screen.getByLabelText('Search sprints'), { target: { value: '133' } })
    expect(screen.queryByRole('option', { name: /Sprint 130/ })).not.toBeInTheDocument()
    expect(screen.getByRole('option', { name: /Sprint 133/ })).toBeInTheDocument()
  })

  it('calls onSelect and closes when a result is clicked', () => {
    const onSelect = vi.fn()
    render(<SprintSelect id="sprint-select" sprints={sprints} selectedSprintId="s2" onSelect={onSelect} />)

    fireEvent.click(screen.getByRole('button', { name: /Sprint 132/ }))
    fireEvent.click(screen.getByRole('option', { name: /Sprint 130/ }))

    expect(onSelect).toHaveBeenCalledWith('s1')
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument()
  })

  it('selects the highlighted result on Enter', () => {
    const onSelect = vi.fn()
    render(<SprintSelect id="sprint-select" sprints={sprints} selectedSprintId="s2" onSelect={onSelect} />)

    fireEvent.click(screen.getByRole('button', { name: /Sprint 132/ }))
    const input = screen.getByLabelText('Search sprints')
    fireEvent.keyDown(input, { key: 'ArrowDown' })
    fireEvent.keyDown(input, { key: 'Enter' })

    expect(onSelect).toHaveBeenCalledWith('s3')
  })

  it('closes without selecting on Escape', () => {
    const onSelect = vi.fn()
    render(<SprintSelect id="sprint-select" sprints={sprints} selectedSprintId="s2" onSelect={onSelect} />)

    fireEvent.click(screen.getByRole('button', { name: /Sprint 132/ }))
    fireEvent.keyDown(screen.getByLabelText('Search sprints'), { key: 'Escape' })

    expect(onSelect).not.toHaveBeenCalled()
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument()
  })
})
