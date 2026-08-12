import { useState, type FormEvent } from 'react'
import { JIRA_BASE_URL } from '../constants/jira'
import { getId } from '../utils/getId'
import { initialPlanSpillPair, PlanSpillTrio, type PlanSpillPair } from './PlanSpillTrio'
import type { SprintPlanEntry, TeamMembership } from '../types'

// PUT /api/tickets/:ticketId/assignee-override's body (docs/adr/0005) -
// always carries `personId` (unlike dev-qa-override's two optional roles,
// there's only one slot here); `null` clears the Override back to following
// Jira's own assignee.
export interface AssigneeOverrideBody {
  personId: string | null
}

interface TicketInfoPopupProps {
  entry: SprintPlanEntry
  memberships: TeamMembership[]
  saving: boolean
  error: string | null
  onSave: (body: AssigneeOverrideBody) => Promise<void>
  // Plan/Spill (spec ".scratch/sprint-plan-spill-estimate/spec.md") - a
  // separate save action from the Planning assignee select's onSave above,
  // fired for the entry's single (non-split) slot. Both can fire from the
  // same Save click when both changed.
  savingPlanSpill: boolean
  planSpillError: string | null
  onSavePlanSpill: (pair: PlanSpillPair) => Promise<void>
  // PATCH /api/tickets/:ticketId/feature (map's Notes) - the "Counts as a
  // Feature" checkbox's save action, batched with the other saves the same
  // way onSave/onSavePlanSpill are.
  savingFeatureOverride: boolean
  featureOverrideError: string | null
  onSaveFeature: (isFeature: boolean) => Promise<void>
  onClose: () => void
}

// A non-split ticket (Task/Sub-task, CONTEXT.md "Split ticket") has a single
// Jira assignee, not a dev/qa Role assignment pair - so this popup, opened
// by clicking one of these in the Planning table, offers a single Planning
// assignee instead of DevQaAssignmentPopup's Dev/QA pair. Jira's own
// assignee is never touched (it's shown read-only at the bottom, current
// behavior kept as-is) - picking someone here only records a local Assignee
// Override (docs/adr/0005), the same "Planning-only, never touches Jira"
// pattern as a Dev/QA Override, unrestricted by role since a non-split
// ticket has no dev/qa distinction to filter by.
export function TicketInfoPopup({
  entry,
  memberships,
  saving,
  error,
  onSave,
  savingPlanSpill,
  planSpillError,
  onSavePlanSpill,
  savingFeatureOverride,
  featureOverrideError,
  onSaveFeature,
  onClose,
}: TicketInfoPopupProps) {
  const ticket = entry.ticketId
  const initialPersonId = entry.assigneeOverridePersonId ?? ''
  const [personId, setPersonId] = useState(initialPersonId)

  const original = entry.estimateHours ?? 0
  const initialPair = initialPlanSpillPair(entry.planHours ?? undefined, entry.spillHours ?? undefined, original)
  const [pair, setPair] = useState(initialPair)

  const initialIsFeature = entry.isFeature ?? false
  const [isFeature, setIsFeature] = useState(initialIsFeature)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()

    const personChanged = personId !== initialPersonId
    const pairChanged = pair.planHours !== initialPair.planHours || pair.spillHours !== initialPair.spillHours
    const isFeatureChanged = isFeature !== initialIsFeature

    const saves: Promise<unknown>[] = []
    if (personChanged) saves.push(onSave({ personId: personId || null }))
    if (pairChanged) saves.push(onSavePlanSpill(pair))
    if (isFeatureChanged) saves.push(onSaveFeature(isFeature))

    if (saves.length === 0) {
      onClose()
      return
    }

    try {
      await Promise.all(saves)
      onClose()
    } catch {
      // The `error`/`planSpillError` props (threaded from useSprintPlan's
      // saveAssigneeOverride/savePlanSpill) already surface the failure -
      // keep the popup open with the user's picks intact so they can retry
      // without re-entering everything.
    }
  }

  return (
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center bg-black/60 p-4"
      role="dialog"
      aria-modal="true"
      aria-label={ticket.jiraKey}
    >
      <div className="w-full max-w-sm rounded-2xl border border-slate-200 bg-white p-6 text-slate-900 shadow-xl dark:border-white/10 dark:bg-[#160f24] dark:text-slate-100">
        <div className="flex items-start justify-between gap-2">
          <h2 className="text-lg font-semibold">{ticket.jiraKey}</h2>
          <a
            href={`${JIRA_BASE_URL}/browse/${ticket.jiraKey}`}
            target="_blank"
            rel="noreferrer"
            className="shrink-0 text-xs text-fuchsia-600 hover:underline dark:text-fuchsia-300"
          >
            Open in Jira ↗
          </a>
        </div>
        <p className="mb-4 text-sm text-slate-600 dark:text-slate-300">{ticket.title}</p>
        <div className="mb-4 flex flex-col gap-1 rounded-lg border border-slate-200 p-3 dark:border-white/10">
          <label className="flex items-center gap-2 text-sm font-medium text-slate-700 dark:text-slate-200">
            <input type="checkbox" checked={isFeature} onChange={(e) => setIsFeature(e.target.checked)} />
            Counts as a Feature
          </label>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Included in the Features slice of the Sprint breakdown card, instead of Technical items.
          </p>
        </div>
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div className="flex flex-col gap-1">
            <span className="text-xs font-medium text-slate-500 dark:text-slate-300">Planning assignee</span>
            <select
              aria-label="Planning assignee"
              value={personId}
              onChange={(e) => setPersonId(e.target.value)}
              className="rounded-lg border border-slate-200 bg-slate-50 px-2 py-1.5 text-sm focus:border-fuchsia-400/60 focus:outline-none dark:border-white/10 dark:bg-white/5 dark:text-slate-100"
            >
              <option value="">— Follow Jira —</option>
              {memberships.map((m) => (
                <option key={getId(m)} value={getId(m.personId)}>
                  {m.personId.name}
                </option>
              ))}
            </select>
          </div>
          <p className="text-xs text-slate-500 dark:text-slate-400">Jira assignee: {ticket.assigneeDisplayName ?? 'Unassigned'}</p>
          <PlanSpillTrio
            label="Estimate"
            original={original}
            plan={pair.planHours}
            spill={pair.spillHours}
            onPlanChange={(planHours) => setPair((p) => ({ ...p, planHours }))}
            onSpillChange={(spillHours) => setPair((p) => ({ ...p, spillHours }))}
            saving={savingPlanSpill}
            error={planSpillError}
          />
          {error && <p className="text-xs text-red-600 dark:text-red-400">{error}</p>}
          {featureOverrideError && <p className="text-xs text-red-600 dark:text-red-400">{featureOverrideError}</p>}
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-100 dark:border-white/10 dark:text-slate-300 dark:hover:bg-white/5"
            >
              Close
            </button>
            <button
              type="submit"
              disabled={saving || savingPlanSpill || savingFeatureOverride}
              className="rounded-lg bg-gradient-to-r from-violet-500 to-fuchsia-500 px-3 py-1.5 text-sm font-semibold text-white hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {saving || savingPlanSpill || savingFeatureOverride ? 'Saving…' : 'Save'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
