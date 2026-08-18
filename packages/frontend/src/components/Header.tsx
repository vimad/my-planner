import type { ReactNode } from 'react'
import type { Theme } from '../utils/theme'
import { ThemeToggle } from './ThemeToggle'

interface HeaderProps {
  // AppShell leaves these at their defaults; SprintShell overrides both to
  // "Sprint" + its own subtitle. The wordmark is plain text either way -
  // moving between the Planner and Sprint shells happens only through the
  // WorkspaceSwitcher, so there's a single learned place to look for it.
  title?: string
  subtitle?: string
  theme: Theme
  onToggleTheme: () => void
  // Rendered right next to the title/subtitle block, not in the far-right
  // cluster - it answers "which app am I in", the same question the title
  // text itself answers, so it sits beside it rather than off with the
  // profile/theme controls. SprintShell also tucks its Planning/Status tab
  // row in here, right after the switcher itself.
  workspaceSwitcher?: ReactNode
  // Rendered in the header's right-hand cluster, before the theme toggle -
  // AppShell passes its Todos/Notes/Boards tab row and ProfileSwitcher;
  // SprintShell mirrors that with just its TeamSwitcher.
  children?: ReactNode
}

// Shared chrome extracted from AppShell (logo/wordmark, theme toggle, a
// switcher slot) so SprintShell can reuse the exact same header instead of
// duplicating it - see .scratch/sprint-jira-integration/spec.md's
// "Two-shell architecture". AppShell's own rendering is unchanged by this
// extraction; only the markup moved.
export function Header({
  title = 'My Planner',
  subtitle = "Here's what's glowing today.",
  theme,
  onToggleTheme,
  workspaceSwitcher,
  children,
}: HeaderProps) {
  return (
    <header className="mb-7 flex flex-wrap items-start justify-between gap-4">
      <div className="flex flex-wrap items-center gap-4">
        <div>
          <h1 className="bg-gradient-to-r from-violet-500 via-fuchsia-500 to-cyan-500 bg-clip-text text-3xl font-extrabold text-transparent dark:from-violet-400 dark:via-fuchsia-400 dark:to-cyan-300">
            {title}
          </h1>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{subtitle}</p>
        </div>
        {workspaceSwitcher}
      </div>
      <div className="flex items-center gap-3">
        {children}
        <ThemeToggle theme={theme} onToggle={onToggleTheme} />
      </div>
    </header>
  )
}
