import { useEffect, useRef, useState, type FormEvent } from 'react'
import { Users } from 'lucide-react'
import { useAtlasRoster } from '../hooks/useAtlasRoster'
import type { AtlasRosterMember, JiraUserSuggestion, Person } from '../types'
import { ConfirmDialog } from './ConfirmDialog'

// Debounce delay for the "Search Jira" add-person mode's live user search -
// mirrors TeamRoster.tsx's own JIRA_SEARCH_DEBOUNCE_MS.
const JIRA_SEARCH_DEBOUNCE_MS = 300

function memberId(m: AtlasRosterMember): string {
  return String(m._id ?? m.id)
}

function personId(p: Person): string {
  return String(p._id ?? p.id)
}

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

// One roster row - identity only, no role/capacity (Atlas isn't a planning
// surface like Team - see useAtlasRoster.ts).
function RosterRow({
  member,
  onRemoveRequest,
}: {
  member: AtlasRosterMember
  onRemoveRequest: (member: AtlasRosterMember) => void
}) {
  const person = member.personId
  return (
    <div className="flex items-center justify-between gap-2 rounded-xl px-2 py-1.5 hover:bg-slate-50 dark:hover:bg-white/5">
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="truncate text-sm text-slate-700 dark:text-slate-200">{person.name}</span>
        <span className="truncate text-xs text-slate-400 dark:text-slate-500">{person.email}</span>
      </div>
      <button
        type="button"
        onClick={() => onRemoveRequest(member)}
        aria-label={`Remove ${person.name} from Atlas`}
        className="shrink-0 rounded-lg px-1.5 py-1 text-xs text-red-400 hover:bg-red-50 dark:hover:bg-red-500/10"
      >
        🗑
      </button>
    </div>
  )
}

// A small pill toggle shared by the three add-person modes below - same as
// TeamRoster.tsx's ModeButton.
function ModeButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${
        active
          ? 'bg-gradient-to-r from-violet-500 to-fuchsia-500 text-white'
          : 'text-slate-500 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-white/10'
      }`}
    >
      {children}
    </button>
  )
}

// The "Add person" mini-flow - same three ways to land on a person as
// TeamRoster.tsx's AddPersonForm (existing/jira/manual), minus role/capacity
// since Atlas's roster carries neither.
function AddPersonForm({
  people,
  existingPersonIds,
  onAddExisting,
  onAddNew,
  searchJiraUsers,
}: {
  people: Person[]
  existingPersonIds: Set<string>
  onAddExisting: (personId: string) => Promise<void>
  onAddNew: (person: { name: string; email: string; jiraAccountId: string }) => Promise<void>
  searchJiraUsers: (query: string) => Promise<JiraUserSuggestion[] | null>
}) {
  const [mode, setMode] = useState<'existing' | 'jira' | 'manual'>('jira')
  const [query, setQuery] = useState('')
  const [selectedPerson, setSelectedPerson] = useState<Person | null>(null)

  const [jiraQuery, setJiraQuery] = useState('')
  const [jiraResults, setJiraResults] = useState<JiraUserSuggestion[]>([])
  const [jiraSearching, setJiraSearching] = useState(false)
  const [selectedJiraUser, setSelectedJiraUser] = useState<JiraUserSuggestion | null>(null)
  const [jiraSearchAvailable, setJiraSearchAvailable] = useState(true)

  const [newName, setNewName] = useState('')
  const [newEmail, setNewEmail] = useState('')
  const [newJiraAccountId, setNewJiraAccountId] = useState('')

  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    if (mode !== 'jira' || selectedJiraUser || !jiraSearchAvailable || jiraQuery.trim().length < 2) {
      setJiraResults([])
      setJiraSearching(false)
      return
    }
    let ignore = false
    setJiraSearching(true)
    const timer = setTimeout(async () => {
      const results = await searchJiraUsers(jiraQuery.trim())
      if (ignore) return
      setJiraSearching(false)
      if (results === null) {
        setJiraSearchAvailable(false)
        setJiraResults([])
        setMode('manual')
      } else {
        setJiraResults(results)
      }
    }, JIRA_SEARCH_DEBOUNCE_MS)
    return () => {
      ignore = true
      clearTimeout(timer)
    }
  }, [mode, jiraQuery, selectedJiraUser, jiraSearchAvailable, searchJiraUsers])

  function selectJiraUser(user: JiraUserSuggestion) {
    setSelectedJiraUser(user)
    setNewName(user.displayName ?? '')
    setNewEmail(user.emailAddress ?? '')
    setJiraQuery('')
    setJiraResults([])
  }

  function switchMode(next: 'existing' | 'jira' | 'manual') {
    setMode(next)
    setSelectedPerson(null)
    setQuery('')
    setSelectedJiraUser(null)
    setJiraQuery('')
    setJiraResults([])
    setNewName('')
    setNewEmail('')
    setNewJiraAccountId('')
  }

  function resetForm() {
    switchMode(jiraSearchAvailable ? 'jira' : 'manual')
  }

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setSubmitting(true)
    try {
      if (mode === 'existing') {
        if (!selectedPerson) return
        await onAddExisting(personId(selectedPerson))
      } else if (mode === 'jira') {
        if (!selectedJiraUser) return
        const name = newName.trim()
        const email = newEmail.trim()
        if (!name || !email) return
        await onAddNew({ name, email, jiraAccountId: selectedJiraUser.accountId })
      } else {
        const name = newName.trim()
        const email = newEmail.trim()
        const jiraAccountId = newJiraAccountId.trim()
        if (!name || !email || !jiraAccountId) return
        await onAddNew({ name, email, jiraAccountId })
      }
      resetForm()
    } finally {
      setSubmitting(false)
    }
  }

  const searchResults =
    mode === 'existing' && query.trim().length > 0
      ? people
          .filter((p) => !existingPersonIds.has(personId(p)))
          .filter((p) => `${p.name} ${p.email}`.toLowerCase().includes(query.trim().toLowerCase()))
          .slice(0, 6)
      : []

  const canSubmit =
    mode === 'existing'
      ? selectedPerson !== null
      : mode === 'jira'
        ? selectedJiraUser !== null && newName.trim() !== '' && newEmail.trim() !== ''
        : newName.trim() !== '' && newEmail.trim() !== '' && newJiraAccountId.trim() !== ''

  const textInputClass =
    'w-full rounded-lg border border-slate-200 bg-slate-50 px-2 py-1 text-sm text-slate-900 placeholder:text-slate-400 focus:border-fuchsia-400/60 focus:outline-none dark:border-white/10 dark:bg-white/5 dark:text-slate-100 dark:placeholder:text-slate-500'
  const resultsBoxClass =
    'flex flex-col gap-0.5 rounded-lg border border-slate-200 bg-white p-1 shadow-sm dark:border-white/10 dark:bg-[#1c1330]'
  const resultRowClass =
    'flex items-center justify-between rounded-md px-2 py-1 text-left text-xs text-slate-700 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-white/10'

  return (
    <form
      onSubmit={handleSubmit}
      aria-label="Add person to Atlas"
      className="flex flex-col gap-1.5 rounded-xl border border-dashed border-slate-200 p-2 dark:border-white/10"
    >
      <div className="flex items-center gap-1">
        {jiraSearchAvailable && (
          <ModeButton active={mode === 'jira'} onClick={() => switchMode('jira')}>
            Search Jira
          </ModeButton>
        )}
        <ModeButton active={mode === 'existing'} onClick={() => switchMode('existing')}>
          Existing person
        </ModeButton>
        <ModeButton active={mode === 'manual'} onClick={() => switchMode('manual')}>
          Manual entry
        </ModeButton>
      </div>

      {mode === 'existing' &&
        (selectedPerson ? (
          <div className="flex items-center justify-between gap-2 rounded-lg bg-slate-50 px-2 py-1 text-xs text-slate-700 dark:bg-white/5 dark:text-slate-200">
            <span className="truncate">
              {selectedPerson.name} · {selectedPerson.email}
            </span>
            <button
              type="button"
              onClick={() => setSelectedPerson(null)}
              aria-label="Clear selected person"
              className="shrink-0 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
            >
              ✕
            </button>
          </div>
        ) : (
          <div className="flex flex-col gap-1">
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search people..."
              aria-label="Search people"
              className={textInputClass}
            />
            {searchResults.length > 0 && (
              <div className={resultsBoxClass}>
                {searchResults.map((p) => (
                  <button
                    key={personId(p)}
                    type="button"
                    onClick={() => {
                      setSelectedPerson(p)
                      setQuery('')
                    }}
                    className={resultRowClass}
                  >
                    <span className="truncate">
                      {p.name} · {p.email}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>
        ))}

      {mode === 'jira' &&
        (selectedJiraUser ? (
          <div className="flex flex-col gap-1">
            <div className="flex items-center justify-between gap-2 rounded-lg bg-slate-50 px-2 py-1 text-xs text-slate-700 dark:bg-white/5 dark:text-slate-200">
              <span className="truncate">
                {selectedJiraUser.displayName ?? selectedJiraUser.accountId}
                <span className="ml-1.5 text-[10px] font-semibold text-fuchsia-600 dark:text-fuchsia-300">
                  From Jira
                </span>
              </span>
              <button
                type="button"
                onClick={() => {
                  setSelectedJiraUser(null)
                  setNewName('')
                  setNewEmail('')
                }}
                aria-label="Clear selected Jira user"
                className="shrink-0 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
              >
                ✕
              </button>
            </div>
            <input
              type="text"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="Name"
              aria-label="Jira-sourced person name"
              className={textInputClass}
            />
            <input
              type="email"
              value={newEmail}
              onChange={(e) => setNewEmail(e.target.value)}
              placeholder="Email"
              aria-label="Jira-sourced person email"
              className={textInputClass}
            />
            <span className="px-0.5 text-[10px] text-slate-400 dark:text-slate-500">
              Jira account: {selectedJiraUser.accountId}
            </span>
          </div>
        ) : (
          <div className="flex flex-col gap-1">
            <input
              type="search"
              value={jiraQuery}
              onChange={(e) => setJiraQuery(e.target.value)}
              placeholder="Search Jira by name or email..."
              aria-label="Search Jira users"
              className={textInputClass}
            />
            {jiraSearching && (
              <p className="flex items-center gap-1.5 px-0.5 py-1 text-xs text-slate-500 dark:text-slate-400">
                <span
                  aria-hidden="true"
                  className="h-3 w-3 shrink-0 animate-spin rounded-full border-2 border-slate-300 border-t-fuchsia-500 dark:border-white/20 dark:border-t-fuchsia-400"
                />
                Searching Jira...
              </p>
            )}
            {jiraResults.length > 0 && (
              <div className={resultsBoxClass}>
                {jiraResults.map((u) => (
                  <button key={u.accountId} type="button" onClick={() => selectJiraUser(u)} className={resultRowClass}>
                    <span className="truncate">
                      {u.displayName ?? u.accountId} {u.emailAddress ? `· ${u.emailAddress}` : '· no email on Jira'}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>
        ))}

      {mode === 'manual' && (
        <div className="flex flex-col gap-1">
          <input
            type="text"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="Name"
            aria-label="New person name"
            className={textInputClass}
          />
          <input
            type="email"
            value={newEmail}
            onChange={(e) => setNewEmail(e.target.value)}
            placeholder="Email"
            aria-label="New person email"
            className={textInputClass}
          />
          <input
            type="text"
            value={newJiraAccountId}
            onChange={(e) => setNewJiraAccountId(e.target.value)}
            placeholder="Jira account id"
            aria-label="New person Jira account id"
            className={textInputClass}
          />
        </div>
      )}

      <button
        type="submit"
        disabled={!canSubmit || submitting}
        className="ml-auto shrink-0 rounded-lg bg-gradient-to-r from-violet-500 to-fuchsia-500 px-2.5 py-1 text-xs font-semibold text-white hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {submitting ? 'Adding...' : 'Add'}
      </button>
    </form>
  )
}

// SprintShell's Atlas-route equivalent of TeamSwitcher - a gear-style button
// that opens a panel to manage who's on Atlas's own roster. Unlike
// TeamSwitcher there's no tab row to pick between (Atlas has exactly one
// roster, not many teams to switch between), so this jumps straight to the
// "manage" panel behind one button. Rendered instead of TeamSwitcher only on
// the Atlas route (SprintShell.tsx) - Atlas has no team scoping at all
// (spec.md §1), so a Team-bound roster switcher doesn't apply here; this
// roster is bound to Atlas itself (useAtlasRoster.ts) and feeds
// AtlasTaskBoard's assignee-name resolution (utils/atlasAssignee.ts) via the
// separate read-only useAtlasRosterPeople.ts hook.
export function AtlasPeopleButton() {
  const [open, setOpen] = useState(false)
  const panelRef = useOutsideClick(() => setOpen(false))
  const { roster, people, loading, error, addExistingPerson, addNewPerson, removeMember, searchJiraUsers } = useAtlasRoster()
  const [pendingRemove, setPendingRemove] = useState<AtlasRosterMember | null>(null)

  const existingPersonIds = new Set(roster.map((m) => personId(m.personId)))

  return (
    <div aria-label="Atlas people" className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-label="Manage Atlas people"
        aria-expanded={open}
        className="flex items-center gap-1.5 rounded-full border border-slate-200 bg-white px-3 py-1.5 text-sm font-medium text-slate-600 hover:bg-slate-100 dark:border-white/10 dark:bg-white/5 dark:text-slate-300 dark:hover:bg-white/10"
      >
        <Users size={14} />
        {roster.length} {roster.length === 1 ? 'person' : 'people'}
      </button>

      {open && (
        <div
          ref={panelRef}
          aria-label="Atlas people panel"
          className="absolute right-0 top-11 z-10 max-h-[80vh] w-80 overflow-y-auto rounded-2xl border border-slate-200 bg-white p-2 shadow-xl dark:border-white/10 dark:bg-[#1a1626]"
        >
          <p className="mb-1 px-2 pt-1 text-xs font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">
            Atlas people
          </p>
          <p className="mb-2 px-2 text-xs text-slate-400 dark:text-slate-500">
            Bound to Atlas only, not any team — used to show real names on the task board.
          </p>

          <AddPersonForm
            people={people}
            existingPersonIds={existingPersonIds}
            onAddExisting={addExistingPerson}
            onAddNew={addNewPerson}
            searchJiraUsers={searchJiraUsers}
          />

          {loading && <p className="px-2 py-2 text-xs text-slate-400 dark:text-slate-500">Loading...</p>}
          {error && <p className="px-2 py-2 text-xs text-red-500 dark:text-red-400">Error: {error}</p>}
          {!loading && roster.length === 0 && (
            <p className="px-2 py-2 text-xs text-slate-400 dark:text-slate-500">No one added to Atlas yet.</p>
          )}

          {roster.map((m) => (
            <RosterRow key={memberId(m)} member={m} onRemoveRequest={setPendingRemove} />
          ))}
        </div>
      )}

      {pendingRemove && (
        <ConfirmDialog
          message={`Remove ${pendingRemove.personId.name} from Atlas?`}
          confirmLabel="Remove"
          onCancel={() => setPendingRemove(null)}
          onConfirm={() => {
            const id = memberId(pendingRemove)
            setPendingRemove(null)
            removeMember(id)
          }}
        />
      )}
    </div>
  )
}
