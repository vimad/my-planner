import type { AssigneeInfo } from '../utils/atlasAssignee'

// Same violet/fuchsia/blue/emerald/cyan/indigo family already used for
// accents elsewhere (docs/ui-conventions.md) - avoids red/rose (reserved for
// destructive/at-risk) and amber (reserved for the Unmapped badge below).
const AVATAR_PALETTE = ['bg-violet-500', 'bg-fuchsia-500', 'bg-blue-500', 'bg-emerald-500', 'bg-cyan-500', 'bg-indigo-500']

function hashColor(key: string): string {
  let hash = 0
  for (let i = 0; i < key.length; i++) hash = (hash * 31 + key.charCodeAt(i)) | 0
  return AVATAR_PALETTE[Math.abs(hash) % AVATAR_PALETTE.length]
}

function initials(label: string): string {
  const parts = label.trim().split(/\s+/)
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
}

// A small colored initials bubble for an AssigneeInfo (utils/
// atlasAssignee.ts) - color is a stable hash of the assignee's key, so the
// same person always renders the same color across the board without
// needing a stored color field. Unmapped/unassigned get their own fixed,
// non-hashed treatment instead, since there's no name to color-code.
export function AssigneeAvatar({ assignee, size = 22 }: { assignee: AssigneeInfo; size?: number }) {
  const style = { width: size, height: size, fontSize: Math.max(9, size * 0.4) }
  if (assignee.kind === 'named') {
    return (
      <span
        style={style}
        className={`flex shrink-0 items-center justify-center rounded-full font-semibold text-white ${hashColor(assignee.key)}`}
        title={assignee.label}
      >
        {initials(assignee.label)}
      </span>
    )
  }
  if (assignee.kind === 'unmapped') {
    // Same amber family as PlanningView's off-roster "Unmapped" badge - a
    // real Jira assignee just not entered as a Person here.
    return (
      <span
        style={style}
        className="flex shrink-0 items-center justify-center rounded-full border border-amber-300 bg-amber-100 font-semibold text-amber-700 dark:border-amber-500/30 dark:bg-amber-500/20 dark:text-amber-300"
        title={`${assignee.label} - real Jira assignee, not in the People directory`}
      >
        ?
      </span>
    )
  }
  return (
    <span
      style={style}
      className="flex shrink-0 items-center justify-center rounded-full border border-dashed border-slate-300 text-slate-400 dark:border-white/20 dark:text-slate-500"
      title="Unassigned"
    >
      –
    </span>
  )
}
