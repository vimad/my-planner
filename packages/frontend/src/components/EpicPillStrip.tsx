import { useState } from 'react'
import { JIRA_BASE_URL } from '../constants/jira'
import { getId } from '../utils/getId'
import type { Epic } from '../types'

function EpicPill({ epic, onClick }: { epic: Epic; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-medium text-slate-600 hover:bg-slate-100 dark:border-white/10 dark:bg-white/5 dark:text-slate-300 dark:hover:bg-white/10"
    >
      {epic.title}{' '}
      <span className="text-slate-400">
        ({epic.doneCount}/{epic.childCount})
      </span>
    </button>
  )
}

// Ticket 20's stub detail view - phase 1 shows only whatever fields
// Epic/rollup already provide (GET /api/epics?sprintId=, ticket 13). A real
// deep-link-to-Jira affordance is included even though the full detail
// fetch itself is out of scope here.
function EpicModal({ epic, onClose }: { epic: Epic; onClose: () => void }) {
  return (
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center bg-black/60 p-4"
      role="dialog"
      aria-modal="true"
      aria-label={epic.title}
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-sm rounded-2xl border border-slate-200 bg-white p-6 text-slate-900 shadow-xl dark:border-white/10 dark:bg-[#160f24] dark:text-slate-100"
      >
        <span className="font-mono text-xs text-fuchsia-600 dark:text-fuchsia-300">{epic.jiraKey}</span>
        <h3 className="mt-1 text-lg font-semibold">{epic.title}</h3>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
          {epic.status} &middot; {epic.doneCount}/{epic.childCount} child tickets done
        </p>
        <div className="mt-4 flex justify-end gap-2">
          <a
            href={`${JIRA_BASE_URL}/browse/${epic.jiraKey}`}
            target="_blank"
            rel="noreferrer"
            className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-100 dark:border-white/10 dark:text-slate-300 dark:hover:bg-white/5"
          >
            Open in Jira ↗
          </a>
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

// Ticket 20's active-epics list for the selected sprint: a horizontal pill
// strip (title + done/total child-ticket rollup), sourced from
// GET /api/epics?sprintId= (ticket 13). Clicking a pill opens a full modal
// (ui-conventions archetype B) - this is the phase-1 Epic view in full, no
// dedicated route beyond this (spec's "Planning view UI").
export function EpicPillStrip({ epics, loading, error }: { epics: Epic[]; loading: boolean; error: string | null }) {
  const [selectedEpic, setSelectedEpic] = useState<Epic | null>(null)

  if (loading) return <p className="text-sm text-slate-400 dark:text-slate-500">Loading epics…</p>
  if (error) {
    return <p className="text-xs text-red-600 dark:text-red-400">Error loading epics: {error}</p>
  }
  if (epics.length === 0) {
    return <p className="text-sm text-slate-400 dark:text-slate-500">No active epics for this sprint.</p>
  }

  return (
    <>
      <div aria-label="Active epics" className="flex flex-wrap gap-2">
        {epics.map((epic) => (
          <EpicPill key={getId(epic) ?? epic.jiraKey} epic={epic} onClick={() => setSelectedEpic(epic)} />
        ))}
      </div>
      {selectedEpic && <EpicModal epic={selectedEpic} onClose={() => setSelectedEpic(null)} />}
    </>
  )
}
