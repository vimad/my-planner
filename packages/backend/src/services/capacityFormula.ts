import type { CapacityLookupDoc } from '../models/CapacityLookup.ts'

// Pure capacity math (spec's "Domain model — Capacity", steps 1-3 and 5) —
// kept free of Mongoose/DB concerns so it's directly unit-testable against
// the reference spreadsheet's worked example. Planned (step 4) is summed by
// the caller (routes/capacity.ts) since it depends on SprintPlanEntry/Ticket
// lookups this module has no business knowing about.
export interface CapacityFormulaInput {
  workingDays: number
  leaveDays: number
  effectivePercentage: number
  planned: number
  lookupRows: Pick<CapacityLookupDoc, 'percentage' | 'days' | 'hours'>[]
}

export interface CapacityFormulaResult {
  total: number
  available: number
  planned: number
  remaining: number
}

export function computeCapacity(input: CapacityFormulaInput): CapacityFormulaResult {
  const total = (input.workingDays - input.leaveDays) * 8
  const effectiveDays = total / 8

  const match = input.lookupRows.find(
    (row) => row.percentage === input.effectivePercentage && row.days === effectiveDays,
  )
  const available = match ? match.hours : total * (input.effectivePercentage / 100)

  return { total, available, planned: input.planned, remaining: available - input.planned }
}
