import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { PlanSpillTrio } from './PlanSpillTrio'

describe('PlanSpillTrio', () => {
  it('renders Original, Planned this sprint, and the Plan/Spill input values from props', () => {
    render(
      <PlanSpillTrio label="Dev" original={24} plan={24} spill={8} onPlanChange={vi.fn()} onSpillChange={vi.fn()} />,
    )

    expect(screen.getByText('3d')).toBeInTheDocument() // Original: 24h
    expect(screen.getByLabelText('Dev plan hours')).toHaveValue(24)
    expect(screen.getByLabelText('Dev spill hours')).toHaveValue(8)
    expect(screen.getByText('Dev planned this sprint')).toBeInTheDocument()
    expect(screen.getByText('2d')).toBeInTheDocument() // Planned: 24 - 8 = 16h
  })

  it('calls onPlanChange/onSpillChange when the respective input changes, not internal state', () => {
    const onPlanChange = vi.fn()
    const onSpillChange = vi.fn()
    render(
      <PlanSpillTrio label="QA" original={16} plan={16} spill={0} onPlanChange={onPlanChange} onSpillChange={onSpillChange} />,
    )

    fireEvent.change(screen.getByLabelText('QA plan hours'), { target: { value: '20' } })
    expect(onPlanChange).toHaveBeenCalledWith(20)

    fireEvent.change(screen.getByLabelText('QA spill hours'), { target: { value: '16' } })
    expect(onSpillChange).toHaveBeenCalledWith(16)
  })

  it('the Planned readout updates live from props, not from typing alone (parent-controlled)', () => {
    const { rerender } = render(
      <PlanSpillTrio label="QA" original={8} plan={16} spill={0} onPlanChange={vi.fn()} onSpillChange={vi.fn()} />,
    )
    expect(screen.getByText('1d')).toBeInTheDocument() // Original: 8h, unchanged throughout
    expect(screen.getByText('2d')).toBeInTheDocument() // Planned: 16h

    rerender(<PlanSpillTrio label="QA" original={8} plan={16} spill={16} onPlanChange={vi.fn()} onSpillChange={vi.fn()} />)
    expect(screen.getByText('1d')).toBeInTheDocument() // Original unchanged
    expect(screen.getByText('0h')).toBeInTheDocument() // Planned: 0h (the worked example)
  })

  it('shows an inline error when Spill exceeds the current Plan prop - the parent is expected to reject submission, not this component', () => {
    render(
      <PlanSpillTrio label="Dev" original={24} plan={5} spill={10} onPlanChange={vi.fn()} onSpillChange={vi.fn()} />,
    )

    expect(screen.getByText("Spill can't exceed Plan.")).toBeInTheDocument()
    // Planned still floors at 0 rather than going negative, purely for display.
    expect(screen.getByText('0h')).toBeInTheDocument()
  })

  it('shows no inline error when Spill is within Plan', () => {
    render(
      <PlanSpillTrio label="Dev" original={24} plan={24} spill={8} onPlanChange={vi.fn()} onSpillChange={vi.fn()} />,
    )

    expect(screen.queryByText("Spill can't exceed Plan.")).not.toBeInTheDocument()
  })

  it('disables the Plan/Spill inputs while saving', () => {
    render(
      <PlanSpillTrio label="Dev" original={24} plan={24} spill={0} onPlanChange={vi.fn()} onSpillChange={vi.fn()} saving />,
    )

    expect(screen.getByLabelText('Dev plan hours')).toBeDisabled()
    expect(screen.getByLabelText('Dev spill hours')).toBeDisabled()
  })

  it('shows a passed-in error message (e.g. a failed save) alongside the inputs', () => {
    render(
      <PlanSpillTrio
        label="Dev"
        original={24}
        plan={24}
        spill={0}
        onPlanChange={vi.fn()}
        onSpillChange={vi.fn()}
        error="Request failed with status 400"
      />,
    )

    expect(screen.getByText('Request failed with status 400')).toBeInTheDocument()
  })
})
