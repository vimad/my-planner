import { JIRA_BASE_URL } from '../constants/jira'
import type { Ticket } from '../types'

// A non-split ticket (Task/Sub-task, CONTEXT.md "Split ticket") has a single
// Jira assignee, not a dev/qa Role assignment pair - there's nothing to
// reassign for it (TicketDevQaOverride only covers Split tickets), so
// clicking one of these in the Planning table gets this read-only info-only
// popup instead of DevQaAssignmentPopup. Same archetype-B modal
// (docs/ui-conventions.md) as DevQaAssignmentPopup and EpicPillStrip.tsx's
// EpicModal, though the Jira link sits in this one's header row rather than
// its footer.
export function TicketInfoPopup({ ticket, onClose }: { ticket: Ticket; onClose: () => void }) {
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
        <p className="mb-4 text-xs text-slate-500 dark:text-slate-400">Assignee: {ticket.assigneeDisplayName ?? 'Unassigned'}</p>
        <div className="flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-100 dark:border-white/10 dark:text-slate-300 dark:hover:bg-white/5"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  )
}
