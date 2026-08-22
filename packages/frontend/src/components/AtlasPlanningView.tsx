import { Repeat2 } from 'lucide-react'
import { useEffect, useRef, useState, type FormEvent } from 'react'
import { jiraIssueUrl } from '../constants/jira'
import { useAtlasPlanning } from '../hooks/useAtlasPlanning'
import { useAtlasRoster } from '../hooks/useAtlasRoster'
import type { AtlasPlanningEntry, AtlasRosterMember } from '../types'
import { normalizePlanningJiraKey } from '../utils/atlasPlanningKey'
import { getId } from '../utils/getId'

// Atlas Planning tab (.scratch/atlas-planning-tab, ticket 01) - a people-wise
// table of plain Jira-key badges, entirely separate from Sprint Planning's
// own people-wise view (PlanningView.tsx/useSprintPlan.ts) and from Atlas's
// epic/task stack (useAtlasEpics.ts): no imports from either, by design (spec
// "Module boundary"). Code duplication with PlanningView's badge/form shapes
// is expected and accepted - only the visual language is copied, not the
// components themselves. The one exception is Atlas's own roster
// (useAtlasRoster.ts), reused as-is since it's shared Atlas infrastructure,
// not part of either module this feature avoids.

// Same "click outside closes it" pattern AtlasPeopleButton.tsx/
// TeamSwitcher.tsx/ProfileSwitcher.tsx each already duplicate locally rather
// than sharing a hook - kept consistent with that convention here too.
function useOutsideClick(onOutside: () => void) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    function handle(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) onOutside()
    }
    document.addEventListener('mousedown', handle)
    return () => document.removeEventListener('mousedown', handle)
  }, [onOutside])
  return ref
}

function memberId(m: AtlasRosterMember): string {
  return getId(m) ?? ''
}

// The attach form: person picker + free-typed Jira key + submit (spec
// "Attaching work" - no backlog browser, no Product/Technical/Bug tabs).
// Styled after PlanningView.tsx's AddToPlanForm (dashed-border bar), same
// visual language, own implementation. Format-checked and normalized via
// this feature's own utils/atlasPlanningKey.ts (TDD'd separately) rather
// than constants/jira.ts's normalizeJiraKey, which only reshapes a prefix
// and doesn't actually validate the shape (spec story 8's "obvious typo"
// guard needs a real check). The normalized (uppercase, full WOSMVP-<n>)
// form is what actually gets stored, matching the shape every other
// Jira-key badge in the app displays.
function AttachTicketForm({
  roster,
  onAttach,
  attaching,
  attachError,
}: {
  roster: AtlasRosterMember[]
  onAttach: (rosterMemberId: string, jiraKey: string) => Promise<void>
  attaching: boolean
  attachError: string | null
}) {
  const [rosterMemberId, setRosterMemberId] = useState('')
  const [jiraKeyInput, setJiraKeyInput] = useState('')
  const [formError, setFormError] = useState<string | null>(null)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setFormError(null)

    if (!rosterMemberId) {
      setFormError('Pick a person')
      return
    }
    const normalized = normalizePlanningJiraKey(jiraKeyInput)
    if (!normalized) {
      setFormError('Enter a valid Jira key, e.g. WOSMVP-14802')
      return
    }

    try {
      await onAttach(rosterMemberId, normalized)
      setJiraKeyInput('')
    } catch {
      // attachError (from useAtlasPlanning) already surfaces the failure.
    }
  }

  return (
    <form
      onSubmit={handleSubmit}
      aria-label="Attach ticket to person"
      className="flex flex-wrap items-center gap-2 rounded-xl border border-dashed border-slate-300 bg-white/60 px-3 py-2 dark:border-white/15 dark:bg-white/5"
    >
      <select
        value={rosterMemberId}
        onChange={(e) => setRosterMemberId(e.target.value)}
        aria-label="Person to attach ticket to"
        disabled={attaching}
        className="rounded-lg border border-slate-200 bg-slate-50 px-2 py-1 text-sm text-slate-900 focus:border-fuchsia-400/60 focus:outline-none disabled:opacity-50 dark:border-white/10 dark:bg-white/5 dark:text-slate-100"
      >
        <option value="">Select person</option>
        {roster.map((m) => (
          <option key={memberId(m)} value={memberId(m)}>
            {m.personId.name}
          </option>
        ))}
      </select>
      <input
        type="text"
        value={jiraKeyInput}
        onChange={(e) => setJiraKeyInput(e.target.value)}
        placeholder="WOSMVP-14802"
        aria-label="Jira key to attach"
        disabled={attaching}
        className="w-36 rounded-lg border border-slate-200 bg-slate-50 px-2 py-1 text-sm focus:border-fuchsia-400/60 focus:outline-none disabled:opacity-50 dark:border-white/10 dark:bg-white/5 dark:text-slate-100"
      />
      <button
        type="submit"
        disabled={attaching}
        className="rounded-lg border border-slate-200 px-3 py-1 text-sm hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-50 dark:border-white/10 dark:hover:bg-white/5"
      >
        {attaching ? 'Attaching…' : 'Attach'}
      </button>
      {formError && <span className="text-xs text-red-600 dark:text-red-400">{formError}</span>}
      {!formError && attachError && <span className="text-xs text-red-600 dark:text-red-400">Error: {attachError}</span>}
    </form>
  )
}

// A plain, neutral slate badge - key text (also the Jira link, spec story
// 11) + a reassign picker + remove (spec story 12/13). Deliberately not the
// violet "Placeholder" color (reserved for Sprint Planning's non-Jira
// stand-ins) and not an issue-type color family (no type data exists here to
// justify one) - same neutral `slate` classes docs/ui-conventions.md
// reserves for Tags ("neutral bg-slate-100 dark:bg-white/10, no
// color-coding").
function PlanningTicketBadge({
  entry,
  roster,
  onRemove,
  removing,
  onReassign,
  reassigning,
}: {
  entry: AtlasPlanningEntry
  roster: AtlasRosterMember[]
  onRemove: () => void
  removing?: boolean
  onReassign: (rosterMemberId: string) => void
  reassigning?: boolean
}) {
  const [pickerOpen, setPickerOpen] = useState(false)
  const pickerRef = useOutsideClick(() => setPickerOpen(false))

  return (
    <span className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-600 dark:border-white/10 dark:bg-white/10 dark:text-slate-300">
      <a
        href={jiraIssueUrl(entry.jiraKey)}
        target="_blank"
        rel="noopener noreferrer"
        className="font-mono hover:underline"
      >
        {entry.jiraKey}
      </a>
      <span ref={pickerRef} className="relative inline-flex">
        <button
          type="button"
          onClick={() => setPickerOpen((o) => !o)}
          disabled={reassigning}
          aria-label={`Reassign ${entry.jiraKey}`}
          aria-expanded={pickerOpen}
          title="Reassign to a different person"
          className="text-slate-400 hover:text-slate-700 disabled:cursor-not-allowed disabled:opacity-50 dark:hover:text-slate-100"
        >
          <Repeat2 size={11} />
        </button>
        {pickerOpen && (
          <div className="absolute left-0 top-full z-10 mt-1 min-w-28 overflow-hidden rounded-lg border border-slate-200 bg-white py-1 shadow-lg dark:border-white/10 dark:bg-[#1a1229]">
            {roster.map((m) => {
              const id = memberId(m)
              return (
                <button
                  key={id}
                  type="button"
                  onClick={() => {
                    setPickerOpen(false)
                    if (id !== entry.rosterMemberId) onReassign(id)
                  }}
                  className="block w-full whitespace-nowrap px-3 py-1.5 text-left text-xs font-sans normal-case text-slate-700 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-white/10"
                >
                  {m.personId.name}
                </button>
              )
            })}
          </div>
        )}
      </span>
      <button
        type="button"
        onClick={onRemove}
        disabled={removing}
        aria-label={`Remove ${entry.jiraKey}`}
        className="font-sans text-xs leading-none text-slate-400 hover:text-slate-700 disabled:cursor-not-allowed disabled:opacity-50 dark:hover:text-slate-100"
      >
        ×
      </button>
    </span>
  )
}

// Ticket 01's whole Planning tab body: attach form + Archetype D table, one
// row per roster member in roster order. Composes useAtlasRoster.ts (Atlas's
// shared roster hook - the one reuse this module is allowed) with this
// module's own useAtlasPlanning.ts, so neither Board/Summary's data
// (useAtlasEpics.ts) nor the roster fetch itself is shared/blocking across
// tabs.
export function AtlasPlanningView() {
  const { roster, loading: rosterLoading, error: rosterError } = useAtlasRoster()
  const {
    entries,
    loading: entriesLoading,
    error: entriesError,
    attaching,
    attachError,
    attachTicket,
    reassignError,
    reassignTicket,
    removeError,
    removeTicket,
  } = useAtlasPlanning()
  const [removingId, setRemovingId] = useState<string | null>(null)
  const [reassigningId, setReassigningId] = useState<string | null>(null)

  async function handleRemove(entryId: string) {
    setRemovingId(entryId)
    try {
      await removeTicket(entryId)
    } catch {
      // removeError already surfaces the failure.
    } finally {
      setRemovingId(null)
    }
  }

  async function handleReassign(entryId: string, rosterMemberId: string) {
    setReassigningId(entryId)
    try {
      await reassignTicket(entryId, rosterMemberId)
    } catch {
      // reassignError already surfaces the failure.
    } finally {
      setReassigningId(null)
    }
  }

  const loading = rosterLoading || entriesLoading

  return (
    <div className="flex flex-col gap-4">
      {!rosterLoading && roster.length > 0 && (
        <AttachTicketForm roster={roster} onAttach={attachTicket} attaching={attaching} attachError={attachError} />
      )}

      {rosterError && <p className="text-sm text-red-600 dark:text-red-400">Error: {rosterError}</p>}
      {entriesError && <p className="text-sm text-red-600 dark:text-red-400">Error: {entriesError}</p>}
      {removeError && <p className="text-sm text-red-600 dark:text-red-400">Error: {removeError}</p>}
      {reassignError && <p className="text-sm text-red-600 dark:text-red-400">Error: {reassignError}</p>}

      {loading && <p className="text-sm text-slate-400 dark:text-slate-500">Loading planning…</p>}

      {!loading && (
        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-white/10 dark:bg-white/5 dark:shadow-none dark:backdrop-blur-md">
          {roster.length === 0 ? (
            <p className="text-sm text-slate-400 dark:text-slate-500">
              No one on the Atlas roster yet — add people from the roster panel above to start planning.
            </p>
          ) : (
            <div role="group" aria-label="People and their attached tickets" className="flex flex-col">
              {roster.map((member) => {
                const id = memberId(member)
                const memberEntries = entries.filter((e) => e.rosterMemberId === id)
                return (
                  <div
                    key={id}
                    aria-label={`Tickets for ${member.personId.name}`}
                    className="grid grid-cols-[10rem_1fr] items-start gap-3 border-b border-slate-100 py-2.5 last:border-0 dark:border-white/5"
                  >
                    <span className="pt-0.5 text-sm font-medium text-slate-800 dark:text-slate-100">{member.personId.name}</span>
                    <div className="flex flex-wrap gap-1.5">
                      {memberEntries.length === 0 ? (
                        <span className="pt-0.5 text-xs text-slate-400 dark:text-slate-500">No tickets attached</span>
                      ) : (
                        memberEntries.map((entry) => {
                          const entryId = getId(entry) ?? ''
                          return (
                            <PlanningTicketBadge
                              key={entryId}
                              entry={entry}
                              roster={roster}
                              onRemove={() => handleRemove(entryId)}
                              removing={removingId === entryId}
                              onReassign={(rosterMemberId) => handleReassign(entryId, rosterMemberId)}
                              reassigning={reassigningId === entryId}
                            />
                          )
                        })
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
