import type { ReactNode } from 'react'
import type { Theme } from '../utils/theme'
import { ThemeToggle } from './ThemeToggle'

interface HeaderProps {
  // When set, the wordmark becomes a button that calls this instead of
  // rendering as static text - SprintShell's "back to app" affordance
  // (AppShell passes nothing, since its wordmark is purely decorative).
  onWordmarkClick?: () => void
  theme: Theme
  onToggleTheme: () => void
  // Rendered in the header's right-hand cluster, before the theme toggle -
  // AppShell passes its Todos/Notes/Boards tab row plus ProfileSwitcher;
  // SprintShell passes just TeamSwitcher (its own Planning/Status/Epics
  // sub-nav renders below the header instead, per the Sprint nav spec).
  children?: ReactNode
}

// Shared chrome extracted from AppShell (logo/wordmark, theme toggle, a
// switcher slot) so SprintShell can reuse the exact same header instead of
// duplicating it - see .scratch/sprint-jira-integration/spec.md's
// "Two-shell architecture". AppShell's own rendering is unchanged by this
// extraction; only the markup moved.
export function Header({ onWordmarkClick, theme, onToggleTheme, children }: HeaderProps) {
  const wordmark = (
    <>
      <h1 className="bg-gradient-to-r from-violet-500 via-fuchsia-500 to-cyan-500 bg-clip-text text-3xl font-extrabold text-transparent dark:from-violet-400 dark:via-fuchsia-400 dark:to-cyan-300">
        My Planner
      </h1>
      <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Here's what's glowing today.</p>
    </>
  )

  return (
    <header className="mb-7 flex flex-wrap items-start justify-between gap-4">
      {onWordmarkClick ? (
        <button type="button" onClick={onWordmarkClick} aria-label="Back to app" className="text-left">
          {wordmark}
        </button>
      ) : (
        <div>{wordmark}</div>
      )}
      <div className="flex items-center gap-3">
        {children}
        <ThemeToggle theme={theme} onToggle={onToggleTheme} />
      </div>
    </header>
  )
}
