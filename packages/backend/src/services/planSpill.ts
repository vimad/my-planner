// Pure Plan/Spill math (spec ".scratch/sprint-plan-spill-estimate/spec.md")
// - kept free of Mongoose/route concerns, sibling in style to
// capacityFormula.ts/leaveEntries.ts. A per-sprint, per-role adjustment to a
// ticket's Original (Jira-derived) estimate for capacity purposes: Plan
// defaults to Original (freely raised or lowered), Spill defaults to 0
// (capped at Plan by the route, but floored here too as a defensive
// backstop against stale data) - see ADR 0006 and CONTEXT.md ("Plan/Spill").

export interface PlanSpillOverride {
  planHours: number | null
  spillHours: number | null
}

// `null` means "not overridden - follow Original".
export function resolvedPlan(original: number, override: PlanSpillOverride): number {
  return override.planHours ?? original
}

// Plan minus Spill, floored at 0. The route blocks a stored Spill from ever
// exceeding Plan, so this floor should never actually engage in practice -
// kept anyway as a defensive backstop against stale data (e.g. a Plan
// lowered after Spill was already set to something now larger than it).
export function plannedHours(original: number, override: PlanSpillOverride): number {
  const plan = resolvedPlan(original, override)
  const spill = override.spillHours ?? 0
  return Math.max(0, plan - spill)
}
