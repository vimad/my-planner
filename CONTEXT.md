# my-planner

A personal, single-user planner web app. This glossary covers domain terms as they get modeled — not every corner of the app has been formalized here yet.

## Language

**Team** (Sprint context):
A named group of people scoped to one or more Jira labels, used to filter a shared Jira backlog down to just that team's tickets. Independent of Profile — never bound to a profile.
_Avoid_: Board (ambiguous with the app's own Kanban `Board` model and with Jira's own "board" concept), Group.

**Person** (Sprint context):
A human team member identified by a Jira `accountId` (the actual match key against Jira ticket assignees), with a display name and email for recognition when setting up a team.
_Avoid_: User, Member.

**Role**:
A fixed job-title/seniority category (TL, ATL, SSE, SE, SQA, QA, Intern) that determines a Team Membership's default capacity percentage.
_Avoid_: Title, Position.

**Team Membership**:
The join between a Team and a Person — carries that person's Role on the team and their effective capacity percentage. A Person may hold a separate Team Membership in more than one Team.
_Avoid_: Team Member (Membership is the record; the person is a Person).

**Effective capacity percentage**:
The percentage of a sprint's working hours a Team Membership commits to delivery — an explicit per-membership override if set, otherwise the Role's default.
_Avoid_: Allocation, utilization.

**Unmapped assignee**:
A cached Jira ticket whose assignee `accountId` doesn't match any Person in the team's current Team Memberships. Computed at display time by comparing the ticket's assignee against the team's memberships — never persisted.

**Ticket** (Sprint context):
A single cached snapshot of one Jira issue (Bug, Story, Task, or Sub-task) — the one and only representation of that issue used across the Planning, Status, and Epic views. Always reflects Jira's data as of its last sync.
_Avoid_: Issue (Jira's own term; this app says Ticket to keep one word for the concept regardless of source).

**Effort**:
The delivery effort a Ticket represents, used by capacity planning math. Computed, never stored: the sum of a ticket's Sub-tasks' estimates if it has any, otherwise the ticket's own estimate.
_Avoid_: Estimate (Estimate is the raw stored Jira value per ticket; Effort is the derived planning figure).

**Sub-task kind**:
Whether a Sub-task is the `[Dev]` or `[Test]` half of its parent Story/Bug's work, parsed from its title prefix at sync time. A Sub-task or other ticket that doesn't match the convention has no kind.

**Epic**:
A cached snapshot of a Jira epic (key, title, status). Its set of child Tickets and their progress are never stored on the Epic itself — always computed by looking up Tickets that reference it.

**Status** (Sprint context):
One value from the Jira board's actual workflow column configuration (name, column order, and category), mirrored locally so the Status view's columns match the real board. Refreshed wholesale from Jira on every sync — never hand-edited.

**Sprint Plan Entry**:
The record of a Ticket having been manually added to a specific Team's plan for a specific Sprint. Exists separately from the Ticket itself so a ticket that carries over across sprints keeps appearing in every sprint's plan it was ever added to, not only whatever sprint Jira currently reports for it.
_Avoid_: conflating with a Ticket's own current-sprint field, which only ever reflects Jira's live answer.

**Team Sprint Plan**:
A Team's per-Sprint header settings — currently just the sprint's shared working-day count (holiday-adjusted, entered manually, same for every person on the team).

**Capacity Entry**:
A Team Membership's leave for one Sprint (in days, down to half-day granularity). The only per-person input to capacity planning beyond the Team Sprint Plan's shared working-day count.

**Capacity Lookup**:
An editable, admin-maintained table of hours for a given (capacity percentage, effective working days) pair, used as a shortcut for common combinations instead of always computing from the plain formula. Falls back to the plain calculation whenever no matching row exists.

**Total / Available / Planned / Remaining** (capacity figures):
The four figures shown per person in the Planning view for a given Team+Sprint. *Total* = the person's leave-adjusted working hours for the sprint. *Available* = Total scaled by their effective capacity percentage (via Capacity Lookup or the plain formula). *Planned* = summed Effort of tickets in that Sprint Plan currently assigned to them in Jira. *Remaining* = Available minus Planned.

**Full sync**:
A sync that fetches a Ticket's complete field set (status, estimate, labels, stream, epic/parent links). Used by Planning, which needs every field to compute Effort and the capacity figures.
_Avoid_: conflating with Lightweight sync.

**Lightweight sync**:
A sync that fetches only a Ticket's title and status. Used by the Status view's per-person sync to limit API calls; a Ticket discovered only this way has all other fields `null` until a Full sync (e.g. via Planning) fills them in.
