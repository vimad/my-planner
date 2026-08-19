# Task dependency & risk rules

Type: grilling
Status: open

## Question

Define task-level business rules:

- The exact auto-risk rule — e.g. how many days past the end date, or how close to it, does auto-flagging kick in? Does it consider status (only flag if not yet Done)?
- Can a task's "blocked by" links point to tasks in other epics, or are dependencies scoped to the same epic only?
- How are circular dependencies prevented or handled?
- What happens to a task's local annotations (notes, dates, risk, dependencies) if the underlying Jira issue is deleted or reparented to a different epic on a later sync?
