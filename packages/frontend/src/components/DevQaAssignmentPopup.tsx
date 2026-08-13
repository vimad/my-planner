import { useState, type ChangeEvent, type FormEvent } from 'react'
import { JIRA_BASE_URL } from '../constants/jira'
import { DEV_ROLES, QA_ROLES } from '../constants/roles'
import { getId } from '../utils/getId'
import { isPoEligibleTicket } from '../utils/ticketType'
import { initialPlanSpillPair, PlanSpillTrio, type PlanSpillPair } from './PlanSpillTrio'
import type { DevQaRoleResolution, SprintPlanEntry, TeamMembership } from '../types'

// PUT /api/tickets/:ticketId/dev-qa-override's body (ticket 23) - only the
// role(s) the user actually changed are included, same "presence not
// truthiness" partial-update convention as team-memberships.ts's
// capacityPercentOverride PATCH elsewhere in this app.
export interface DevQaOverrideBody {
  devPersonId?: string | null
  qaPersonId?: string | null
}

// PUT /api/tickets/:ticketId/po-assignment's body - PO's own, simpler
// counterpart to DevQaOverrideBody (a flat pick + an hours figure, no
// Jira-derived Sub-task to resolve against - see TicketPoAssignment.ts).
export interface PoAssignmentBody {
  poPersonId?: string | null
  poEstimateHours?: number | null
}

interface DevQaAssignmentPopupProps {
  // The Split entry being assigned - only ever rendered once GET has
  // resolved dev/qa for this Split ticket (ticket 23's resolveDevQa), so
  // `devQa` is required here even though it's optional on SprintPlanEntry
  // itself.
  entry: SprintPlanEntry & { devQa: NonNullable<SprintPlanEntry['devQa']> }
  memberships: TeamMembership[]
  saving: boolean
  error: string | null
  onSave: (body: DevQaOverrideBody) => Promise<void>
  // Plan/Spill (spec ".scratch/sprint-plan-spill-estimate/spec.md") - a
  // separate save action from the Dev/QA select's onSave above, since it's
  // a per-role pair rather than a person pick. Both can fire from the same
  // Save click when both changed.
  savingPlanSpill: boolean
  planSpillError: string | null
  onSavePlanSpill: (role: 'dev' | 'qa', pair: PlanSpillPair) => Promise<void>
  // PO assignment - Story tickets only (checked against entry.ticketId.type
  // below, never rendered for a Bug even though both are Split). A separate
  // save action from onSave above since it's its own TicketPoAssignment
  // collection, not a third role on TicketDevQaOverride.
  poSaving: boolean
  poError: string | null
  onSavePo: (body: PoAssignmentBody) => Promise<void>
  onClose: () => void
}

function initialPersonId(resolution: DevQaRoleResolution): string {
  return resolution.status === 'resolved' ? resolution.personId : ''
}

// Context line under a role's select, mirroring TicketInfoPopup's "Jira
// assignee: {name}" line for non-split tickets: always shows this role's
// actual current `[Dev]`/`[Test]` Sub-task assignee from Jira, regardless of
// what's picked in the select above (a Dev/QA Override can differ from it
// and still wins per ADR 0004 - this line is informational only, never
// itself editable). Flagged amber when that Jira assignee is a real person
// who isn't on this team's roster (CONTEXT.md "Unmapped assignee"), since
// that's why the select can't just default to them.
function RoleHint({ resolution }: { resolution: DevQaRoleResolution }) {
  if (resolution.status === 'unmapped') {
    return (
      <span className="text-[11px] text-amber-600 dark:text-amber-300">
        Jira assignee: {resolution.assigneeDisplayName ?? resolution.assigneeAccountId} (not on this team&apos;s roster)
      </span>
    )
  }
  return (
    <span className="text-[11px] text-slate-500 dark:text-slate-400">
      Jira assignee: {resolution.jiraAssigneeDisplayName ?? 'Unassigned'}
    </span>
  )
}

function RoleField({
  label,
  resolution,
  options,
  value,
  onChange,
}: {
  label: 'Dev' | 'QA'
  resolution: DevQaRoleResolution
  // Who this role's <select> actually offers - DEV_ROLES for Dev, QA_ROLES
  // for QA (spec: "only show those people to select and reassign").
  options: TeamMembership[]
  value: string
  onChange: (v: string) => void
}) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-xs font-medium text-slate-500 dark:text-slate-300">{label}</span>
      <select
        aria-label={`${label} assignee`}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="rounded-lg border border-slate-200 bg-slate-50 px-2 py-1.5 text-sm focus:border-fuchsia-400/60 focus:outline-none dark:border-white/10 dark:bg-white/5 dark:text-slate-100"
      >
        <option value="">— Follow Jira —</option>
        {options.map((m) => (
          <option key={getId(m)} value={getId(m.personId)}>
            {m.personId.name}
          </option>
        ))}
      </select>
      <RoleHint resolution={resolution} />
    </div>
  )
}

function parseEstimateHours(e: ChangeEvent<HTMLInputElement>): number {
  return Number.isNaN(e.target.valueAsNumber) ? 0 : Math.max(0, e.target.valueAsNumber)
}

// PO's assignee select and hours estimate, deliberately laid out in one row
// (not RoleField+PlanSpillTrio's stacked select-then-card shape) - the user
// asked for PO to "save space" rather than get the full Original/Plan/Spill
// treatment Dev/QA has, since a PO's estimate has no Jira Sub-task to
// compare against (TicketPoAssignment.ts) and Planning never counts it
// toward anyone's capacity - it's just recorded alongside who owns the
// Story from a product standpoint.
function PoRow({
  options,
  personId,
  onPersonChange,
  estimateHours,
  onEstimateChange,
  disabled,
}: {
  options: TeamMembership[]
  personId: string
  onPersonChange: (v: string) => void
  estimateHours: number
  onEstimateChange: (hours: number) => void
  disabled: boolean
}) {
  return (
    <div className="flex items-end gap-2">
      <div className="flex flex-1 flex-col gap-1">
        <span className="text-xs font-medium text-slate-500 dark:text-slate-300">PO</span>
        <select
          aria-label="PO assignee"
          value={personId}
          disabled={disabled}
          onChange={(e) => onPersonChange(e.target.value)}
          className="rounded-lg border border-slate-200 bg-slate-50 px-2 py-1.5 text-sm focus:border-fuchsia-400/60 focus:outline-none disabled:cursor-not-allowed disabled:opacity-50 dark:border-white/10 dark:bg-white/5 dark:text-slate-100"
        >
          <option value="">— Unassigned —</option>
          {options.map((m) => (
            <option key={getId(m)} value={getId(m.personId)}>
              {m.personId.name}
            </option>
          ))}
        </select>
      </div>
      <div className="flex w-20 shrink-0 flex-col gap-1">
        <span className="text-xs font-medium text-slate-500 dark:text-slate-300">Est (h)</span>
        <input
          type="number"
          min={0}
          value={estimateHours}
          disabled={disabled}
          onChange={(e) => onEstimateChange(parseEstimateHours(e))}
          aria-label="PO estimate hours"
          className="[appearance:textfield] rounded-lg border border-slate-200 bg-slate-50 px-2 py-1.5 text-sm focus:border-fuchsia-400/60 focus:outline-none disabled:cursor-not-allowed disabled:opacity-50 [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none dark:border-white/10 dark:bg-white/5 dark:text-slate-100"
        />
      </div>
    </div>
  )
}

// Ticket 24's popup: shows both roles for one Split ticket, a Jira deep
// link, and lets the user fill in or edit a Dev/QA Override (CONTEXT.md).
// Reachable from PlanningView either by clicking any TicketBadge for a Split
// ticket (needs-assignment or already-resolved - same component either way)
// or auto-opened right after AddToPlanForm's submit succeeds when a role is
// needs-assignment. Each select only offers memberships whose role maps to
// that slot (constants/roles.ts's DEV_ROLES/QA_ROLES) - reassigning Dev to a
// QA-only person (or vice versa) isn't offered. Modeled on ConfirmDialog.tsx's
// archetype-B full modal (docs/ui-conventions.md) rather than inventing a new
// modal mechanism.
export function DevQaAssignmentPopup({
  entry,
  memberships,
  saving,
  error,
  onSave,
  savingPlanSpill,
  planSpillError,
  onSavePlanSpill,
  poSaving,
  poError,
  onSavePo,
  onClose,
}: DevQaAssignmentPopupProps) {
  const { dev, qa } = entry.devQa
  const [devPersonId, setDevPersonId] = useState(() => initialPersonId(dev))
  const [qaPersonId, setQaPersonId] = useState(() => initialPersonId(qa))
  const devOptions = memberships.filter((m) => DEV_ROLES.includes(m.role))
  const qaOptions = memberships.filter((m) => QA_ROLES.includes(m.role))

  // PO - Story tickets only (not Bug, even though both are Split per
  // isSplitTicket) - CLAUDE.md/CONTEXT.md: app-side data, never Jira's real
  // assignee, so there's no RoleHint/Jira comparison line the way Dev/QA
  // have.
  const isStory = isPoEligibleTicket(entry.ticketId.type)
  const poOptions = memberships.filter((m) => m.role === 'PO')
  const initialPoPersonId = entry.poPersonId ?? ''
  const initialPoEstimateHours = entry.poEstimateHours ?? 0
  const [poPersonId, setPoPersonId] = useState(initialPoPersonId)
  const [poEstimateHours, setPoEstimateHours] = useState(initialPoEstimateHours)

  // Reassigning a role's person does not reset that role's Plan/Spill -
  // they're properties of the ticket+role+sprint, not of whichever person
  // currently holds the role (spec).
  const devOriginal = entry.devEstimateHours ?? 0
  const qaOriginal = entry.qaEstimateHours ?? 0
  const initialDevPair = initialPlanSpillPair(entry.devPlanHours ?? undefined, entry.devSpillHours ?? undefined, devOriginal)
  const initialQaPair = initialPlanSpillPair(entry.qaPlanHours ?? undefined, entry.qaSpillHours ?? undefined, qaOriginal)
  const [devPair, setDevPair] = useState(initialDevPair)
  const [qaPair, setQaPair] = useState(initialQaPair)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()

    // Only send whichever role(s) actually changed (ticket 24's checklist) -
    // a role left untouched from its initial value is left out so an
    // unrelated save can't accidentally clear an already-correct Override.
    const body: DevQaOverrideBody = {}
    if (devPersonId !== initialPersonId(dev)) body.devPersonId = devPersonId || null
    if (qaPersonId !== initialPersonId(qa)) body.qaPersonId = qaPersonId || null

    // Same "only touch what changed" pattern, extended to each role's own
    // Plan/Spill pair.
    const pairChanged = (pair: PlanSpillPair, initial: PlanSpillPair) =>
      pair.planHours !== initial.planHours || pair.spillHours !== initial.spillHours

    const saves: Promise<unknown>[] = []
    if (Object.keys(body).length > 0) saves.push(onSave(body))
    if (pairChanged(devPair, initialDevPair)) saves.push(onSavePlanSpill('dev', devPair))
    if (pairChanged(qaPair, initialQaPair)) saves.push(onSavePlanSpill('qa', qaPair))

    if (isStory) {
      const poBody: PoAssignmentBody = {}
      if (poPersonId !== initialPoPersonId) poBody.poPersonId = poPersonId || null
      if (poEstimateHours !== initialPoEstimateHours) poBody.poEstimateHours = poEstimateHours
      if (Object.keys(poBody).length > 0) saves.push(onSavePo(poBody))
    }

    if (saves.length === 0) {
      onClose()
      return
    }

    try {
      await Promise.all(saves)
      onClose()
    } catch {
      // The `error`/`planSpillError` props (threaded from useSprintPlan's
      // saveDevQaOverride/savePlanSpill) already surface the failure - keep
      // the popup open with the user's picks intact so they can retry
      // without re-entering everything.
    }
  }

  return (
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center bg-black/60 p-4"
      role="dialog"
      aria-modal="true"
      aria-label={`Assign dev/qa for ${entry.ticketId.jiraKey}`}
    >
      <div className="w-full max-w-sm rounded-2xl border border-slate-200 bg-white p-6 text-slate-900 shadow-xl dark:border-white/10 dark:bg-[#160f24] dark:text-slate-100">
        <div className="flex items-start justify-between gap-2">
          <h2 className="text-lg font-semibold">{entry.ticketId.jiraKey}</h2>
          <a
            href={`${JIRA_BASE_URL}/browse/${entry.ticketId.jiraKey}`}
            target="_blank"
            rel="noreferrer"
            className="shrink-0 text-xs text-fuchsia-600 hover:underline dark:text-fuchsia-300"
          >
            Open in Jira ↗
          </a>
        </div>
        <p className="mb-4 truncate text-xs text-slate-500 dark:text-slate-400">{entry.ticketId.title}</p>
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div>
            <RoleField label="Dev" resolution={dev} options={devOptions} value={devPersonId} onChange={setDevPersonId} />
            <PlanSpillTrio
              label="Dev"
              original={devOriginal}
              plan={devPair.planHours}
              spill={devPair.spillHours}
              onPlanChange={(planHours) => setDevPair((p) => ({ ...p, planHours }))}
              onSpillChange={(spillHours) => setDevPair((p) => ({ ...p, spillHours }))}
              saving={savingPlanSpill}
              error={planSpillError}
            />
          </div>
          <div>
            <RoleField label="QA" resolution={qa} options={qaOptions} value={qaPersonId} onChange={setQaPersonId} />
            <PlanSpillTrio
              label="QA"
              original={qaOriginal}
              plan={qaPair.planHours}
              spill={qaPair.spillHours}
              onPlanChange={(planHours) => setQaPair((p) => ({ ...p, planHours }))}
              onSpillChange={(spillHours) => setQaPair((p) => ({ ...p, spillHours }))}
              saving={savingPlanSpill}
              error={planSpillError}
            />
          </div>
          {isStory && (
            <PoRow
              options={poOptions}
              personId={poPersonId}
              onPersonChange={setPoPersonId}
              estimateHours={poEstimateHours}
              onEstimateChange={setPoEstimateHours}
              disabled={poSaving}
            />
          )}
          {error && <p className="text-xs text-red-600 dark:text-red-400">{error}</p>}
          {isStory && poError && <p className="text-xs text-red-600 dark:text-red-400">{poError}</p>}
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
              disabled={saving || savingPlanSpill || poSaving}
              className="rounded-lg bg-gradient-to-r from-violet-500 to-fuchsia-500 px-3 py-1.5 text-sm font-semibold text-white hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {saving || savingPlanSpill || poSaving ? 'Saving…' : 'Save'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
