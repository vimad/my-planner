// PROTOTYPE — throwaway. Three variants of the profile switcher's
// rename/delete interaction, switchable via `?variant=A|B|C` on the real
// dashboard route. Answers: "how do rename/delete live alongside the
// primary switch action without cluttering the tab row?" Mounted in place
// of <ProfileSwitcher> in App.tsx for the duration of this prototype only —
// see the wiring comment at the bottom of this file.
//
// Do not add tests for this file. Do not ship it — fold the winning variant
// into ProfileSwitcher.tsx properly, then delete this file and the App.tsx
// wiring, and push the full set of variants to a throwaway branch per the
// /prototype skill.
import { useEffect, useRef, useState, type FormEvent } from 'react'
import { getId } from '../utils/getId'
import type { Profile } from '../types'

export interface PrototypeProfileSwitcherProps {
  profiles: Profile[]
  activeProfileId: string | null
  onSelect: (id: string) => void
  onCreate: (name: string) => void | Promise<void>
  onRename: (id: string, name: string) => void | Promise<void>
  onDeleteRequest: (profile: Profile) => void
}

// Shared by all three variants: the inline "+ Profile" create affordance.
function CreateProfileControl({ onCreate }: { onCreate: (name: string) => void | Promise<void> }) {
  const [open, setOpen] = useState(false)
  const [name, setName] = useState('')

  function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const trimmed = name.trim()
    if (!trimmed) return
    onCreate(trimmed)
    setName('')
    setOpen(false)
  }

  if (open) {
    return (
      <form onSubmit={handleSubmit} className="flex items-center gap-1">
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="New profile name"
          autoFocus
          className="rounded-lg border border-slate-200 bg-slate-50 px-2 py-1 text-sm text-slate-900 placeholder:text-slate-400 focus:border-fuchsia-400/60 focus:outline-none dark:border-white/10 dark:bg-white/5 dark:text-slate-100 dark:placeholder:text-slate-500"
        />
        <button
          type="submit"
          className="rounded-lg bg-gradient-to-r from-violet-500 to-fuchsia-500 px-2.5 py-1 text-xs font-semibold text-white hover:opacity-90"
        >
          Add
        </button>
        <button
          type="button"
          onClick={() => {
            setOpen(false)
            setName('')
          }}
          className="rounded-lg border border-slate-200 px-2.5 py-1 text-xs text-slate-600 hover:bg-slate-100 dark:border-white/10 dark:text-slate-300 dark:hover:bg-white/5"
        >
          Cancel
        </button>
      </form>
    )
  }

  return (
    <button
      type="button"
      onClick={() => setOpen(true)}
      className="rounded-full border border-dashed border-slate-300 px-3 py-1.5 text-sm text-slate-500 hover:bg-white dark:border-white/20 dark:text-slate-300 dark:hover:bg-white/5"
    >
      + Profile
    </button>
  )
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

// ---------------------------------------------------------------------------
// Variant A — kebab menu, but only on the *active* tab. Inactive tabs are
// bare buttons; the one tab you're already looking at is also the one
// you're most likely to want to rename/delete, so only it earns the extra
// affordance.
// ---------------------------------------------------------------------------
function VariantA({ profiles, activeProfileId, onSelect, onCreate, onRename, onDeleteRequest }: PrototypeProfileSwitcherProps) {
  const [menuOpenFor, setMenuOpenFor] = useState<string | null>(null)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editName, setEditName] = useState('')
  const menuRef = useOutsideClick(() => setMenuOpenFor(null))
  const deleteDisabled = profiles.length <= 1

  function startEdit(profile: Profile) {
    setMenuOpenFor(null)
    setEditingId(String(getId(profile)))
    setEditName(profile.name)
  }

  function submitRename(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const trimmed = editName.trim()
    if (trimmed && editingId) onRename(editingId, trimmed)
    setEditingId(null)
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <div
        role="tablist"
        className="flex items-center gap-1 rounded-full border border-slate-200 bg-white p-1 dark:border-white/10 dark:bg-white/5"
      >
        {profiles.map((profile) => {
          const id = String(getId(profile))
          const active = id === activeProfileId

          if (editingId === id) {
            return (
              <form key={id} onSubmit={submitRename} className="flex items-center gap-1 px-1">
                <input
                  autoFocus
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  className="w-28 rounded-lg border border-slate-200 bg-slate-50 px-2 py-1 text-sm dark:border-white/10 dark:bg-white/5 dark:text-slate-100"
                />
                <button type="submit" className="rounded-lg bg-gradient-to-r from-violet-500 to-fuchsia-500 px-2 py-1 text-xs font-semibold text-white">
                  Save
                </button>
              </form>
            )
          }

          return (
            <div key={id} className="relative flex items-center">
              <button
                type="button"
                onClick={() => onSelect(id)}
                className={`rounded-full py-1.5 pl-3 text-sm font-semibold transition ${active ? 'pr-1.5' : 'pr-3'} ${
                  active
                    ? 'bg-gradient-to-r from-violet-500 to-fuchsia-500 text-white'
                    : 'text-slate-500 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-white/10'
                }`}
              >
                {profile.name}
              </button>
              {active && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation()
                    setMenuOpenFor(menuOpenFor === id ? null : id)
                  }}
                  aria-label={`${profile.name} options`}
                  className="mr-1 rounded-full px-1 py-1 text-xs text-white/80 hover:bg-white/20"
                >
                  ⋮
                </button>
              )}
              {menuOpenFor === id && (
                <div
                  ref={menuRef}
                  className="absolute right-0 top-9 z-10 w-32 rounded-xl border border-slate-200 bg-white p-1 shadow-lg dark:border-white/10 dark:bg-[#1a1626]"
                >
                  <button
                    type="button"
                    onClick={() => startEdit(profile)}
                    className="block w-full rounded-lg px-2 py-1.5 text-left text-sm text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-white/10"
                  >
                    Rename
                  </button>
                  <button
                    type="button"
                    disabled={deleteDisabled}
                    onClick={() => {
                      setMenuOpenFor(null)
                      onDeleteRequest(profile)
                    }}
                    title={deleteDisabled ? 'At least one profile must always exist' : undefined}
                    className="block w-full rounded-lg px-2 py-1.5 text-left text-sm text-red-500 hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent dark:hover:bg-red-500/10"
                  >
                    Delete
                  </button>
                </div>
              )}
            </div>
          )
        })}
      </div>
      <CreateProfileControl onCreate={onCreate} />
    </div>
  )
}

// ---------------------------------------------------------------------------
// Variant B — switching and managing are two different modes entirely. The
// tab row is 100% clean (just pills + create). A separate "Manage" trigger
// drops down a distinct settings-list panel where rename/delete live.
// ---------------------------------------------------------------------------
function VariantB({ profiles, activeProfileId, onSelect, onCreate, onRename, onDeleteRequest }: PrototypeProfileSwitcherProps) {
  const [managing, setManaging] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editName, setEditName] = useState('')
  const panelRef = useOutsideClick(() => setManaging(false))
  const deleteDisabled = profiles.length <= 1

  function startEdit(profile: Profile) {
    setEditingId(String(getId(profile)))
    setEditName(profile.name)
  }

  function submitRename(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const trimmed = editName.trim()
    if (trimmed && editingId) onRename(editingId, trimmed)
    setEditingId(null)
  }

  return (
    <div className="relative flex flex-wrap items-center gap-2">
      <div
        role="tablist"
        className="flex items-center gap-1 rounded-full border border-slate-200 bg-white p-1 dark:border-white/10 dark:bg-white/5"
      >
        {profiles.map((profile) => {
          const id = String(getId(profile))
          const active = id === activeProfileId
          return (
            <button
              key={id}
              type="button"
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
      <CreateProfileControl onCreate={onCreate} />
      <button
        type="button"
        onClick={() => setManaging((m) => !m)}
        aria-label="Manage profiles"
        className="rounded-full border border-slate-200 p-1.5 text-slate-500 hover:bg-slate-100 dark:border-white/10 dark:text-slate-300 dark:hover:bg-white/10"
      >
        ⚙
      </button>

      {managing && (
        <div
          ref={panelRef}
          className="absolute right-0 top-11 z-10 w-64 rounded-2xl border border-slate-200 bg-white p-2 shadow-xl dark:border-white/10 dark:bg-[#1a1626]"
        >
          <p className="mb-1 px-2 pt-1 text-xs font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">
            Manage profiles
          </p>
          {profiles.map((profile) => {
            const id = String(getId(profile))
            return (
              <div key={id} className="flex items-center justify-between gap-2 rounded-xl px-2 py-1.5 hover:bg-slate-50 dark:hover:bg-white/5">
                {editingId === id ? (
                  <form onSubmit={submitRename} className="flex flex-1 items-center gap-1">
                    <input
                      autoFocus
                      value={editName}
                      onChange={(e) => setEditName(e.target.value)}
                      className="w-full min-w-0 rounded-lg border border-slate-200 bg-slate-50 px-2 py-1 text-sm dark:border-white/10 dark:bg-white/5 dark:text-slate-100"
                    />
                    <button type="submit" className="shrink-0 rounded-lg bg-gradient-to-r from-violet-500 to-fuchsia-500 px-2 py-1 text-xs font-semibold text-white">
                      Save
                    </button>
                  </form>
                ) : (
                  <>
                    <span className="text-sm text-slate-700 dark:text-slate-200">{profile.name}</span>
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => startEdit(profile)}
                        aria-label={`Rename ${profile.name}`}
                        className="rounded-lg px-1.5 py-1 text-xs text-slate-400 hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-white/10"
                      >
                        ✎
                      </button>
                      <button
                        type="button"
                        disabled={deleteDisabled}
                        onClick={() => onDeleteRequest(profile)}
                        title={deleteDisabled ? 'At least one profile must always exist' : undefined}
                        aria-label={`Delete ${profile.name}`}
                        className="rounded-lg px-1.5 py-1 text-xs text-red-400 hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-30 disabled:hover:bg-transparent dark:hover:bg-red-500/10"
                      >
                        🗑
                      </button>
                    </div>
                  </>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Variant C — hover-reveal. At rest every tab is bare. Hovering (or
// focusing, for keyboard/touch) a tab fades in a small overflow trigger at
// its trailing edge; clicking it opens the same rename/delete dropdown.
// Nothing is visible until you go looking for it.
// ---------------------------------------------------------------------------
function VariantC({ profiles, activeProfileId, onSelect, onCreate, onRename, onDeleteRequest }: PrototypeProfileSwitcherProps) {
  const [hoveredId, setHoveredId] = useState<string | null>(null)
  const [menuOpenFor, setMenuOpenFor] = useState<string | null>(null)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editName, setEditName] = useState('')
  const menuRef = useOutsideClick(() => setMenuOpenFor(null))
  const deleteDisabled = profiles.length <= 1

  function startEdit(profile: Profile) {
    setMenuOpenFor(null)
    setEditingId(String(getId(profile)))
    setEditName(profile.name)
  }

  function submitRename(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const trimmed = editName.trim()
    if (trimmed && editingId) onRename(editingId, trimmed)
    setEditingId(null)
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <div
        role="tablist"
        className="flex items-center gap-1 rounded-full border border-slate-200 bg-white p-1 dark:border-white/10 dark:bg-white/5"
      >
        {profiles.map((profile) => {
          const id = String(getId(profile))
          const active = id === activeProfileId
          const showTrigger = hoveredId === id || menuOpenFor === id

          if (editingId === id) {
            return (
              <form key={id} onSubmit={submitRename} className="flex items-center gap-1 px-1">
                <input
                  autoFocus
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  className="w-28 rounded-lg border border-slate-200 bg-slate-50 px-2 py-1 text-sm dark:border-white/10 dark:bg-white/5 dark:text-slate-100"
                />
                <button type="submit" className="rounded-lg bg-gradient-to-r from-violet-500 to-fuchsia-500 px-2 py-1 text-xs font-semibold text-white">
                  Save
                </button>
              </form>
            )
          }

          return (
            <div
              key={id}
              className="relative"
              onMouseEnter={() => setHoveredId(id)}
              onMouseLeave={() => setHoveredId((h) => (h === id ? null : h))}
            >
              <button
                type="button"
                onClick={() => onSelect(id)}
                className={`rounded-full py-1.5 pl-3 text-sm font-semibold transition ${showTrigger ? 'pr-6' : 'pr-3'} ${
                  active
                    ? 'bg-gradient-to-r from-violet-500 to-fuchsia-500 text-white'
                    : 'text-slate-500 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-white/10'
                }`}
              >
                {profile.name}
              </button>
              {showTrigger && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation()
                    setMenuOpenFor(menuOpenFor === id ? null : id)
                  }}
                  aria-label={`${profile.name} options`}
                  className={`absolute right-1 top-1/2 -translate-y-1/2 rounded-full px-1 text-xs ${
                    active ? 'text-white/80 hover:bg-white/20' : 'text-slate-400 hover:bg-slate-200 dark:hover:bg-white/10'
                  }`}
                >
                  ⋮
                </button>
              )}
              {menuOpenFor === id && (
                <div
                  ref={menuRef}
                  className="absolute right-0 top-9 z-10 w-32 rounded-xl border border-slate-200 bg-white p-1 shadow-lg dark:border-white/10 dark:bg-[#1a1626]"
                >
                  <button
                    type="button"
                    onClick={() => startEdit(profile)}
                    className="block w-full rounded-lg px-2 py-1.5 text-left text-sm text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-white/10"
                  >
                    Rename
                  </button>
                  <button
                    type="button"
                    disabled={deleteDisabled}
                    onClick={() => {
                      setMenuOpenFor(null)
                      onDeleteRequest(profile)
                    }}
                    title={deleteDisabled ? 'At least one profile must always exist' : undefined}
                    className="block w-full rounded-lg px-2 py-1.5 text-left text-sm text-red-500 hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent dark:hover:bg-red-500/10"
                  >
                    Delete
                  </button>
                </div>
              )}
            </div>
          )
        })}
      </div>
      <CreateProfileControl onCreate={onCreate} />
    </div>
  )
}

const VARIANTS = {
  A: { component: VariantA, label: 'Kebab on active tab only' },
  B: { component: VariantB, label: 'Separate manage-mode panel' },
  C: { component: VariantC, label: 'Hover-reveal overflow per tab' },
} as const
type VariantKey = keyof typeof VARIANTS
const VARIANT_KEYS = Object.keys(VARIANTS) as VariantKey[]

function readVariant(): VariantKey {
  const v = new URLSearchParams(window.location.search).get('variant')
  return v && v in VARIANTS ? (v as VariantKey) : 'A'
}

function PrototypeSwitcherBar({ current, onChange }: { current: VariantKey; onChange: (v: VariantKey) => void }) {
  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      const tag = (e.target as HTMLElement)?.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA' || (e.target as HTMLElement)?.isContentEditable) return
      const idx = VARIANT_KEYS.indexOf(current)
      if (e.key === 'ArrowLeft') onChange(VARIANT_KEYS[(idx - 1 + VARIANT_KEYS.length) % VARIANT_KEYS.length])
      if (e.key === 'ArrowRight') onChange(VARIANT_KEYS[(idx + 1) % VARIANT_KEYS.length])
    }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [current, onChange])

  const idx = VARIANT_KEYS.indexOf(current)

  return (
    <div className="fixed bottom-4 left-1/2 z-50 flex -translate-x-1/2 items-center gap-3 rounded-full border-2 border-yellow-400 bg-black/90 px-4 py-2 text-sm text-white shadow-2xl">
      <button onClick={() => onChange(VARIANT_KEYS[(idx - 1 + VARIANT_KEYS.length) % VARIANT_KEYS.length])} className="px-1 text-lg">
        ←
      </button>
      <span className="font-mono">
        {current} — {VARIANTS[current].label}
      </span>
      <button onClick={() => onChange(VARIANT_KEYS[(idx + 1) % VARIANT_KEYS.length])} className="px-1 text-lg">
        →
      </button>
    </div>
  )
}

export function ProfileSwitcherPrototype(props: PrototypeProfileSwitcherProps) {
  const [variant, setVariant] = useState<VariantKey>(readVariant)

  function change(v: VariantKey) {
    setVariant(v)
    const url = new URL(window.location.href)
    url.searchParams.set('variant', v)
    window.history.replaceState(null, '', url)
  }

  const Variant = VARIANTS[variant].component

  return (
    <>
      <Variant {...props} />
      {import.meta.env.DEV && <PrototypeSwitcherBar current={variant} onChange={change} />}
    </>
  )
}
