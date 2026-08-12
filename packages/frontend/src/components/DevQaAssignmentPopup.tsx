import { useState, type FormEvent } from 'react'
import { JIRA_BASE_URL } from '../constants/jira'
import { DEV_ROLES, QA_ROLES } from '../constants/roles'
import { getId } from '../utils/getId'
import type { DevQaRoleResolution, SprintPlanEntry, TeamMembership } from '../types'

// PUT /api/tickets/:ticketId/dev-qa-override's body (ticket 23) - only the
// role(s) the user actually changed are included, same "presence not
// truthiness" partial-update convention as team-memberships.ts's
// capacityPercentOverride PATCH elsewhere in this app.
export interface DevQaOverrideBody {
  devPersonId?: string | null
  qaPersonId?: string | null
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
export function DevQaAssignmentPopup({ entry, memberships, saving, error, onSave, onClose }: DevQaAssignmentPopupProps) {
  const { dev, qa } = entry.devQa
  const [devPersonId, setDevPersonId] = useState(initialPersonId(dev))
  const [qaPersonId, setQaPersonId] = useState(initialPersonId(qa))
  const devOptions = memberships.filter((m) => DEV_ROLES.includes(m.role))
  const qaOptions = memberships.filter((m) => QA_ROLES.includes(m.role))

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()

    // Only send whichever role(s) actually changed (ticket 24's checklist) -
    // a role left untouched from its initial value is left out so an
    // unrelated save can't accidentally clear an already-correct Override.
    const body: DevQaOverrideBody = {}
    if (devPersonId !== initialPersonId(dev)) body.devPersonId = devPersonId || null
    if (qaPersonId !== initialPersonId(qa)) body.qaPersonId = qaPersonId || null

    if (Object.keys(body).length === 0) {
      onClose()
      return
    }

    try {
      await onSave(body)
      onClose()
    } catch {
      // The `error` prop (threaded from useSprintPlan's saveDevQaOverride)
      // already surfaces the failure - keep the popup open with the user's
      // picks intact so they can retry without re-selecting.
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
          <RoleField label="Dev" resolution={dev} options={devOptions} value={devPersonId} onChange={setDevPersonId} />
          <RoleField label="QA" resolution={qa} options={qaOptions} value={qaPersonId} onChange={setQaPersonId} />
          {error && <p className="text-xs text-red-600 dark:text-red-400">{error}</p>}
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
              disabled={saving}
              className="rounded-lg bg-gradient-to-r from-violet-500 to-fuchsia-500 px-3 py-1.5 text-sm font-semibold text-white hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {saving ? 'Saving…' : 'Save'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
