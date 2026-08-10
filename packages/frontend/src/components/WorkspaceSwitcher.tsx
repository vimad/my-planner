import { useEffect, useRef, useState } from 'react'

type Workspace = 'planner' | 'sprint'

interface WorkspaceSwitcherProps {
  current: Workspace
  onNavigate: (target: Workspace) => void
}

const WORKSPACES: readonly { key: Workspace; label: string }[] = [
  { key: 'planner', label: 'Planner' },
  { key: 'sprint', label: 'Sprint' },
]

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

// The one control for moving between the Planner and Sprint shells (they
// never render together - see App.tsx's route split). Deliberately the
// only affordance for that move on either side: the wordmark is plain text
// in both Header instances, not a "back" button, so there's a single place
// a reader learns to look for the workspace switch. Chosen over a plain
// icon-button or a top-level mode strip via a /prototype comparison - see
// branch `prototype/sprint-nav-variants` for the full set and why this one
// won.
export function WorkspaceSwitcher({ current, onNavigate }: WorkspaceSwitcherProps) {
  const [open, setOpen] = useState(false)
  const ref = useOutsideClick(() => setOpen(false))
  const currentLabel = WORKSPACES.find((w) => w.key === current)!.label

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-label="Switch workspace"
        aria-expanded={open}
        className="inline-flex h-9 items-center gap-1.5 rounded-full border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-500 shadow-sm transition hover:bg-slate-50 dark:border-white/10 dark:bg-white/5 dark:text-slate-300 dark:shadow-none dark:hover:bg-white/10"
      >
        {currentLabel}
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-3.5 w-3.5">
          <path strokeLinecap="round" strokeLinejoin="round" d="m6 9 6 6 6-6" />
        </svg>
      </button>
      {/* z-20: Header doesn't establish its own stacking context, so a plain
          z-10 here loses the paint order to the Categories/sub-nav row right
          below it (also z-10, but later in the DOM) - same fix CategoryChip's
          own menu uses for the identical conflict. */}
      {open && (
        <div className="absolute right-0 top-11 z-20 w-40 rounded-2xl border border-slate-200 bg-white p-1.5 shadow-xl dark:border-white/10 dark:bg-[#1a1626]">
          {WORKSPACES.map((workspace) =>
            workspace.key === current ? (
              <div
                key={workspace.key}
                className="rounded-xl px-2.5 py-1.5 text-sm font-semibold text-slate-400 dark:text-slate-500"
              >
                {workspace.label} ✓
              </div>
            ) : (
              <button
                key={workspace.key}
                type="button"
                onClick={() => {
                  setOpen(false)
                  onNavigate(workspace.key)
                }}
                className="w-full rounded-xl px-2.5 py-1.5 text-left text-sm text-slate-700 hover:bg-slate-50 dark:text-slate-200 dark:hover:bg-white/5"
              >
                {workspace.label} →
              </button>
            ),
          )}
        </div>
      )}
    </div>
  )
}
