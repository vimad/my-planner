import { useState, type FormEvent } from 'react'
import { JIRA_BASE_URL } from '../constants/jira'
import { getId } from '../utils/getId'
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
export function TicketInfoPopup({ entry, memberships, saving, error, onSave, onClose }: TicketInfoPopupProps) {
  const ticket = entry.ticketId
  const initialPersonId = entry.assigneeOverridePersonId ?? ''
  const [personId, setPersonId] = useState(initialPersonId)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()

    if (personId === initialPersonId) {
      onClose()
      return
    }

    try {
      await onSave({ personId: personId || null })
      onClose()
    } catch {
      // The `error` prop (threaded from useSprintPlan's saveAssigneeOverride)
      // already surfaces the failure - keep the popup open with the user's
      // pick intact so they can retry without re-selecting.
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
