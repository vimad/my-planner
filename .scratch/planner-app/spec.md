# Planner App

Status: ready-for-agent

Source: [Planner App wayfinder map](map.md) and its resolved tickets ([Rich Text Editor Library](issues/01-rich-text-editor-library.md), [View Modes](issues/02-view-modes.md), [Visual Design & Styling Approach](issues/03-visual-design.md), [Recurring Todo Behavior](issues/04-recurring-todo-behavior.md), [Reminder & Notification UX](issues/05-reminder-notification-ux.md)).

## Problem Statement

The user works across many different, unrelated kinds of work at once (day job, personal life, side projects, home) and has no single place to keep track of what's outstanding in each. Ideas and action items regularly surface in the middle of a meeting or a chat, where stopping to properly categorize and prioritize a todo breaks the flow of the conversation — so they either get lost or never get written down. Once captured, there's no fast way to see, at a glance, what's overdue, what's due today, and how much is left in each area of the user's life.

## Solution

A personal (single-user, no accounts) planner web app built on the existing pnpm workspace (`packages/backend` — Express + Mongoose/MongoDB, `packages/frontend` — React 19 + Vite):

- **Categories** the user defines freely (Work, Personal, Side Project, Home, ...), each color-coded from a curated palette, each showing how many todos are remaining vs. completed. Todos can also carry free-form tags as a second, cross-cutting axis.
- **Todos** with a title (the only required field), an optional rich-text body, an optional single due date, a priority (High/Medium/Low), optional tags, and optional recurrence (Daily/Weekly/Monthly).
- A **scratchpad** of quick, unstructured notes for capturing things mid-meeting or mid-chat, with a lightweight flow to promote individual lines into proper todos later, without losing the original note.
- A **dashboard** built around a single Date Agenda view: a small calendar widget plus an agenda grouped by due date (Overdue / Today / Tomorrow / This week / Later / No date), with todos due today automatically highlighted wherever they appear.
- Simple **search** across todo titles and bodies.
- A **rich-text editor** (Tiptap) shared between edit and view modes for both todo bodies and scratch notes, so formatting (bullets, checklists, headings, links, bold/italic) is preserved and rendered correctly whether you're editing or just looking.
- A **"Vibrant Dark" visual design** (dark background, neon category-glow accents, glassmorphism cards, gradient-text headings), built with Tailwind CSS.

## User Stories

1. As a user, I want to create a new category with a name and a color from a curated palette, so that I can organize todos by the different areas of my life.
2. As a user, I want to rename or delete a category I created, so that I can keep my categories accurate over time.
3. As a user, I want an unlimited number of categories, so that I'm not forced to consolidate unrelated areas of work.
4. As a user, I want every category to show how many todos are remaining and how many are completed, so that I can gauge my workload in each area at a glance.
5. As a user, I want todos with no category assigned to land automatically in a built-in "Uncategorized" category, so that quick capture never forces me to pick one first.
6. As a user, I want to create a new todo by typing just a title and hitting enter, so that adding something to my list is never slowed down by extra fields.
7. As a user, I want to optionally set a category, priority, due date, tags, and rich-text body on a todo — either at creation or later — so that I can add detail when I have time for it, not before.
8. As a user, I want to pick a todo's priority from High, Medium, or Low, so that I can signal how urgent it is.
9. As a user, I want to see my todos sortable/orderable by priority, so that the most important things surface first.
10. As a user, I want to add free-form tags to a todo (with autocomplete from tags I've used before), so that I can filter across categories by a cross-cutting concern (e.g. "urgent", "waiting-on-someone").
11. As a user, I want to set a single optional due date on a todo, so that I can track when something needs to happen without being forced to schedule everything.
12. As a user, I want todos due today to be automatically, visually highlighted everywhere they appear on the dashboard, so that I notice them without having to look for them.
13. As a user, I want a small calendar widget on the dashboard that marks which days have todos due, so that I can see my workload's shape across the month.
14. As a user, I want my dashboard's main view to be an agenda grouped into Overdue, Today, Tomorrow, This week, Later, and No date, so that I always know what's due soonest.
15. As a user, I want to mark a todo as completed with a single action (e.g. a checkbox), so that finishing something is frictionless.
16. As a user, I want to write a todo's body using a modern rich-text editor (bullets, numbered lists, bold/italic, headings, links, nested checklists), so that I can capture real structure, not just a flat sentence.
17. As a user, I want a todo's rich-text body to render its formatting (bullets, checklists, etc.) when I'm just viewing it, not only while editing, so that I can read structured detail without opening an editor.
18. As a user, I want to edit a todo's rich-text body using the same editor I used to view it, so that switching between reading and editing feels seamless.
19. As a user, I want to quickly jot down a scratch note — with no category, priority, or structure required — so that I can capture something mid-meeting or mid-chat without breaking my flow.
20. As a user, I want each scratch capture to be its own separate note in an inbox-style list (not one giant running pad), so that captures from different contexts don't blur together.
21. As a user, I want to write a scratch note using the same rich-text editor as todos, so that I can jot quick bullet points naturally.
22. As a user, I want to select one or more lines/bullets from a scratch note and promote each into its own proper todo — assigning category, priority, and date at that moment — so that I can turn raw capture into an actionable list without retyping it.
23. As a user, I want a scratch note to remain in my inbox after I've promoted some or all of its lines, with the promoted lines visibly marked and linked to the todos they became, so that nothing is silently lost and I can see what's already been triaged.
24. As a user, I want to manually archive or delete a scratch note once I'm done with it, so that my inbox doesn't fill up with fully-processed notes.
25. As a user, I want to mark a todo as recurring on a Daily, Weekly, or Monthly schedule, so that I don't have to manually recreate routine tasks.
26. As a user, I want the next instance of a recurring todo to be created automatically when I complete the current one, with its due date advanced by the recurrence interval, so that my routine tasks keep showing up without extra effort.
27. As a user, I want each new instance of a recurring todo to start as a copy of the previous one's category, priority, tags, and body, but remain independently editable, so that I can adjust a single occurrence without affecting the rest of the series.
28. As a user, I want to turn off recurrence on a recurring todo's current instance, so that I can stop a series without deleting or archiving anything else.
29. As a user, I want completed and remaining recurring-todo instances to count toward their category's totals just like any other todo, so that the counts stay honest about my actual workload.
30. As a user, I want to search my todos by title and body text, so that I can quickly find something specific without browsing every category.
31. As a user, I want the dashboard to look colorful, modern, and visually distinct per category, so that the app is pleasant to return to every day rather than feeling like a chore.

## Implementation Decisions

**Modules to build** (currently bare scaffold — `packages/backend` exposes only `/api/test`, `packages/frontend` only fetches and displays it; both will be replaced by real planner functionality):

- `packages/backend`: Mongoose models and Express routes for Category, Todo, and ScratchNote; a recurrence-advance routine triggered on todo completion (no cron/scheduler needed — recurrence is event-driven, not time-driven, per [Recurring Todo Behavior](issues/04-recurring-todo-behavior.md)); a search endpoint over todo title/body.
- `packages/frontend`: Tailwind CSS setup (not yet installed); the Date Agenda dashboard (calendar widget + grouped agenda + category summary strip) in the "Vibrant Dark" visual language; the Tiptap-based rich-text editor component (shared edit/view modes); the scratchpad inbox and line-promotion flow; category/todo/tag management UI.

**Data model** (prose shapes — encodes decisions made across the resolved tickets and the prototype mock data at `packages/frontend/src/prototype-views/mockData.js`, which should be treated as a shape reference, not literal schema code):

- **Category**: id, name, color (hex, chosen by the user from a curated palette — the exact palette values still need picking at implementation time). One system-provided category named "Uncategorized" — not user-deletable — is the default for todos created without one.
- **Todo**: id, title (required), body (Tiptap JSON document, optional), categoryId (defaults to Uncategorized), priority (`High` | `Medium` | `Low`; needs a default for quick-add since only title is required — recommend `Medium`, flagged as an assumption, not a locked decision), dueDate (a local calendar-day string, e.g. `2026-07-25`, not a UTC timestamp — see the constraint below), tags (array of free-form strings), completed (boolean, default false), recurrence (`{ pattern: 'daily' | 'weekly' | 'monthly' }` or null).
- **ScratchNote**: id, body as a Tiptap document structured as a list of lines/bullets, where each top-level line carries a stable id and a `promotedTodoId` (null until promoted), createdAt, archived (boolean, default false — manual archive/delete per [Scratchpad decisions](map.md)).
- Tags are not a separate collection for v1 — they're a plain string array on Todo; autocomplete is served by querying distinct tag values already in use.

**Recurring todo mechanics** ([Recurring Todo Behavior](issues/04-recurring-todo-behavior.md)): when a Todo with non-null `recurrence` transitions from incomplete to completed, the backend creates a new Todo cloned from it (same category, priority, tags, body, recurrence) with `completed: false` and `dueDate` advanced by the pattern's interval (daily +1 day, weekly +7 days, monthly same day next month). This implies a recurring todo needs a `dueDate` set for the interval math to run — flagged as an assumption to confirm at implementation time. Turning recurrence off on an instance just sets its `recurrence` to null; there's no separate "series" entity.

**Rich text editor** ([Rich Text Editor Library](issues/01-rich-text-editor-library.md)): Tiptap (`@tiptap/core`, `@tiptap/react`, `@tiptap/starter-kit`, `@tiptap/extension-list` with `TaskItem.configure({ nested: true })` for checklists). The same `Editor` instance and JSON document power both view mode (`editable: false`) and edit mode — no separate read-only renderer. Full evaluation and citations: [01-rich-text-editor-library-findings.md](issues/01-rich-text-editor-library-findings.md).

**Dashboard / views** ([View Modes](issues/02-view-modes.md)): a single Date Agenda view ships — small calendar widget (days with due todos marked) + agenda grouped Overdue/Today/Tomorrow/This week/Later/No date. Todos due today are highlighted automatically wherever rendered. Other prototyped views (Category Board, Priority Groups, Flat List + Filters) are not being built now; a view switcher is explicitly deferred, not designed. Reference prototypes: `packages/frontend/src/prototype-views/` (unwired from the app, kept as structural reference only).

**Visual design & styling** ([Visual Design & Styling Approach](issues/03-visual-design.md)): "Vibrant Dark" visual language — dark gradient background, category colors used as glowing neon accents, translucent/blurred glassmorphism cards, gradient-text headings. Styling tech is Tailwind CSS (not yet installed in the repo). No light mode / theme toggle is being built for v1 — only Vibrant Dark ships; flagged as an assumption since it was never explicitly ruled in or out. Reference prototype: `packages/frontend/src/prototype-views/design/` (unwired from the app, kept as visual reference only — the real components should be built fresh with Tailwind rather than copied from the hand-rolled CSS prototype).

**Technical constraint**: due dates must be stored and compared as local calendar-day values (e.g. a plain `YYYY-MM-DD` string), not UTC-normalized timestamps — round-tripping through `Date#toISOString()` silently shifts the date by a day depending on the server/client timezone. This was found as a real bug while prototyping the calendar widget.

**Search**: since todo bodies are stored as Tiptap JSON, search needs a denormalized plain-text extract (maintained on save) to search against — either via MongoDB text indexes on `title` + the plain-text extract, or a simple case-insensitive regex match for v1 given the expected data volume (single user, personal use).

**No reminders/notifications**: per [Reminder & Notification UX](issues/05-reminder-notification-ux.md), this was scoped in at charting time but explicitly reversed — no reminder or notification mechanism, in-app or otherwise, is being built. The today-highlight behavior is the only "surfacing" mechanism.

## Testing Decisions

Following the existing convention already established in this repo (`packages/backend/test/test.route.test.js`, `packages/frontend/src/App.test.jsx`):

- **Backend seam**: test through the HTTP layer via `createApp()` + `supertest`, exactly like the existing `/api/test` route test — the highest seam that exercises real routing, validation, and response serialization without a live server. Mongoose models are mocked at the module boundary (`vi.mock('../src/models/<Model>.js')`), not the database itself. Cover: Category CRUD, Todo CRUD (including quick-create with title only, completion triggering recurrence-advance, search), ScratchNote CRUD and line-promotion.
- **Frontend seam**: test at the component/page level via React Testing Library + Vitest, mocking `fetch` at the network boundary like the existing `App.test.jsx` does — render real components and assert on rendered output and user interactions (clicking, typing), not internal state or implementation details. Cover: dashboard rendering (agenda groups, calendar highlight, category counts), quick-add flow, rich-text edit/view toggle, scratchpad promotion flow.
- Only test externally observable behavior — HTTP request/response shape on the backend, rendered UI and user-visible interactions on the frontend — not internals like specific function calls or component state shape.

## Out of Scope

- Multi-user accounts / authentication.
- Reminders or notifications of any kind (in-app or OS/browser push) — explicitly reversed during wayfinding.
- Category nesting / sub-categories.
- A view switcher or any view besides Date Agenda (Category Board, Priority Groups, Flat List + Filters were prototyped but not chosen — deferred, not designed).
- Recurring todo custom intervals or specific-weekday selection — only Daily/Weekly/Monthly presets.
- Managed/predefined tag lists — tags stay free-form and ad hoc.
- Light mode or a theme toggle — only the Vibrant Dark visual design ships.

## Further Notes

- The full decision trail — including the reasoning behind each choice, alternatives considered, and the prototypes built along the way — lives on the [Planner App wayfinder map](map.md) and its child tickets under `.scratch/planner-app/`.
- Two open assumptions are flagged inline above (default priority for quick-add; recurring todos requiring a due date) — worth a quick confirmation before or during implementation, but not blocking enough to warrant reopening the wayfinder map.
- The exact curated color palette for categories was never enumerated to specific hex values during wayfinding — only that it's user-chosen from a curated set. Pick a concrete palette (a dozen or so swatches) that reads well against the Vibrant Dark background at implementation time.
