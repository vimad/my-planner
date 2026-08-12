# Spec: Placeholder tickets

**Status:** ready-for-agent

## Problem Statement

Sprint Planning today only has one way to put work against a person: add a real Jira ticket. There's no way to reserve capacity for work that will never have a Jira ticket at all — on-call, interviews, support duty covered by something other than the existing single `extraHours` figure (`CapacityEntry`), a known chunk of unplanned work someone is expected to absorb, etc. The team wants a lightweight, manually-typed stand-in that behaves like a real planned ticket for capacity purposes, without pretending to be a Jira ticket anywhere else in the app.

## Solution

A **Placeholder ticket**: a short text description + one assignee + an estimate, created inline from the Planning view. It always belongs to exactly one assignee (never shared between two people).

- **Not a Jira ticket.** No `jiraKey`, never touched by Full/Lightweight sync (`services/ticketSync.ts`), never included in `POST /api/sprint-plan-entries/sync`.
- **Counts toward Planned.** Its `estimateHours` is added to its assignee's Planned capacity figure (`GET /api/teams/:teamId/sprints/:sprintId/capacity`) exactly like a resolved Sprint Plan Entry would, reducing that person's Remaining capacity.
- **No effect on the Sprint Breakdown card.** `utils/sprintBreakdown.ts`'s Features/Technical items/Bugs totals never include it.
- **Never shown in the Status view.** The Status tab only ever reads the `Ticket` collection (`GET /api/tickets`); a Placeholder ticket never enters that collection.
- **Created via a second icon-only button** next to Planning's existing "Add to plan" — Add button, opening a small popup for the assignee (any current Team Membership), description text, and estimate hours. Shown as its own badge (violet accent, distinct from the Jira-type badge colors) in that person's row, with a Remove (×) affordance — no drag-reorder, no detail popup, no Jira link.

## Domain model changes

- **New model — `packages/backend/src/models/PlaceholderTicket.ts`**: `{ teamId, sprintId, personId, text, estimateHours, createdAt }`, its own collection (never the `Ticket` model) so it's structurally excluded from sync and from the Status view's query.
- **`CONTEXT.md`**: new glossary entry, **Placeholder ticket**.
- **`docs/ui-conventions.md`**: new semantic-color entry — violet reserved for the Placeholder ticket badge.

## Implementation Decisions

### Backend

- **New route — `packages/backend/src/routes/placeholderTickets.ts`**, mounted at `/api/placeholder-tickets`:
  - `GET /?teamId=&sprintId=` — lists a team+sprint's placeholders, oldest first.
  - `POST /` — body `{ teamId, sprintId, personId, text, estimateHours }`. `text` is trimmed and required non-blank; `estimateHours` must be a non-negative number.
  - `DELETE /:id` — removes one.
  - No sync endpoint, no PATCH/edit, no drag-reorder — deliberately out of scope for v1.
- **`routes/capacity.ts`** folds each placeholder's `estimateHours` into its assignee's `planned` figure, summed by `personId` alongside the existing non-split/split Planned sums.

### Frontend

- **`hooks/useSprintPlan.ts`** fetches placeholders alongside `entries`/`capacity` (same `refreshPlan()` trigger), and exposes `addPlaceholder`/`removePlaceholder` (POST/DELETE, mirroring `addTicket`/`removeEntry`'s conventions).
- **`components/AddPlaceholderPopup.tsx`** — Archetype B modal (assignee select, description input, estimate hours input).
- **`components/PlanningView.tsx`** — `PlaceholderBadge` renders each placeholder inline in its assignee's `PersonRow`, grouped by `personId` → membership (a placeholder whose person has since left the team has nowhere to render, same as any other roster-departure edge case elsewhere in this view). The new icon button (lucide `StickyNote`) sits right after the existing "Add" submit button in `AddToPlanForm`.
