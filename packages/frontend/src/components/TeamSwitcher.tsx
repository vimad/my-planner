import { useEffect, useRef, useState, type FormEvent } from 'react'
import { getId } from '../utils/getId'
import type { Team } from '../types'
import { TeamRoster } from './TeamRoster'

interface TeamSwitcherProps {
  teams: Team[]
  activeTeamId: string | null
  onSelect: (id: string) => void
  onCreate: (name: string, jiraLabels: string[]) => void | Promise<void>
  onRename: (id: string, name: string) => void | Promise<void>
  onUpdateJiraLabels: (id: string, jiraLabels: string[]) => void | Promise<void>
  // Mirrors ProfileSwitcher's onDeleteRequest - the switcher only requests a
  // delete, the caller (SprintShell) owns the confirm dialog.
  onDeleteRequest: (team: Team) => void
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

// Visually mirrors ProfileSwitcher.tsx's tab row, but unlike that component
// bundles create/rename/delete/jiraLabels-edit all into the one "Manage
// teams" panel rather than splitting create out into an inline "+" button -
// see .scratch/sprint-jira-integration/spec.md's "Team creation & label
// config" (there's no "at least one team must exist" guard on the backend
// either, unlike profiles, so delete is never disabled here).
export function TeamSwitcher({
  teams,
  activeTeamId,
  onSelect,
  onCreate,
  onRename,
  onUpdateJiraLabels,
  onDeleteRequest,
}: TeamSwitcherProps) {
  const [managing, setManaging] = useState(false)
  const [newName, setNewName] = useState('')
  const [newLabel, setNewLabel] = useState('')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editName, setEditName] = useState('')
  const [rosterTeamId, setRosterTeamId] = useState<string | null>(null)
  const panelRef = useOutsideClick(() => setManaging(false))

  function handleCreateSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const trimmedName = newName.trim()
    const trimmedLabel = newLabel.trim()
    if (!trimmedName || !trimmedLabel) return
    onCreate(trimmedName, [trimmedLabel])
    setNewName('')
    setNewLabel('')
  }

  function startEdit(team: Team) {
    setEditingId(String(getId(team)))
    setEditName(team.name)
  }

  function cancelEdit() {
    setEditingId(null)
    setEditName('')
  }

  function handleRenameSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const trimmed = editName.trim()
    if (!trimmed || !editingId) return
    onRename(editingId, trimmed)
    cancelEdit()
  }

  function handleLabelBlur(team: Team, value: string) {
    const trimmed = value.trim()
    const current = team.jiraLabels[0] ?? ''
    if (trimmed && trimmed !== current) onUpdateJiraLabels(String(getId(team)), [trimmed])
  }

  return (
    <div aria-label="Team switcher" className="relative flex flex-wrap items-center gap-2">
      <div
        role="tablist"
        aria-label="Teams"
        className="flex items-center gap-1 rounded-full border border-slate-200 bg-white p-1 dark:border-white/10 dark:bg-white/5"
      >
        {teams.map((team) => {
          const id = String(getId(team))
          const active = id === activeTeamId

          return (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => onSelect(id)}
              className={`rounded-full px-3 py-1.5 text-sm font-semibold transition ${
                active
                  ? 'bg-gradient-to-r from-violet-500 to-fuchsia-500 text-white'
                  : 'text-slate-500 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-white/10'
              }`}
            >
              {team.name}
            </button>
          )
        })}
      </div>

      <button
        type="button"
        onClick={() => setManaging((m) => !m)}
        aria-label="Manage teams"
        aria-expanded={managing}
        className="rounded-full border border-slate-200 p-1.5 text-slate-500 hover:bg-slate-100 dark:border-white/10 dark:text-slate-300 dark:hover:bg-white/10"
      >
        ⚙
      </button>

      {managing && (
        <div
          ref={panelRef}
          aria-label="Manage teams panel"
          className={`absolute right-0 top-11 z-10 max-h-[80vh] overflow-y-auto rounded-2xl border border-slate-200 bg-white p-2 shadow-xl dark:border-white/10 dark:bg-[#1a1626] ${
            rosterTeamId ? 'w-96' : 'w-72'
          }`}
        >
          <p className="mb-1 px-2 pt-1 text-xs font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">
            Manage teams
          </p>

          <form onSubmit={handleCreateSubmit} className="flex flex-col gap-1 rounded-xl px-2 py-1.5">
            <input
              type="text"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="New team name"
              aria-label="New team name"
              className="w-full rounded-lg border border-slate-200 bg-slate-50 px-2 py-1 text-sm text-slate-900 placeholder:text-slate-400 focus:border-fuchsia-400/60 focus:outline-none dark:border-white/10 dark:bg-white/5 dark:text-slate-100 dark:placeholder:text-slate-500"
            />
            <div className="flex items-center gap-1">
              <input
                type="text"
                value={newLabel}
                onChange={(e) => setNewLabel(e.target.value)}
                placeholder="Jira label"
                aria-label="New team Jira label"
                className="w-full min-w-0 rounded-lg border border-slate-200 bg-slate-50 px-2 py-1 text-sm text-slate-900 placeholder:text-slate-400 focus:border-fuchsia-400/60 focus:outline-none dark:border-white/10 dark:bg-white/5 dark:text-slate-100 dark:placeholder:text-slate-500"
              />
              <button
                type="submit"
                className="shrink-0 rounded-lg bg-gradient-to-r from-violet-500 to-fuchsia-500 px-2.5 py-1 text-xs font-semibold text-white hover:opacity-90"
              >
                Add team
              </button>
            </div>
          </form>

          {teams.map((team) => {
            const id = String(getId(team))

            if (editingId === id) {
              return (
                <form
                  key={id}
                  onSubmit={handleRenameSubmit}
                  className="flex items-center gap-1 rounded-xl px-2 py-1.5"
                >
                  <input
                    type="text"
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    aria-label="Team name"
                    autoFocus
                    className="w-full min-w-0 rounded-lg border border-slate-200 bg-slate-50 px-2 py-1 text-sm text-slate-900 focus:border-fuchsia-400/60 focus:outline-none dark:border-white/10 dark:bg-white/5 dark:text-slate-100"
                  />
                  <button
                    type="submit"
                    className="shrink-0 rounded-lg bg-gradient-to-r from-violet-500 to-fuchsia-500 px-2 py-1 text-xs font-semibold text-white hover:opacity-90"
                  >
                    Save
                  </button>
                  <button
                    type="button"
                    onClick={cancelEdit}
                    className="shrink-0 rounded-lg border border-slate-200 px-2 py-1 text-xs text-slate-600 hover:bg-slate-100 dark:border-white/10 dark:text-slate-300 dark:hover:bg-white/5"
                  >
                    Cancel
                  </button>
                </form>
              )
            }

            const rosterOpen = rosterTeamId === id

            return (
              <div key={id}>
                <div className="flex items-center justify-between gap-2 rounded-xl px-2 py-1.5 hover:bg-slate-50 dark:hover:bg-white/5">
                  <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                    <span className="truncate text-sm text-slate-700 dark:text-slate-200">{team.name}</span>
                    <input
                      type="text"
                      defaultValue={team.jiraLabels[0] ?? ''}
                      onBlur={(e) => handleLabelBlur(team, e.target.value)}
                      aria-label={`Jira label for ${team.name}`}
                      className="w-full rounded-md border border-slate-200 bg-slate-50 px-1.5 py-0.5 text-xs text-slate-600 focus:border-fuchsia-400/60 focus:outline-none dark:border-white/10 dark:bg-white/5 dark:text-slate-300"
                    />
                  </div>
                  <div className="flex shrink-0 items-center gap-1">
                    <button
                      type="button"
                      onClick={() => setRosterTeamId(rosterOpen ? null : id)}
                      aria-label={`${rosterOpen ? 'Hide' : 'Manage'} roster for ${team.name}`}
                      aria-expanded={rosterOpen}
                      className={`rounded-lg px-1.5 py-1 text-xs hover:bg-slate-100 dark:hover:bg-white/10 ${
                        rosterOpen ? 'text-fuchsia-600 dark:text-fuchsia-300' : 'text-slate-400 dark:text-slate-400'
                      }`}
                    >
                      👥
                    </button>
                    <button
                      type="button"
                      onClick={() => startEdit(team)}
                      aria-label={`Rename ${team.name}`}
                      className="rounded-lg px-1.5 py-1 text-xs text-slate-400 hover:bg-slate-100 hover:text-slate-600 dark:text-slate-400 dark:hover:bg-white/10 dark:hover:text-slate-200"
                    >
                      ✎
                    </button>
                    <button
                      type="button"
                      onClick={() => onDeleteRequest(team)}
                      aria-label={`Delete ${team.name}`}
                      className="rounded-lg px-1.5 py-1 text-xs text-red-400 hover:bg-red-50 dark:hover:bg-red-500/10"
                    >
                      🗑
                    </button>
                  </div>
                </div>
                {rosterOpen && <TeamRoster team={team} />}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
