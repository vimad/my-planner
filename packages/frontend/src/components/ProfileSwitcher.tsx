import { useEffect, useRef, useState, type FormEvent } from 'react'
import { getId } from '../utils/getId'
import type { Profile } from '../types'

interface ProfileSwitcherProps {
  profiles: Profile[]
  activeProfileId: string | null
  onSelect: (id: string) => void
  onCreate: (name: string) => void | Promise<void>
  onRename: (id: string, name: string) => void | Promise<void>
  // The switcher only *requests* a delete - it has no way to know how many
  // categories/todos/notes ride along with the cascade (that requires a
  // fetch the switcher itself has no business making), so the caller owns
  // building the confirmation message and actually deleting. See App.tsx's
  // handleDeleteProfileRequest.
  onDeleteRequest: (profile: Profile) => void
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

// The dashboard header's profile switcher. Switching (the frequent action)
// is a plain, uncluttered tab row - rename/delete (rare, and delete is
// destructive) live behind a separate "Manage profiles" panel instead of
// sitting on the tabs themselves, per a /prototype comparison against two
// on-tab alternatives (kebab-on-active-tab, hover-reveal-per-tab) - see
// branch `prototype/profile-switcher-variants` for the full set and why
// this one won.
export function ProfileSwitcher({
  profiles,
  activeProfileId,
  onSelect,
  onCreate,
  onRename,
  onDeleteRequest,
}: ProfileSwitcherProps) {
  const [showCreateForm, setShowCreateForm] = useState(false)
  const [name, setName] = useState('')
  const [managing, setManaging] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editName, setEditName] = useState('')
  const panelRef = useOutsideClick(() => setManaging(false))

  function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const trimmed = name.trim()
    if (!trimmed) return
    onCreate(trimmed)
    setName('')
    setShowCreateForm(false)
  }

  function startEdit(profile: Profile) {
    setEditingId(String(getId(profile)))
    setEditName(profile.name)
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

  // Mirrors the backend's "the last remaining profile cannot be deleted"
  // guard (routes/profiles.ts) - surfaced here so the user never gets to
  // attempt a delete that's guaranteed to 400.
  const deleteDisabled = profiles.length <= 1

  return (
    <div aria-label="Profile switcher" className="relative flex flex-wrap items-center gap-2">
      <div
        role="tablist"
        aria-label="Profiles"
        className="flex items-center gap-1 rounded-full border border-slate-200 bg-white p-1 dark:border-white/10 dark:bg-white/5"
      >
        {profiles.map((profile) => {
          const id = String(getId(profile))
          const active = id === activeProfileId

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
              {profile.name}
            </button>
          )
        })}
      </div>

      {showCreateForm ? (
        <form onSubmit={handleSubmit} className="flex items-center gap-1">
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="New profile name"
            aria-label="New profile name"
            autoFocus
            className="rounded-lg border border-slate-200 bg-slate-50 px-2 py-1 text-sm text-slate-900 placeholder:text-slate-400 focus:border-fuchsia-400/60 focus:outline-none dark:border-white/10 dark:bg-white/5 dark:text-slate-100 dark:placeholder:text-slate-500"
          />
          <button
            type="submit"
            className="rounded-lg bg-gradient-to-r from-violet-500 to-fuchsia-500 px-2.5 py-1 text-xs font-semibold text-white hover:opacity-90"
          >
            Add profile
          </button>
          <button
            type="button"
            onClick={() => {
              setShowCreateForm(false)
              setName('')
            }}
            className="rounded-lg border border-slate-200 px-2.5 py-1 text-xs text-slate-600 hover:bg-slate-100 dark:border-white/10 dark:text-slate-300 dark:hover:bg-white/5"
          >
            Cancel
          </button>
        </form>
      ) : (
        <button
          type="button"
          onClick={() => setShowCreateForm(true)}
          aria-label="Create new profile"
          className="rounded-full border border-dashed border-slate-300 px-3 py-1.5 text-sm text-slate-500 hover:bg-white dark:border-white/20 dark:text-slate-300 dark:hover:bg-white/5"
        >
          + Profile
        </button>
      )}

      <button
        type="button"
        onClick={() => setManaging((m) => !m)}
        aria-label="Manage profiles"
        aria-expanded={managing}
        className="rounded-full border border-slate-200 p-1.5 text-slate-500 hover:bg-slate-100 dark:border-white/10 dark:text-slate-300 dark:hover:bg-white/10"
      >
        ⚙
      </button>

      {managing && (
        <div
          ref={panelRef}
          aria-label="Manage profiles panel"
          className="absolute right-0 top-11 z-10 w-64 rounded-2xl border border-slate-200 bg-white p-2 shadow-xl dark:border-white/10 dark:bg-[#1a1626]"
        >
          <p className="mb-1 px-2 pt-1 text-xs font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">
            Manage profiles
          </p>
          {profiles.map((profile) => {
            const id = String(getId(profile))

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
                    aria-label="Profile name"
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

            return (
              <div
                key={id}
                className="flex items-center justify-between gap-2 rounded-xl px-2 py-1.5 hover:bg-slate-50 dark:hover:bg-white/5"
              >
                <span className="truncate text-sm text-slate-700 dark:text-slate-200">{profile.name}</span>
                <div className="flex shrink-0 items-center gap-1">
                  <button
                    type="button"
                    onClick={() => startEdit(profile)}
                    aria-label={`Rename ${profile.name}`}
                    className="rounded-lg px-1.5 py-1 text-xs text-slate-400 hover:bg-slate-100 hover:text-slate-600 dark:text-slate-400 dark:hover:bg-white/10 dark:hover:text-slate-200"
                  >
                    ✎
                  </button>
                  <button
                    type="button"
                    onClick={() => onDeleteRequest(profile)}
                    disabled={deleteDisabled}
                    aria-label={`Delete ${profile.name}`}
                    title={deleteDisabled ? 'At least one profile must always exist' : undefined}
                    className="rounded-lg px-1.5 py-1 text-xs text-red-400 hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-30 disabled:hover:bg-transparent dark:hover:bg-red-500/10"
                  >
                    🗑
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
