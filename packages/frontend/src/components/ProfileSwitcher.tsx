import { useState, type FormEvent } from 'react'
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

// The dashboard header's profile switcher: a tab-like control (per the
// spec's "same visual tier as the app's top-level chrome" note) listing
// every profile, each with an inline rename affordance and a delete
// affordance (disabled - with an explanatory title - when it's the only
// remaining profile, mirroring the backend's last-profile guard), plus an
// inline "create a new profile" form.
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
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editName, setEditName] = useState('')

  function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const trimmed = name.trim()
    if (!trimmed) return
    onCreate(trimmed)
    setName('')
    setShowCreateForm(false)
  }

  // Only one of "create" and "rename" is ever open at a time - opening one
  // closes the other - so their forms never collide (e.g. both rendering a
  // "Cancel" button at once).
  function startCreate() {
    setEditingId(null)
    setShowCreateForm(true)
  }

  function startEdit(profile: Profile) {
    setShowCreateForm(false)
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
    <div aria-label="Profile switcher" className="flex flex-wrap items-center gap-2">
      <div
        role="tablist"
        aria-label="Profiles"
        className="flex items-center gap-1 rounded-full border border-slate-200 bg-white p-1 dark:border-white/10 dark:bg-white/5"
      >
        {profiles.map((profile) => {
          const id = String(getId(profile))
          const active = id === activeProfileId

          if (editingId === id) {
            return (
              <form key={id} onSubmit={handleRenameSubmit} className="flex items-center gap-1 px-1">
                <input
                  type="text"
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  aria-label="Profile name"
                  autoFocus
                  className="rounded-lg border border-slate-200 bg-slate-50 px-2 py-1 text-sm text-slate-900 placeholder:text-slate-400 focus:border-fuchsia-400/60 focus:outline-none dark:border-white/10 dark:bg-white/5 dark:text-slate-100"
                />
                <button
                  type="submit"
                  className="rounded-lg bg-gradient-to-r from-violet-500 to-fuchsia-500 px-2 py-1 text-xs font-semibold text-white hover:opacity-90"
                >
                  Save
                </button>
                <button
                  type="button"
                  onClick={cancelEdit}
                  className="rounded-lg border border-slate-200 px-2 py-1 text-xs text-slate-600 hover:bg-slate-100 dark:border-white/10 dark:text-slate-300 dark:hover:bg-white/5"
                >
                  Cancel
                </button>
              </form>
            )
          }

          return (
            <div key={id} className="flex items-center">
              <button
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
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation()
                  startEdit(profile)
                }}
                aria-label={`Edit ${profile.name}`}
                className="rounded-full px-1.5 py-0.5 text-xs text-slate-400 hover:bg-slate-100 hover:text-slate-600 dark:text-slate-400 dark:hover:bg-white/10 dark:hover:text-slate-200"
              >
                Edit
              </button>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation()
                  onDeleteRequest(profile)
                }}
                disabled={deleteDisabled}
                aria-label={`Delete ${profile.name}`}
                title={deleteDisabled ? 'At least one profile must always exist' : undefined}
                className="rounded-full px-1.5 py-0.5 text-xs text-slate-400 hover:bg-slate-100 hover:text-slate-600 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent dark:text-slate-400 dark:hover:bg-white/10 dark:hover:text-slate-200"
              >
                Delete
              </button>
            </div>
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
          onClick={startCreate}
          aria-label="Create new profile"
          className="rounded-full border border-dashed border-slate-300 px-3 py-1.5 text-sm text-slate-500 hover:bg-white dark:border-white/20 dark:text-slate-300 dark:hover:bg-white/5"
        >
          + Profile
        </button>
      )}
    </div>
  )
}
