# Profiles

Status: ready-for-agent

Source: resolved directly via a single `/grilling` session (no wayfinder map needed — every question resolved without a fork requiring prototype/research/further human back-and-forth).

## Problem Statement

The user's categories today (Work, Personal, Side Project, Home, ...) all live in one flat, global list — a single-user, single-context app. As the number of categories grows across genuinely separate areas of life (e.g. everything under "day job" vs. everything under "personal life"), there's no coarser boundary above Category to keep those areas from blending together in the dashboard, search, and scratchpad. The user wants a second, coarser grouping layer — Profiles (e.g. "Work", "Personal") — each owning its own set of categories, so switching context fully switches what's visible.

## Solution

A new **Profile** entity sits one level above Category:

- Each Profile owns a set of Categories (and, transitively, their Todos), plus its own ScratchNotes.
- A persistent **switcher** in the dashboard header sets the **active profile**; the entire app — dashboard, agenda, category list, scratchpad, tags, search — operates within that one profile at a time. There is no blended "all profiles" view.
- Everything else in the app (todos, priority, tags, due dates, recurrence, rich-text editor, date-agenda dashboard, search mechanics) is unchanged — Profile is purely an added grouping layer, not a redesign of any existing feature.

## User Stories

1. As a user, I want to create a new profile with a name, so that I can separate a whole area of my life (e.g. Work) from another (e.g. Personal).
2. As a user, I want to rename or delete a profile I created, so that I can keep my profiles accurate over time.
3. As a user, I want an unlimited number of profiles, so that I'm not forced to consolidate unrelated areas of life.
4. As a user, I want at least one profile to always exist, so that the app is never left with nowhere to show my categories and todos.
5. As a user, I want a persistent switcher to set my active profile, so that I can move between Work and Personal with one action.
6. As a user, I want the dashboard, agenda, category list, scratchpad, tags, and search to all scope themselves to my active profile, so that switching profiles fully switches my context with no cross-profile blending.
7. As a user, I want every category I create to belong to the profile I was in when I created it, so that my categories stay organized by area of life without extra setup.
8. As a user, I want each profile to have its own "Uncategorized" category, so that quick-add still never forces me to pick a category first, no matter which profile I'm in.
9. As a user, I want my existing categories and todos to automatically land in a single "Work" profile the first time this ships, so that upgrading never loses or hides anything I already have.
10. As a user, I want deleting a profile to warn me it will also delete everything inside it (its categories, todos, and scratch notes), so that I don't lose work by accident.
11. As a user, I want the app to remember which profile I was last in when I reload it, so that I don't have to re-select it every time.

## Implementation Decisions

**Modules to touch** (extends the existing planner app — see `.scratch/planner-app/spec.md` for the base data model this builds on):

- `packages/backend`: a new `Profile` Mongoose model + `/api/profiles` CRUD routes; add required `profileId` to `Category` and `ScratchNote`; scope the existing `categories`, `todos`, `scratchNotes`, and search routes to a `profileId` (query param or equivalent); extend the existing boot-time seed pattern (`seed.ts`, `defaultCategory.ts`) to (a) seed one "Work" profile and backfill any existing profile-less Category onto it, and (b) seed a per-profile "Uncategorized" category whenever a new profile is created.
- `packages/frontend`: a profile switcher component in the dashboard header (persisted active-profile choice in `localStorage`); thread the active `profileId` through existing data-fetching (categories, todos, scratchpad, search, tag autocomplete) so every view narrows to it; profile create/rename/delete UI (mirroring the existing `CategoryForm` pattern).

**Data model** (prose shapes, additive to the existing model in `.scratch/planner-app/spec.md`):

- **Profile** (new): id, name (required), color (optional — same curated-palette idea as Category; open styling assumption, not a locked decision), createdAt/updatedAt. No `system`/protected flag — the seeded "Work" profile is an ordinary, fully user-manageable profile like any other. Not deletable while it's the only remaining profile (mirrors the existing "Uncategorized can't be deleted" guard on Category).
- **Category** (changed): gains a required `profileId` (ref Profile). A category's profile is fixed at creation and never re-parented — re-parenting categories between profiles is explicitly out of scope. The "Uncategorized" system category becomes per-profile: each profile gets its own non-deletable "Uncategorized", seeded when the profile is created (same `system: true` pattern as today, scoped by `profileId`).
- **Todo** (unchanged schema): still only carries `categoryId`, no direct `profileId`. Its profile is derived transitively via `categoryId → Category.profileId` — never denormalized, since categories don't move between profiles.
- **ScratchNote** (changed): gains a required `profileId` (ref Profile), set directly (not derived) — a scratch note exists before it's promoted into a todo, so it has no `categoryId` to derive a profile from. Promoting a line into a todo must only offer categories from the note's own profile.
- **Settings** (unchanged): the singleton `nextOfficeDay` stays global, not per-profile — it's treated as a real-world calendar fact, not something that varies by area of life.

**Scoping rule**: every read (dashboard agenda, category list + counts, scratchpad inbox, search results, tag autocomplete suggestions) is filtered to the active profile's `profileId`. There is no cross-profile or "all profiles" view anywhere in the UI.

**Migration** (existing dev database already has real categories/todos with no `profileId`): on boot, extend the existing idempotent seed step to (1) find-or-create a Profile named "Work", and (2) backfill `profileId: <Work's id>` onto any Category that doesn't already have one — mirroring the existing idempotent `seedUncategorizedCategory()` pattern in `packages/backend/src/seed.ts`. Existing Todos and ScratchNotes need no direct backfill (Todo derives its profile transitively; ScratchNote's own `profileId` backfill follows the same "Work" default).

**Profile switcher UI**: a dropdown/tab control in the dashboard header, same visual tier as the app's top-level chrome (more prominent than the category summary strip it sits alongside). Selecting a profile is a pure client-side state change — no route/URL change — persisted to `localStorage` so a reload returns to the last-active profile. No profile-aware routing (e.g. `/work`, `/personal`) is being built; this is a single-user app with no bookmarking-for-others use case.

**Profile deletion**: deleting a profile cascade-deletes its categories, todos, and scratch notes — there's no "Uncategorized"-style fallback profile to reparent orphans into. The frontend must confirm explicitly before deleting a non-empty profile (e.g. "Delete Work and its 12 todos?"). Deleting the last remaining profile is blocked entirely, same guard style as the existing "Uncategorized can't be deleted" check.

**Tags**: unchanged mechanically (still a free-form string array on Todo, no separate collection) but scoped — autocomplete only suggests tag values already used within the active profile, not globally across all profiles.

## Testing Decisions

Following the existing conventions in this repo (`packages/backend/test/*.route.test.ts`, `packages/frontend/src/**/*.test.tsx`):

- **Backend seam**: HTTP-layer tests via `createApp()` + `supertest`, same pattern as `categories.route.test.ts` / `todos.route.test.ts`. Cover: Profile CRUD (including the "can't delete the last profile" and cascade-delete-on-non-empty-profile guards), Category/Todo/ScratchNote/search endpoints correctly scoped by `profileId`, the boot-time "Work" backfill migration (idempotent — running it twice doesn't duplicate or reassign), and per-profile "Uncategorized" seeding on profile creation.
- **Frontend seam**: component/page tests via React Testing Library + Vitest, mocking `fetch` at the network boundary, same pattern as `App.test.tsx` / `Scratchpad.test.tsx`. Cover: the profile switcher (renders profiles, switching re-fetches scoped data, persists to `localStorage`, restores on reload), profile create/rename/delete UI (including the non-empty-profile delete confirmation), and that category/todo/scratchpad/search/tag-autocomplete views only ever show active-profile data.
- Only test externally observable behavior — HTTP request/response shape on the backend, rendered UI and user-visible interactions on the frontend.

## Out of Scope

- A blended "all profiles" or cross-profile view anywhere in the UI — full scoping only, per the standing decision above.
- Re-parenting a category from one profile to another — a category's profile is fixed at creation.
- Profile-aware URL routing (e.g. `/work`, `/personal`) — the active profile is client-side state only.
- Making `Settings`/`nextOfficeDay` per-profile — it stays global.
- A protected/undeletable "system" profile — the seeded "Work" profile is ordinary and fully user-manageable once another profile exists.
- Any change to todos, priority, tags mechanics, due dates, recurrence, the rich-text editor, or the date-agenda dashboard's grouping logic beyond adding profile-scoping to their reads — none of that behavior itself changes.

## Further Notes

- The full decision trail lives in this conversation's `/grilling` session (no separate wayfinder map or child tickets were created — the effort resolved cleanly enough in one session that a map would have been pure overhead).
- One open styling assumption, not a locked decision: whether Profile gets a `color` field for the switcher UI (recommended: yes, mirroring Category's curated-palette pattern) — worth a quick confirmation at implementation time, same treatment as the open assumptions flagged in `.scratch/planner-app/spec.md`.
