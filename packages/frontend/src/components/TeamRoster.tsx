import { useEffect, useState, type FormEvent } from 'react'
import { ROLE_DEFAULT_CAPACITY_PERCENT, ROLES } from '../constants/roles'
import { getId } from '../utils/getId'
import { useTeamRoster } from '../hooks/useTeamRoster'
import type { JiraUserSuggestion, Person, Role, Team, TeamMembership } from '../types'
import { ConfirmDialog } from './ConfirmDialog'

interface TeamRosterProps {
  team: Team
}

// Debounce delay for the "Search Jira" add-person mode's live user search -
// short enough to feel live, long enough not to hammer
// /api/people/jira-search on every keystroke.
const JIRA_SEARCH_DEBOUNCE_MS = 300

function membershipId(m: TeamMembership): string {
  return String(m._id ?? m.id)
}

function personId(p: Person): string {
  return String(p._id ?? p.id)
}

// One roster row: person identity plus inline-editable role/capacity, no
// modal - edits fire PATCH /api/team-memberships/:id directly on
// change/blur. `key={membershipId(membership)}` at the call site resets the
// uncontrolled capacity input whenever the server's own value changes
// (including this row's own successful save).
function RosterRow({
  membership,
  onUpdate,
  onRemoveRequest,
}: {
  membership: TeamMembership
  onUpdate: (id: string, patch: { role?: Role; capacityPercentOverride?: number | null }) => void
  onRemoveRequest: (membership: TeamMembership) => void
}) {
  const id = membershipId(membership)
  const person = membership.personId

  function handleCapacityBlur(e: React.FocusEvent<HTMLInputElement>) {
    const raw = e.target.value.trim()
    if (raw === '') {
      if (membership.capacityPercentOverride !== null) onUpdate(id, { capacityPercentOverride: null })
      return
    }
    const parsed = Number(raw)
    if (Number.isNaN(parsed)) return
    if (parsed !== membership.capacityPercentOverride) onUpdate(id, { capacityPercentOverride: parsed })
  }

  return (
    <div className="flex items-center justify-between gap-2 rounded-xl px-2 py-1.5 hover:bg-slate-50 dark:hover:bg-white/5">
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="truncate text-sm text-slate-700 dark:text-slate-200">{person.name}</span>
        <span className="truncate text-xs text-slate-400 dark:text-slate-500">{person.email}</span>
      </div>
      <select
        value={membership.role}
        onChange={(e) => onUpdate(id, { role: e.target.value as Role })}
        aria-label={`Role for ${person.name}`}
        className="shrink-0 rounded-lg border border-slate-200 bg-slate-50 px-1.5 py-1 text-xs text-slate-700 focus:border-fuchsia-400/60 focus:outline-none dark:border-white/10 dark:bg-white/5 dark:text-slate-200"
      >
        {ROLES.map((role) => (
          <option key={role} value={role}>
            {role}
          </option>
        ))}
      </select>
      <input
        type="number"
        defaultValue={membership.capacityPercentOverride ?? ''}
        onBlur={handleCapacityBlur}
        placeholder={String(ROLE_DEFAULT_CAPACITY_PERCENT[membership.role])}
        aria-label={`Capacity override for ${person.name}`}
        className="w-14 shrink-0 rounded-lg border border-slate-200 bg-slate-50 px-1.5 py-1 text-xs text-slate-700 placeholder:text-slate-400 focus:border-fuchsia-400/60 focus:outline-none dark:border-white/10 dark:bg-white/5 dark:text-slate-200 dark:placeholder:text-slate-500"
      />
      <button
        type="button"
        onClick={() => onRemoveRequest(membership)}
        aria-label={`Remove ${person.name} from team`}
        className="shrink-0 rounded-lg px-1.5 py-1 text-xs text-red-400 hover:bg-red-50 dark:hover:bg-red-500/10"
      >
        🗑
      </button>
    </div>
  )
}

// A small pill toggle shared by the three add-person modes below.
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

// The "Add person" mini-flow, three ways to land on a person + role/capacity
// pair to POST /api/team-memberships (creating the Person first via
// POST /api/people where needed, in the same step):
//  - existing: autocomplete over all People, not team-scoped
//  - jira: live search-as-you-type over Jira users (GET /api/people/jira-search)
//    - the primary way to add someone new, since it needs zero manual typing
//    beyond a query and guarantees a correct jiraAccountId straight from Jira
//  - manual: plain name/email/jiraAccountId fields - the fallback when Jira
//    search is unavailable (missing "Browse users and groups" permission) or
//    the person isn't findable there yet
function AddPersonForm({
  team,
  people,
  existingPersonIds,
  onAddExisting,
  onAddNew,
  searchJiraUsers,
}: {
  team: Team
  people: Person[]
  existingPersonIds: Set<string>
  onAddExisting: (personId: string, role: Role, capacityPercentOverride?: number) => Promise<void>
  onAddNew: (
    person: { name: string; email: string; jiraAccountId: string },
    role: Role,
    capacityPercentOverride?: number,
  ) => Promise<void>
  searchJiraUsers: (query: string) => Promise<JiraUserSuggestion[] | null>
}) {
  const [mode, setMode] = useState<'existing' | 'jira' | 'manual'>('jira')
  const [query, setQuery] = useState('')
  const [selectedPerson, setSelectedPerson] = useState<Person | null>(null)

  const [jiraQuery, setJiraQuery] = useState('')
  const [jiraResults, setJiraResults] = useState<JiraUserSuggestion[]>([])
  const [jiraSearching, setJiraSearching] = useState(false)
  const [selectedJiraUser, setSelectedJiraUser] = useState<JiraUserSuggestion | null>(null)
  // Once a search comes back null (403/unavailable), stop trying and drop
  // back to manual entry for the rest of this form's lifetime - degrade
  // silently rather than repeatedly firing requests that will never
  // succeed (spec: "must degrade silently, not block the form").
  const [jiraSearchAvailable, setJiraSearchAvailable] = useState(true)

  const [newName, setNewName] = useState('')
  const [newEmail, setNewEmail] = useState('')
  const [newJiraAccountId, setNewJiraAccountId] = useState('')

  const [role, setRole] = useState<Role>(ROLES[0])
  const [capacityInput, setCapacityInput] = useState('')
  const [submitting, setSubmitting] = useState(false)

  // Live Jira user search as the team lead types - runs only while in
  // "jira" mode and nothing's selected yet.
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

  // Picking a Jira result pre-fills name/email (still editable, since
  // `emailAddress`/`displayName` may be null per the org's Jira privacy
  // settings - see ADR 0001) but locks jiraAccountId to the real match key.
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
    setRole(ROLES[0])
    setCapacityInput('')
  }

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const trimmedCapacity = capacityInput.trim()
    const capacityPercentOverride = trimmedCapacity === '' ? undefined : Number(trimmedCapacity)
    if (capacityPercentOverride !== undefined && Number.isNaN(capacityPercentOverride)) return

    setSubmitting(true)
    try {
      if (mode === 'existing') {
        if (!selectedPerson) return
        await onAddExisting(personId(selectedPerson), role, capacityPercentOverride)
      } else if (mode === 'jira') {
        if (!selectedJiraUser) return
        const name = newName.trim()
        const email = newEmail.trim()
        if (!name || !email) return
        await onAddNew({ name, email, jiraAccountId: selectedJiraUser.accountId }, role, capacityPercentOverride)
      } else {
        const name = newName.trim()
        const email = newEmail.trim()
        const jiraAccountId = newJiraAccountId.trim()
        if (!name || !email || !jiraAccountId) return
        await onAddNew({ name, email, jiraAccountId }, role, capacityPercentOverride)
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
      aria-label={`Add person to ${team.name}`}
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
              <p className="px-0.5 text-[10px] text-slate-400 dark:text-slate-500">Searching Jira...</p>
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

      <div className="flex items-center gap-1">
        <select
          value={role}
          onChange={(e) => setRole(e.target.value as Role)}
          aria-label="Role for new membership"
          className="rounded-lg border border-slate-200 bg-slate-50 px-1.5 py-1 text-xs text-slate-700 focus:border-fuchsia-400/60 focus:outline-none dark:border-white/10 dark:bg-white/5 dark:text-slate-200"
        >
          {ROLES.map((r) => (
            <option key={r} value={r}>
              {r}
            </option>
          ))}
        </select>
        <input
          type="number"
          value={capacityInput}
          onChange={(e) => setCapacityInput(e.target.value)}
          placeholder={String(ROLE_DEFAULT_CAPACITY_PERCENT[role])}
          aria-label="Capacity override for new membership"
          className="w-16 rounded-lg border border-slate-200 bg-slate-50 px-1.5 py-1 text-xs text-slate-700 placeholder:text-slate-400 focus:border-fuchsia-400/60 focus:outline-none dark:border-white/10 dark:bg-white/5 dark:text-slate-200 dark:placeholder:text-slate-500"
        />
        <button
          type="submit"
          disabled={!canSubmit || submitting}
          className="ml-auto shrink-0 rounded-lg bg-gradient-to-r from-violet-500 to-fuchsia-500 px-2.5 py-1 text-xs font-semibold text-white hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {submitting ? 'Adding...' : 'Add'}
        </button>
      </div>
    </form>
  )
}

// The per-team roster sub-view inside "Manage teams" (ticket 16's panel) -
// a self-contained accordion body: fetches its own data via useTeamRoster
// and owns its own remove-confirm dialog (no cascade-listing copy needed,
// unlike Team/Profile delete, so there's nothing for a parent to compute -
// see the ticket).
export function TeamRoster({ team }: TeamRosterProps) {
  const id = String(getId(team))
  const { memberships, people, loading, error, addExistingPerson, addNewPerson, updateMembership, removeMembership, searchJiraUsers } =
    useTeamRoster(id)
  const [pendingRemove, setPendingRemove] = useState<TeamMembership | null>(null)

  const existingPersonIds = new Set(memberships.map((m) => personId(m.personId)))

  return (
    <div aria-label={`Roster for ${team.name}`} className="flex flex-col gap-1.5 border-t border-slate-200 px-2 py-2 dark:border-white/10">
      {loading && <p className="px-2 text-xs text-slate-400 dark:text-slate-500">Loading roster...</p>}
      {error && <p className="px-2 text-xs text-red-500 dark:text-red-400">Error: {error}</p>}

      {!loading && memberships.length === 0 && (
        <p className="px-2 text-xs text-slate-400 dark:text-slate-500">No one on this team yet.</p>
      )}

      {memberships.map((m) => (
        <RosterRow
          key={membershipId(m)}
          membership={m}
          onUpdate={(mid, patch) => updateMembership(mid, patch)}
          onRemoveRequest={setPendingRemove}
        />
      ))}

      <AddPersonForm
        team={team}
        people={people}
        existingPersonIds={existingPersonIds}
        onAddExisting={addExistingPerson}
        onAddNew={addNewPerson}
        searchJiraUsers={searchJiraUsers}
      />

      {pendingRemove && (
        <ConfirmDialog
          message={`Remove ${pendingRemove.personId.name} from ${team.name}?`}
          confirmLabel="Remove"
          onCancel={() => setPendingRemove(null)}
          onConfirm={() => {
            const mid = membershipId(pendingRemove)
            setPendingRemove(null)
            removeMembership(mid)
          }}
        />
      )}
    </div>
  )
}
