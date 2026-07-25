# Map: Planner App

Label: wayfinder:map

## Destination

A written spec (PRD) for the personal planner app — covering categories, todos, the scratchpad, dates, priority, views, and visual design — detailed enough to hand off to implementation (e.g. via `/to-spec` and `/to-tickets`). This map produces decisions only; no application code is written as part of it.

## Notes

- Domain: personal, single-user to-do/planner app. No auth/accounts.
- Repo stack: pnpm workspace — `packages/backend` (Express + Mongoose/MongoDB), `packages/frontend` (React 19 + Vite). Currently a bare scaffold (one `/api/test` endpoint) — see repo `README.md`.
- Skills to consult per ticket: `research` tickets → `/research` subagent. `prototype` tickets → `/prototype`. `grilling` tickets → `/grilling` + `/domain-modeling`.
- Standing decisions locked during charting (do not re-litigate in child tickets):
  - Single-user, no auth.
  - Categories: fully user-defined, unlimited, flat (no nesting). Color assigned by user from a curated palette. Tags are a free-form, ad hoc second axis (autocomplete from prior use), independent of category.
  - Priority: 3 levels — High / Medium / Low.
  - Todo status: binary — open / completed. Categories display remaining vs. completed counts.
  - Dates: single optional due date per todo (no ranges/times). Dashboard has a small calendar widget on one side; separately, todos due *today* are automatically visually highlighted wherever they appear in lists/views (the highlight is date-driven, not manually set — e.g. a todo dated "tomorrow" becomes highlighted once tomorrow arrives).
  - Quick-add: only a title is required to create a todo; category, priority, date, and rich body are all optional and can be filled in later. Todos with no category land in a built-in, non-deletable "Uncategorized" category.
  - Scratchpad: multiple separate scratch notes (inbox-style list), not one continuous pad. Convert-to-todo works at line/bullet granularity — pick one or more lines from a note and promote each into its own todo (assigning category/priority/date at that point). The source note stays in the inbox after promotion, with promoted lines marked/linked to their new todo; user archives/deletes manually.
  - Search: simple text search over todo titles/bodies, in scope.
  - Reminders/notifications: not built — see [Reminder & Notification UX](issues/05-reminder-notification-ux.md), which reversed the earlier in-scope call made during charting. The today-highlight behavior above is considered sufficient.
  - Recurring todos: in scope (pattern/behavior details are a child ticket, see below).
  - Rich text is needed both for todo bodies and scratch notes; view mode must render the formatting (e.g. bullets), not just show raw text; editing reuses the same rich editor.
  - Technical constraint (surfaced while prototyping View Modes): due dates must be handled as local calendar-day values, not UTC-normalized timestamps, to avoid off-by-one-day bugs across timezones.

## Decisions so far

- [Rich Text Editor Library](issues/01-rich-text-editor-library.md) — Tiptap (core + react + starter-kit + extension-list): explicit React 19 support, native nested-checklist flag, same editor/document for view and edit modes via an `editable` toggle, widest adoption, moderate bundle size, plain MIT license.
- [View Modes](issues/02-view-modes.md) — Date Agenda (small calendar + Overdue/Today/Tomorrow/This week/Later/No date grouping) ships as the default and only view for now; a switcher to other prototyped views (Category Board, Priority Groups, Flat List) is left open for later, not built now.
- [Visual Design & Styling Approach](issues/03-visual-design.md) — "Vibrant Dark" visual language (dark background, neon category-glow accents, glassmorphism cards, gradient-text headings) ships; styling tech is Tailwind CSS.
- [Recurring Todo Behavior](issues/04-recurring-todo-behavior.md) — Daily/Weekly/Monthly presets; next instance created on completion (copied from template, freely editable per-instance); instances count normally; recurrence set up via direct creation only, toggled off per-instance to stop.
- [Reminder & Notification UX](issues/05-reminder-notification-ux.md) — reversed: no reminders/notifications at all, in-app or otherwise. The dashboard's today-highlight behavior is sufficient.

## Not yet specified

- Final data model / API shape for categories, todos, tags, scratch notes, and recurring instances — now fully implied by the resolved tickets above; this is spec-writing synthesis work, not a further decision.
- Exact structure/sections of the final spec.md handoff document — spec-writing work, not a decision.
- Whether/when a view-switcher (toggle to Category Board, Priority Groups, or Flat List alongside the default Date Agenda view) gets built — deliberately deferred per the View Modes decision; revisit as a fresh question only if/when another view actually gets prioritized.

## Out of scope

- Multi-user accounts / authentication — ruled out when naming the destination; this is a single-user personal app.
- OS/browser push notifications — moot: reminders/notifications aren't being built at all, see [Reminder & Notification UX](issues/05-reminder-notification-ux.md) in Decisions so far.
