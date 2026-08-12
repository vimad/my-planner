type Workspace = 'planner' | 'sprint'

interface WorkspaceSwitcherProps {
  current: Workspace
  onNavigate: (target: Workspace) => void
}

const WORKSPACES: readonly { key: Workspace; label: string }[] = [
  { key: 'planner', label: 'Planner' },
  { key: 'sprint', label: 'Sprint' },
]

// The one control for moving between the Planner and Sprint shells (they
// never render together - see App.tsx's route split). Deliberately the
// only affordance for that move on either side: the wordmark is plain text
// in both Header instances, not a "back" button, so there's a single place
// a reader learns to look for the workspace switch. Styled as the same
// segmented tab toggle as the Todos/Notes/Boards and Planning/Status rows,
// and rendered by Header next to the title so it reads as "which app" right
// beside "My Planner"/"Sprint", rather than living in the far right cluster
// with the profile/theme controls.
export function WorkspaceSwitcher({ current, onNavigate }: WorkspaceSwitcherProps) {
  return (
    <div
      role="tablist"
      aria-label="Workspace"
      className="flex items-center gap-1 rounded-full border border-slate-200 bg-white p-1 dark:border-white/10 dark:bg-white/5"
    >
      {WORKSPACES.map((workspace) => (
        <button
          key={workspace.key}
          type="button"
          role="tab"
          aria-selected={current === workspace.key}
          onClick={() => workspace.key !== current && onNavigate(workspace.key)}
          className={`rounded-full px-3 py-1.5 text-sm font-semibold transition ${
            current === workspace.key
              ? 'bg-gradient-to-r from-violet-500 to-fuchsia-500 text-white'
              : 'text-slate-500 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-white/10'
          }`}
        >
          {workspace.label}
        </button>
      ))}
    </div>
  )
}
