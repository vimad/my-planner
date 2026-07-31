import { useState, type FormEvent } from 'react'
import { getId } from '../utils/getId'
import type { Profile } from '../types'

interface ProfileSwitcherProps {
  profiles: Profile[]
  activeProfileId: string | null
  onSelect: (id: string) => void
  onCreate: (name: string) => void | Promise<void>
}

// The dashboard header's profile switcher: a tab-like control (per the
// spec's "same visual tier as the app's top-level chrome" note) listing
// every profile plus an inline "create a new profile" affordance. Renaming
// and deleting are ticket 03's job - this only selects and creates.
export function ProfileSwitcher({ profiles, activeProfileId, onSelect, onCreate }: ProfileSwitcherProps) {
  const [showCreateForm, setShowCreateForm] = useState(false)
  const [name, setName] = useState('')

  function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const trimmed = name.trim()
    if (!trimmed) return
    onCreate(trimmed)
    setName('')
    setShowCreateForm(false)
  }

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
    </div>
  )
}
