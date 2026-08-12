// Shared by every component that deep-links to a Jira issue (`/browse/<key>`)
// - kept as one constant rather than each component re-reading the env var,
// so the fallback default can't drift between call sites.
export const JIRA_BASE_URL = import.meta.env.VITE_JIRA_BASE_URL ?? 'https://wealthos.atlassian.net'
