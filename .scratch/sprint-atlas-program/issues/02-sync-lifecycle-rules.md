# Sync & lifecycle rules

Type: grilling
Status: resolved

## Question

Define the sync and lifecycle rules for Atlas epics:

- When does a newly-entered epic key first sync — immediately on entry, or queued/on next dashboard load?
- Is there a periodic background refresh (and at what cadence — same ~10min cache as the existing Sprint feature's `services/sprintSync.ts`, or different), or is Atlas manual-refresh-only?
- What happens when an entered key doesn't resolve to a real Jira epic (typo, wrong issue type, doesn't exist)?
- What does "removing/un-tracking" an epic from Atlas do to its already-synced tasks and any local annotations (notes/dates/risk/dependencies) attached to them — deleted immediately, orphaned, or archived?

## Answer

1. **Sync trigger**: entering an epic key syncs it immediately and synchronously (with a loading state) — its tasks/sub-tasks appear in the same interaction, not on a later load.
2. **Ongoing refresh**: manual only. No lazy/background auto-refresh on dashboard load or any staleness-based cache — a "Sync now" action (per-epic, and/or for everything) is the only way data updates after the initial sync.
3. **Bad key handling**: rejected at entry. If Jira can't resolve the key (404) or it doesn't resolve to an Epic-type issue, nothing is saved to Atlas's tracked list — inline error shown, tracked-epics list stays always-valid.
4. **Un-tracking an epic**: archives it (soft-delete/hidden flag), not a hard delete. Its tasks, sub-tasks, and all local annotations (notes, dates, risk flags, dependencies) stay intact in storage and are restorable — just hidden from the Dashboard while archived. Needs an "un-archive/restore" affordance somewhere in the eventual UI spec (trivial detail, not a fresh decision).
