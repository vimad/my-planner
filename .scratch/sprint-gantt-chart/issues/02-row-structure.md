# 02 — Row structure: mixed or split Dev/QA sub-rows

Type: grilling
Status: open

## Question

Should each person get a **single** Gantt row mixing their Dev-role and QA-role ticket placements together (e.g. sorted by computed start date), or **two sub-rows** per person — one for Dev placements, one for QA placements?

Context: a person can appear in both the `devOrder` and `qaOrder` namespaces across different Split tickets (`SprintPlanEntry.devQa`), and these are independent per-role rank namespaces today. Consider:
- How `PlanningView.tsx` currently visualizes a person's Dev-role vs QA-role ticket lists (are they already visually separated?).
- Which framing better matches "person-wise view" as the user described it.
- How this choice affects Ticket 04's placement-algorithm cursor: one walk-forward cursor per person, or one per person-per-role (since Dev and QA work for the same person may need to happen concurrently, not sequentially, if they're separate capacity pools).
