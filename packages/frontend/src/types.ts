// Shared frontend-side data shapes. These describe the plain JSON the
// backend's HTTP API actually sends/accepts (GET/POST/PATCH
// /api/todos, /api/categories, /api/scratch-notes) — they are a different
// type domain than the backend's Mongoose documents (packages/backend/src/
// models/*.ts's TodoDoc/CategoryDoc/ScratchNoteDoc) and must not import
// those across the package boundary. Every field an ObjectId would occupy
// on the backend (categoryId, linkedTodoIds, promotedTodoId, _id itself) is
// a plain string here, since that's what JSON.stringify/JSON.parse produces
// over the wire.
//
// Introduced in Issue 07 (previously each component that needed a sliver of
// one of these shapes declared its own minimal local interface, e.g.
// CategoryChip.tsx's `CategoryChipCategory`, MiniCalendar.tsx's
// `MiniCalendarTodo`, dateAgenda.ts's `DueDateFields`). Those per-file
// interfaces are left as-is (still structurally compatible with the types
// below — a `Todo`/`Category` value here satisfies all of them), but any
// new component should prefer importing from here. Issue 08 (App.jsx) is
// expected to adopt these as its own state types.
//
// Only `title` is required on `Todo` (and `name`/`color` on `Category`) —
// deliberately loose on everything else, because a single `Todo` value is
// used for both a fully-hydrated todo straight from the API (every field
// present) and an in-memory draft for the "new todo" popup (just
// `{ title }`, no `_id` yet — see TodoDetail's `isNew`/`canLink`).

import type { JSONContent } from '@tiptap/core'

export type TodoPriority = 'High' | 'Medium' | 'Low'

export interface TodoRecurrence {
  pattern: 'daily' | 'weekly' | 'monthly'
}

export interface Todo {
  _id?: string
  id?: string
  title: string
  categoryId?: string
  completed?: boolean
  // Local calendar-day string ("YYYY-MM-DD"), never a Date/timestamp — see
  // utils/dateAgenda.ts's header comment.
  dueDate?: string | null
  priority?: TodoPriority
  tags?: string[]
  officeLinked?: boolean
  body?: JSONContent | null
  recurrence?: TodoRecurrence | null
  // Flat, one-directional, no-cascade grouping of other todos' ids — see
  // the backend TodoDoc comment. A dangling id (its todo since deleted) is
  // left in place; callers resolving against a `Todo[]` are responsible for
  // tolerating a lookup miss.
  linkedTodoIds?: string[]
  createdAt?: string
  updatedAt?: string
}

// GET /api/categories augments the stored doc (name/color/system) with
// server-computed remaining/completed counts — see CategoryChip.tsx's
// near-identical `CategoryChipCategory`, which this is a superset of.
export interface Category {
  _id?: string
  id?: string
  name: string
  color: string
  system?: boolean
  remaining?: number
  completed?: number
}

// One line within a ScratchNote's body — see the backend ScratchNote model
// comment for why lines are independent Tiptap documents rather than one
// shared document with custom node ids.
export interface ScratchLine {
  id: string
  content: JSONContent | null
  promotedTodoId?: string | null
}

export interface ScratchNote {
  _id?: string
  id?: string
  body: ScratchLine[]
  archived?: boolean
  createdAt?: string
  updatedAt?: string
}

// The coarse grouping layer above Category — see .scratch/profiles/spec.md.
// `color` is optional (an open styling assumption per the spec); this ticket
// (02) doesn't render it anywhere yet. `activeBoardId` is null (never
// undefined once a Profile round-trips through the API) for a profile with
// no active board — see .scratch/boards/spec.md's Data Model section.
export interface Profile {
  _id?: string
  id?: string
  name: string
  color?: string
  activeBoardId?: string | null
  createdAt?: string
  updatedAt?: string
}

// A named group of people scoped to a Jira label, independent of Profile -
// never bound to one (see .scratch/sprint-jira-integration/spec.md's "Team,
// Person, membership"). `jiraLabels` is an array on the wire (future
// flexibility) even though phase 1's UI only ever edits a single entry.
export interface Team {
  _id?: string
  id?: string
  name: string
  jiraLabels: string[]
  createdAt?: string
  updatedAt?: string
}

// A person a Team can roster, independent of Profile/Team - a Person may
// hold TeamMembership in more than one Team. `email` is display/contact
// only; `jiraAccountId` is the actual match key against a synced Ticket's
// assignee (ADR 0001).
export interface Person {
  _id?: string
  id?: string
  name: string
  email: string
  jiraAccountId: string
  createdAt?: string
  updatedAt?: string
}

// Fixed job-title/seniority union, not a DB collection - see
// constants/roles.ts for the matching ROLE_DEFAULT_CAPACITY_PERCENT lookup
// (mirrors the backend's Role.ts exactly).
export type Role = 'TL' | 'ATL' | 'SSE' | 'SE' | 'SQA' | 'QA' | 'QA Intern' | 'Dev Intern'

// The join between a Team and a Person - one roster row. `personId` comes
// back populated (a full Person object) from GET /api/team-memberships, per
// ticket 12's API contract, rather than staying a bare id string.
export interface TeamMembership {
  _id?: string
  id?: string
  teamId: string
  personId: Person
  role: Role
  capacityPercentOverride: number | null
  createdAt?: string
  updatedAt?: string
}

// A Jira user-search hit, as returned by GET /api/people/jira-search (a
// passthrough to jiraClient.searchUsers) - backs the manual-entry form's
// optional autocomplete. Mirrors the backend's JiraUser shape.
export interface JiraUserSuggestion {
  accountId: string
  displayName?: string
  emailAddress?: string | null
}

// A cached snapshot of a Jira board sprint - see backend models/Sprint.ts.
export type SprintState = 'active' | 'future' | 'closed'

export interface Sprint {
  _id?: string
  id?: string
  jiraSprintId: string
  name: string
  state: SprintState
  startDate?: string | null
  endDate?: string | null
  lastSyncedAt?: string
}

// One raw result from GET /api/sprints/search (live Jira, never the cache) -
// shaped like Jira's own agile API sprint object (backend jiraClient.ts's
// JiraSprint), not our cached Sprint doc - id is numeric and there's no
// jiraSprintId/lastSyncedAt.
export interface JiraSprintSearchResult {
  id: number
  name: string
  state: SprintState
  startDate?: string
  endDate?: string
}

// One value from the Jira board's real workflow column configuration,
// mirrored locally - mirrors backend models/Status.ts exactly. Refreshed
// wholesale from Jira as a side effect of every sync action, never
// hand-edited; `category` drives only the Status view column header's
// subtle accent color, never which tickets group into it (that's `name`).
export interface Status {
  _id?: string
  id?: string
  name: string
  order: number
  category: 'todo' | 'in_progress' | 'done'
  lastSyncedAt: string
}

// A cached snapshot of a Jira epic - mirrors backend models/Epic.ts, plus
// the child-ticket rollup GET /api/epics?sprintId= computes server-side
// from Ticket.epicKey (childCount/doneCount are never stored on the Epic
// doc itself, see routes/epics.ts).
export interface Epic {
  _id?: string
  id?: string
  jiraKey: string
  title: string
  status: string
  lastSyncedAt: string
  childCount: number
  doneCount: number
}

// The one representation of a Jira issue, shared across Planning/Status/Epic
// views - mirrors backend models/Ticket.ts exactly (ADR 0001: matching is
// strictly by jiraAccountId, never the display-only assignee fields).
export interface Ticket {
  _id?: string
  id?: string
  jiraKey: string
  type: string | null
  title: string
  status: string
  assigneeAccountId: string | null
  assigneeDisplayName: string | null
  assigneeEmail: string | null
  estimateHours: number | null
  labels: string[]
  stream: string | null
  epicKey: string | null
  parentKey: string | null
  subtaskKind: 'Dev' | 'Test' | null
  currentSprintKey: string | null
  lastSyncedAt: string
}

// One role's (dev or qa) resolved owner on a Split ticket (CONTEXT.md "Role
// assignment") - mirrors the backend's devQaResolution.ts::DevQaRoleResolution
// exactly (kept as a separate declaration rather than a cross-package import,
// same convention as every other type in this file). `source` on `resolved`
// is what lets the UI tell a Jira-sourced Sub-task match (read-only in the
// popup) apart from a Dev/QA Override (editable) - see ADR 0004.
export type DevQaRoleResolution =
  | { status: 'resolved'; source: 'override' | 'subtask'; personId: string }
  | {
      status: 'unmapped'
      assigneeAccountId: string
      assigneeDisplayName: string | null
      assigneeEmail: string | null
    }
  | { status: 'needs-assignment' }

// Join: Team x Sprint x Ticket - a ticket manually added to a team's plan
// for a sprint. `ticketId` comes back populated from
// GET /api/sprint-plan-entries, per ticket 13's API contract (mirrors
// TeamMembership.personId's populated-on-GET convention). `order` is
// per-assignee (ticket 10's resolution), not global. `devOrder`/`qaOrder`
// are their Split-ticket (Story/Bug) equivalent (ticket 23) - `null` for a
// role that isn't `resolved` yet, unused entirely by a non-split ticket.
// `devQa` is present only on a Split entry (Story/Bug parent ticket) -
// omitted (not null) on a non-split entry, so a caller that never branches
// on it keeps working unchanged.
export interface SprintPlanEntry {
  _id?: string
  id?: string
  teamId: string
  sprintId: string
  ticketId: Ticket
  addedAt?: string
  order: number
  devOrder: number | null
  qaOrder: number | null
  devQa?: { dev: DevQaRoleResolution; qa: DevQaRoleResolution }
  // Each role's own [Dev]/[Test] Sub-task estimate (roleSubtaskEstimateHours
  // on the backend) - present only alongside devQa, i.e. for a Split entry.
  devEstimateHours?: number
  qaEstimateHours?: number
}

// The Team x Sprint header - a picked start/end date range plus any
// individually-marked holidays within it. workingDays is server-derived from
// those three fields (never client-supplied) - see backend
// models/TeamSprintPlan.ts and services/sprintWorkingDays.ts.
// startDate/endDate are absent on a legacy plan saved before this feature
// shipped (manually-entered workingDays only, no stored date range) - the
// Planning view treats that as "period not set" rather than crashing.
export interface TeamSprintPlan {
  _id?: string
  id?: string
  teamId: string
  sprintId: string
  startDate?: string
  endDate?: string
  holidays: string[]
  workingDays: number
}

// One person's leave for one sprint day - see backend models/
// CapacityEntry.ts and .scratch/sprint-leave-picker/spec.md. `date` is a
// plain 'YYYY-MM-DD' calendar-day string, never a `Date` - same convention
// as Todo.dueDate/TeamSprintPlan's startDate/endDate/holidays.
export type LeavePortion = 'full' | 'half'

export interface LeaveEntry {
  date: string
  portion: LeavePortion
}

// One row of GET /api/teams/:teamId/sprints/:sprintId/capacity's response -
// the Total/Available/Planned/Remaining formula computed server-side (see
// backend routes/capacity.ts), one per current TeamMembership on the team.
// `leaveEntries` is always the *reconciled* set (filtered against the
// sprint's current working dates server-side) - the frontend never has to
// re-filter or handle a stale date itself. `capacityEntryId` is `null` when
// no CapacityEntry doc exists yet for this membership+sprint, telling
// useSprintPlan.ts's setLeaveEntries whether its next save is a POST or a
// PATCH (mirrors TeamSprintPlan's existing POST-vs-PATCH branching).
export interface SprintCapacity {
  teamMembershipId: string
  personId: string
  personName: string
  role: Role
  capacityPercentOverride: number | null
  effectivePercentage: number
  leaveDays: number
  // A single manually-typed extra-allocation hours figure for the sprint
  // (e.g. on-call/support duty) - see backend models/CapacityEntry.ts.
  // Comes off Available the same unscaled way leave does.
  extraHours: number
  capacityEntryId: string | null
  leaveEntries: LeaveEntry[]
  total: number
  available: number
  planned: number
  remaining: number
}

// Notes — a third, durable/organized concept alongside Todos and Scratchpad
// (see .scratch/notes-section/spec.md). Deliberately minimal: no priority,
// tags, due dates, or completion. `parentId`/`folderId` are `null` (never
// `undefined`) for a root-level folder/note, mirroring how the backend
// always writes an explicit null rather than omitting the field.
export interface NoteFolder {
  _id?: string
  id?: string
  name: string
  parentId?: string | null
  createdAt?: string
  updatedAt?: string
}

export interface Note {
  _id?: string
  id?: string
  name: string
  folderId?: string | null
  body?: JSONContent | null
  // Flat, one-directional, no-cascade grouping of linked todos' ids - see
  // the backend NoteDoc comment. A dangling id (its todo since deleted) is
  // left in place; callers resolving against a `Todo[]` are responsible for
  // tolerating a lookup miss.
  linkedTodoIds?: string[]
  createdAt?: string
  updatedAt?: string
}

// Boards - a persistent, named collection of existing todos/notes, built by
// attaching items from wherever they normally live (see
// .scratch/boards/spec.md). Strictly link-only: a Board never owns/creates a
// Todo or Note, only references one by id.
export type BoardItemType = 'Todo' | 'Note'

export interface BoardItem {
  itemType: BoardItemType
  // A dangling itemId (its Todo/Note since deleted elsewhere) is left in
  // place rather than cleaned up - see the backend BoardDoc comment. Callers
  // resolving against a Todo[]/Note[] list are responsible for tolerating a
  // lookup miss (the dangling-ref ghost card).
  itemId: string
}

export interface Board {
  _id?: string
  id?: string
  name: string
  // Flat, ordered, no-cascade reference list - array position is display
  // order, no separate order field (mirrors Todo.linkedTodoIds).
  items: BoardItem[]
  createdAt?: string
  updatedAt?: string
}

// GET /api/todos/weekly-summary's response shape - see the backend's
// packages/backend/src/utils/weeklySummaryBuckets.ts (source of truth for
// this shape) and .scratch/weekly-summary/spec.md. `weekStart`/`weekEnd` and
// every segment's `date` are local calendar-day strings ("YYYY-MM-DD"), same
// convention as Todo.dueDate. `categoryId` is bare - the frontend joins it
// against its own already-loaded `Category[]` for name/color rather than the
// backend embedding them.
export interface WeeklySummarySegment {
  date: string
  text: string
}

export interface WeeklySummaryCompletedEntry {
  id: string
  title: string
  completedAt: string
  lastSegmentBeforeCompletion: WeeklySummarySegment | null
}

export interface WeeklySummaryActionedEntry {
  id: string
  title: string
  segments: WeeklySummarySegment[]
}

export interface WeeklySummaryNoActionEntry {
  id: string
  title: string
}

export interface WeeklySummaryCategoryGroup {
  categoryId: string
  completed: WeeklySummaryCompletedEntry[]
  actioned: WeeklySummaryActionedEntry[]
  noAction: WeeklySummaryNoActionEntry[]
}

export interface WeeklySummaryResponse {
  weekStart: string
  weekEnd: string
  categories: WeeklySummaryCategoryGroup[]
}

// Threaded from App.tsx (which owns the active board via hooks/useBoards)
// down through AgendaGroups/CompletedTodos/NotesView to every quick-add
// insertion point (TodoItem, NotesView's note row) - see ticket 14
// (.scratch/boards/issues/14-quick-add-icon-and-badge.md). One shared value
// object rather than a resolved-boolean-per-row prop, so intermediate
// components that render many rows only have to thread one thing down.
// Optional on every consumer so a component test can render a row in
// isolation (no Boards context at all) and just get no icon rendered.
export interface BoardQuickAddState {
  // `${itemType}:${itemId}` keys currently on the active board - see
  // utils/boardItemKey.ts. A Set, not a per-row boolean, so this can be
  // computed once in App.tsx and handed down unchanged.
  activeItemKeys: Set<string>
  // Adds the item to the active board (or, if zero boards exist yet, opens
  // App.tsx's create-first-board prompt instead - see the spec's zero-boards
  // case). `originEl` is the clicked icon's own button element, read for its
  // bounding rect to anchor the arcing fly-to-badge animation.
  onAdd: (itemType: BoardItemType, itemId: string, label: string, originEl: HTMLElement) => void
  // Removes the item from the active board instantly - no reverse animation.
  onRemove: (itemType: BoardItemType, itemId: string) => void
}
