export type Theme = 'light' | 'dark'

const STORAGE_KEY = 'planner-theme'

// Dark is the default; light mode is an opt-in choice persisted across
// visits. index.html runs the same read+apply logic inline, before React
// mounts, so there's no flash of the wrong theme on load.
export function getInitialTheme(): Theme {
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    return stored === 'light' ? 'light' : 'dark'
  } catch {
    return 'dark'
  }
}

export function applyTheme(theme: Theme): void {
  document.documentElement.classList.toggle('dark', theme === 'dark')
  document.documentElement.style.colorScheme = theme
  try {
    localStorage.setItem(STORAGE_KEY, theme)
  } catch {
    // Persistence is best-effort; the toggle still works for the session.
  }
}
