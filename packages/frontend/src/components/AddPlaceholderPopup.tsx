import { useState, type FormEvent } from 'react'
import { getId } from '../utils/getId'
import type { TeamMembership } from '../types'

export interface AddPlaceholderBody {
  personId: string
  text: string
  estimateHours: number
}

interface AddPlaceholderPopupProps {
  memberships: TeamMembership[]
  saving: boolean
  error: string | null
  onSave: (body: AddPlaceholderBody) => Promise<void>
  onClose: () => void
}

// Archetype B full modal (docs/ui-conventions.md) for creating a Placeholder
// ticket - a non-Jira, manually-created stand-in for planning purposes: just
// a short text description, one assignee, and an estimate. Opened via the
// icon button next to AddToPlanForm's "Add" button in PlanningView.tsx.
// Unlike a real ticket add, there's no Jira lookup here - the created
// placeholder is exactly what's typed, nothing to sync or resolve.
export function AddPlaceholderPopup({ memberships, saving, error, onSave, onClose }: AddPlaceholderPopupProps) {
  const [personId, setPersonId] = useState(getId(memberships[0]?.personId) ?? '')
  const [text, setText] = useState('')
  const [estimateHours, setEstimateHours] = useState('')

  const trimmedText = text.trim()
  const parsedHours = Number(estimateHours)
  const canSave =
    !!personId && !!trimmedText && estimateHours.trim() !== '' && Number.isFinite(parsedHours) && parsedHours >= 0

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (!canSave) return
    try {
      await onSave({ personId, text: trimmedText, estimateHours: parsedHours })
      onClose()
    } catch {
      // `error` (threaded from useSprintPlan's addPlaceholder) already
      // surfaces the failure - keep the popup open with the user's inputs
      // intact so they can retry without retyping everything.
    }
  }

  return (
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center bg-black/60 p-4"
      role="dialog"
      aria-modal="true"
      aria-label="Add placeholder ticket"
    >
      <div className="w-full max-w-sm rounded-2xl border border-slate-200 bg-white p-6 text-slate-900 shadow-xl dark:border-white/10 dark:bg-[#160f24] dark:text-slate-100">
        <h2 className="mb-4 text-lg font-semibold">Add placeholder ticket</h2>
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div className="flex flex-col gap-1">
            <label htmlFor="placeholder-assignee" className="text-xs font-medium text-slate-500 dark:text-slate-300">
              Assignee
            </label>
            <select
              id="placeholder-assignee"
              value={personId}
              onChange={(e) => setPersonId(e.target.value)}
              className="rounded-lg border border-slate-200 bg-slate-50 px-2 py-1.5 text-sm focus:border-fuchsia-400/60 focus:outline-none dark:border-white/10 dark:bg-white/5 dark:text-slate-100"
            >
              <option value="" disabled>
                — Select —
              </option>
              {memberships.map((m) => (
                <option key={getId(m)} value={getId(m.personId)}>
                  {m.personId.name}
                </option>
              ))}
            </select>
          </div>
          <div className="flex flex-col gap-1">
            <label htmlFor="placeholder-text" className="text-xs font-medium text-slate-500 dark:text-slate-300">
              Description
            </label>
            <input
              id="placeholder-text"
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="e.g. On-call support"
              maxLength={60}
              className="rounded-lg border border-slate-200 bg-slate-50 px-2 py-1.5 text-sm focus:border-fuchsia-400/60 focus:outline-none dark:border-white/10 dark:bg-white/5 dark:text-slate-100"
            />
          </div>
          <div className="flex flex-col gap-1">
            <label htmlFor="placeholder-estimate" className="text-xs font-medium text-slate-500 dark:text-slate-300">
              Estimate hours
            </label>
            <input
              id="placeholder-estimate"
              type="number"
              min={0}
              step="0.5"
              value={estimateHours}
              onChange={(e) => setEstimateHours(e.target.value)}
              className="w-28 rounded-lg border border-slate-200 bg-slate-50 px-2 py-1.5 text-sm focus:border-fuchsia-400/60 focus:outline-none dark:border-white/10 dark:bg-white/5 dark:text-slate-100"
            />
          </div>
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
              disabled={saving || !canSave}
              className="rounded-lg bg-gradient-to-r from-violet-500 to-fuchsia-500 px-3 py-1.5 text-sm font-semibold text-white hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {saving ? 'Saving…' : 'Add'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
