# 11 — Present view

**What to build:** The dedicated, read-only, screen-share-friendly standup screen from `spec.md` §7 / the winning prototype (branch `prototype/atlas-present-ui-variants`, Variant D — "compact master/detail").

- **Program strip** (always-visible, left-hand): one row per **live** (non-archived) epic — small progress ring colored by health (emerald on-track / amber watch / rose at-risk, a display-only grouping derived from at-risk count, not a stored field), title, Jira key, at-risk count badge when >0. No scrolling needed for a 3–5 epic program.
- **Detail pane** (right-hand): selecting a row — click, or ↑/↓ keys, no page transition — swaps a focused panel: epic key + Jira link + date range, title, health/progress line, status bucket counts, a "needs attention" digest (only at-risk tasks and tasks blocked-by-not-Done, each with a reason and inline notes when present; cross-epic blocker keys shown inline, no epic-suffix chip needed since the digest is already scoped to one epic), then epic notes as a blockquote. Panel background tinted by the epic's health color. A clean epic (nothing at-risk or blocked) shows an explicit "on track" line instead of an empty section.
- **Archived epics**: never shown here — Present is standup-facing, live epics only; archive/restore stays a Dashboard-only concept.
- **Fully read-only**: no edit controls, no mutations anywhere — the only interactive surface is which epic is focused, plus outbound Jira links.

**Blocked by:** Task editing ([09](09-task-editing.md)), Epic lifecycle management ([10](10-epic-lifecycle-management.md))

**Status:** ready-for-agent

- [ ] Present view lists every live (non-archived) tracked epic in the program strip with a health-colored progress ring and at-risk badge when applicable
- [ ] Selecting an epic (click or ↑/↓) swaps the detail pane instantly, no page transition
- [ ] Detail pane shows status counts, a needs-attention digest (at-risk / blocked-by-not-Done tasks with reasons), and epic notes as a blockquote
- [ ] An epic with nothing at-risk or blocked shows an explicit "on track" line rather than an empty digest
- [ ] Archived epics never appear anywhere in Present
- [ ] No control on this screen writes to Atlas's own data or to Jira — navigation and outbound Jira links are the only interactive elements
