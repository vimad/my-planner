import type { CapacityLookupDoc } from '../models/CapacityLookup.ts'

// Pure capacity math (spec's "Domain model — Capacity", steps 1-3 and 5) —
// kept free of Mongoose/DB concerns so it's directly unit-testable against
// the reference spreadsheet's worked example. Planned (step 4) is summed by
// the caller (routes/capacity.ts) since it depends on SprintPlanEntry/Ticket
// lookups this module has no business knowing about.
export interface CapacityFormulaInput {
  workingDays: number
  leaveDays: number
  extraHours: number
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
  const leaveHours = input.leaveDays * 8
  const total = input.workingDays * 8 - leaveHours

  // Available-before-leave is looked up/scaled from the sprint's raw
  // (leave-unadjusted) working days - a leave day then comes straight off
  // Available afterward at its full 8h (or 4h for a half day), regardless of
  // the person's effective capacity percentage. A leave day removes a full
  // day of calendar time from someone, not a percentage-scaled sliver of
  // one - a TL at 50% capacity still loses 8 real hours to a full leave day,
  // not 4.
  const match = input.lookupRows.find(
    (row) => row.percentage === input.effectivePercentage && row.days === input.workingDays,
  )
  const availableBeforeLeave = match ? match.hours : input.workingDays * 8 * (input.effectivePercentage / 100)
  // extraHours (a manually-typed on-call/support-duty figure, see
  // CapacityEntry.ts) comes off Available the same unscaled way a leave
  // day does - it's real hours taken off this sprint regardless of the
  // person's capacity percentage.
  const available = availableBeforeLeave - leaveHours - input.extraHours

  return { total, available, planned: input.planned, remaining: available - input.planned }
}
