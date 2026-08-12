# An Assignee Override always wins over Jira, once set

Extends [ADR 0004](0004-dev-qa-override-wins-over-jira-resync.md)'s reasoning to non-split tickets (Task/Sub-task). A `Dev/QA Override` lets a Split ticket's dev or qa Role assignment be picked manually; an `Assignee Override` is the same idea for a non-split ticket's single owner - a Planning-only annotation, stored in its own collection so a Jira resync never touches it, that keeps winning over the ticket's own `assigneeAccountId` once set, even if Jira later reassigns the ticket to someone else.

The same rejected alternative applies here as in ADR 0004: letting Jira's assignee automatically supersede the Override once it changes would reshuffle a deliberate planning decision the next time someone clicks "Sync plan," without anyone asking for that change. An Assignee Override exists specifically so the team can plan around someone other than Jira's assignee - self-healing back to Jira would defeat that.

Unlike a Dev/QA Override, an Assignee Override also shifts the ticket's Effort out of the Planned figure of whoever Jira lists as assignee and into the Override's pick instead (`packages/backend/src/routes/capacity.ts`) - the capacity cards and the Planning table's placement must never disagree about who currently owns a ticket.
