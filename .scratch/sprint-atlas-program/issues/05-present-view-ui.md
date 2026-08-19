# Present view UI

Type: prototype
Status: resolved

Blocked by: 04

## Question

Prototype the Atlas Present view: given the Dashboard's settled data and layout (see [Dashboard UI](../issues/04-dashboard-ui.md)), design the dedicated read-only, screen-share-friendly summary screen — what it shows per epic (status/risk/dependencies/notes highlights) and how it's laid out for narrating a standup update, distinct from the Dashboard's day-to-day management chrome.

## Answer

Prototyped four structurally different takes (React, mock data, `/prototype/atlas-present`) — full set captured on the throwaway branch `prototype/atlas-present-ui-variants`. **Variant D — "compact master/detail" — won**, after a first round (A/B/C) surfaced the actual ask: compact, quickly-scannable big picture, easy to navigate — not a fourth structural axis picked blind.

Settled layout:

- **Program strip**: a dense, always-visible left-hand list — one row per epic, no scrolling for a 3-5 epic program — showing a small progress ring (colored by health: emerald on-track / amber watch / rose at-risk, derived from at-risk count, display-only grouping, not a new stored field), title, Jira key, and an at-risk count badge when >0. This is the "quickly see the big picture" surface: every epic's health is visible at once without opening anything.
- **Detail pane**: selecting a row (click, or ↑/↓ keys — no page transition, no slide/scroll) swaps a focused panel on the right: epic key + Jira link + date range, title, health/progress line, status counts, then the same "needs attention" content as the other variants (at-risk and blocked-by-not-Done tasks, each with a reason and inline notes when present), then epic notes as a blockquote. Panel background is tinted by the same health color as the epic's strip row.
- **What it shows per epic** (settles the ticket's core question, same across all four variants so the answer isn't tied to D specifically): status bucket counts, progress %, an at-risk/blocked digest (not a full task-by-task list — only tasks worth narrating), cross-epic blocker keys inline (no epic-suffix chip needed here since the digest is already scoped to one epic at a time), and epic-level notes as a pull-quote. Clean epics (nothing at-risk or blocked) get an explicit "on track" line rather than an empty section.
- **No archived-epic affordance** — Present is standup-facing and only ever shows live epics; archived/restore stays a Dashboard-only concept (ticket 04).
- **Fully read-only** — no edit controls, no mutations anywhere in any variant; the only interactive surface is navigation (which epic is focused) plus outbound Jira links.

Why D over A/B/C: A (full-screen slide carousel) and B (long scroll-and-narrate) both trade away "quickly see the big picture" for a linear, one-thing-at-a-time narration flow — fine for talking through one epic, bad for orienting before you start talking. C (grid + digest) gets the big-picture-first framing right but still separates "the glance" from "the walkthrough" into two stacked sections you scroll between. D collapses that into one screen: the glance *is* the nav (the strip), and moving through it *is* the walkthrough (the detail pane), with an instant swap instead of a scroll or a slide transition — matching "compact, easy to navigate, quickly see big picture" as one request rather than three separate wins to trade off.
