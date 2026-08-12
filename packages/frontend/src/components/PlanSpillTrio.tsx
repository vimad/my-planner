import type { ChangeEvent } from 'react'
import { formatDaysHours } from '../utils/formatDuration'

// Promotes prototype Variant B's `TrioCardB` (branch
// `prototype/plan-spill-estimate-ui`, commit f013ff1) as the one real
// widget for the Original/Plan/Spill estimate editor (spec ".scratch/
// sprint-plan-spill-estimate/spec.md") - a split-bar card showing Original
// at the top, a bar visualizing how much of the current Plan is
// Planned-this-sprint vs. Spilled, the Plan/Spill inputs, and a large
// "Planned this sprint" hero readout. Owns no fetch/save logic itself
// (mirrors RoleField/DevQaOverrideBody's split between presentational
// sub-component and popup-owned save flow) - `plan`/`spill` are fully
// parent-controlled, and Planned is derived live from props, never internal
// state.
export interface PlanSpillTrioProps {
  label: string
  original: number
  plan: number
  spill: number
  onPlanChange: (hours: number) => void
  onSpillChange: (hours: number) => void
  saving?: boolean
  error?: string | null
}

// A role's Plan/Spill pair, shared by both popup consumers
// (DevQaAssignmentPopup.tsx's dev/qa pair, TicketInfoPopup.tsx's single
// pair) so their local editing state and PATCH body shapes stay in sync by
// construction rather than by two independently-maintained copies.
export interface PlanSpillPair {
  planHours: number
  spillHours: number
}

// Seeds a pair's initial editing state from the stored override if one
// exists, else Original/0 - PlanSpillTrio's own contract (Plan defaults to
// Original, Spill defaults to 0).
export function initialPlanSpillPair(
  planHours: number | undefined,
  spillHours: number | undefined,
  original: number,
): PlanSpillPair {
  return { planHours: planHours ?? original, spillHours: spillHours ?? 0 }
}

const NUMBER_INPUT_BASE =
  '[appearance:textfield] rounded-lg border border-slate-200 bg-white px-1.5 py-1 text-xs text-slate-700 focus:border-fuchsia-400/60 focus:outline-none disabled:cursor-not-allowed disabled:opacity-50 [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none dark:border-white/10 dark:bg-white/10 dark:text-slate-100'

function parseHours(e: ChangeEvent<HTMLInputElement>): number {
  return Number.isNaN(e.target.valueAsNumber) ? 0 : Math.max(0, e.target.valueAsNumber)
}

export function PlanSpillTrio({ label, original, plan, spill, onPlanChange, onSpillChange, saving, error }: PlanSpillTrioProps) {
  const planned = Math.max(0, plan - spill)
  // Blocked from exceeding Plan at write time (route validation) - this is
  // the pre-submit inline warning that lets the user see why before they
  // even try to save.
  const spillExceedsPlan = spill > plan
  const total = Math.max(plan, 1)
  const plannedPct = Math.min(100, (planned / total) * 100)
  const spillPct = Math.max(0, 100 - plannedPct)

  return (
    <div className="mt-2 rounded-xl border border-slate-200 bg-white p-3 shadow-sm dark:border-white/10 dark:bg-white/5">
      <div className="flex items-center justify-between text-[11px] text-slate-500 dark:text-slate-400">
        <span>{label} original</span>
        <span className="font-mono">{formatDaysHours(original)}</span>
      </div>
      <div className="mt-1.5 flex h-2 overflow-hidden rounded-full bg-slate-200 dark:bg-white/10">
        <div className="bg-gradient-to-r from-violet-500 to-fuchsia-500" style={{ width: `${plannedPct}%` }} />
        <div
          className="bg-[repeating-linear-gradient(45deg,rgba(148,163,184,0.7)_0px,rgba(148,163,184,0.7)_3px,transparent_3px,transparent_6px)]"
          style={{ width: `${spillPct}%` }}
        />
      </div>
      <div className="mt-2.5 flex gap-2">
        <label className="flex-1 text-[9px] font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">
          Plan (h)
          <input
            type="number"
            min={0}
            value={plan}
            disabled={saving}
            onChange={(e) => onPlanChange(parseHours(e))}
            aria-label={`${label} plan hours`}
            className={`mt-0.5 ${NUMBER_INPUT_BASE} w-full`}
          />
        </label>
        <label className="flex-1 text-[9px] font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">
          Spill (h)
          <input
            type="number"
            min={0}
            value={spill}
            disabled={saving}
            onChange={(e) => onSpillChange(parseHours(e))}
            aria-label={`${label} spill hours`}
            className={`mt-0.5 ${NUMBER_INPUT_BASE} w-full ${spillExceedsPlan ? 'border-red-400 dark:border-red-500/60' : ''}`}
          />
        </label>
      </div>
      {spillExceedsPlan && <p className="mt-1 text-[11px] text-red-600 dark:text-red-400">Spill can&apos;t exceed Plan.</p>}
      {error && <p className="mt-1 text-[11px] text-red-600 dark:text-red-400">{error}</p>}
      <div className="mt-2.5 rounded-lg bg-slate-100 px-2 py-1.5 text-center dark:bg-white/10">
        <span className="text-[9px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
          {label} planned this sprint
        </span>
        <p className="text-lg font-extrabold text-slate-900 dark:text-slate-50">{formatDaysHours(planned)}</p>
      </div>
    </div>
  )
}
