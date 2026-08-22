// The Atlas Planning tab's own "light client-side format check" (.scratch/
// atlas-planning-tab, ticket 01, spec story 8) - validates a raw typed Jira
// key against this project's WOSMVP-<digits> shape before it's ever attached
// to a person's row, catching an obvious typo before it's saved. Deliberately
// stricter than constants/jira.ts's normalizeJiraKey, which only reshapes a
// prefix and accepts any non-blank input at all (e.g. "hello" normalizes to
// "WOSMVP-HELLO" without complaint) - not suitable as a typo guard on its
// own. A fresh, tiny module of this feature's own rather than a shared
// export, per the spec's module-boundary decision (code duplication here is
// expected and accepted).
export function normalizePlanningJiraKey(raw: string): string | null {
  const trimmed = raw
    .trim()
    .toUpperCase()
    .replace(/^WOSMVP-?/, '')
  if (!/^\d+$/.test(trimmed)) return null
  return `WOSMVP-${trimmed}`
}
