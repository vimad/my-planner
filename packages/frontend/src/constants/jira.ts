// Shared by every component that deep-links to a Jira issue (`/browse/<key>`)
// - kept as one constant rather than each component re-reading the env var,
// so the fallback default can't drift between call sites.
export const JIRA_BASE_URL = import.meta.env.VITE_JIRA_BASE_URL ?? 'https://wealthos.atlassian.net'

export function jiraIssueUrl(jiraKey: string): string {
  return `${JIRA_BASE_URL}/browse/${jiraKey}`
}

// Accepts a bare number ("14802"), a full key ("WOSMVP-14802"), or a
// lowercase/no-dash variant, and normalizes to the full key. Shared by every
// "type a Jira key" input (Planning's add-ticket form, Atlas's add-epic
// form) so the hardcoded project prefix lives in one place. Returns null for
// blank input.
export function normalizeJiraKey(raw: string): string | null {
  const trimmed = raw
    .trim()
    .toUpperCase()
    .replace(/^WOSMVP-?/, '')
  return trimmed ? `WOSMVP-${trimmed}` : null
}
