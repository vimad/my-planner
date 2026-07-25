# Recurring Todo Behavior

Type: grilling
Status: resolved

## Question

How should recurring todos work? In scope per charting, details not yet decided:

- What recurrence patterns are supported (daily/weekly/monthly/custom interval)?
- How are new instances created — immediately upon completing the current one, or on a schedule regardless of completion?
- What happens to a recurring todo's category, priority, tags, and rich-text body across instances — copied each time, editable per-instance, or locked to the template?
- Does completing one instance count toward the "remaining/completed" category counts recorded in the map's Notes, or are recurring todos counted differently?
- Can a recurring todo be created via scratchpad promotion, or only directly?

## Answer

- **Patterns**: simple presets only — Daily / Weekly / Monthly. No custom interval or specific-weekday selection.
- **Instance creation**: the next instance is created immediately when the current one is completed, with its due date advanced by the recurrence interval. If an instance is never completed, no new instance appears — it just sits overdue.
- **Content per instance**: each new instance starts as a copy of the template's category, priority, tags, and rich-text body, but is then freely editable per-instance — editing one instance doesn't affect past or future ones.
- **Counts**: recurring instances count toward a category's remaining/completed totals exactly like any other todo; no special-casing.
- **Scratchpad**: recurrence can only be set up via direct todo creation/editing, not through scratchpad line-promotion. Promoted todos are one-off by default; can be turned into a recurring todo afterward by editing.
- **Stopping recurrence**: recurrence is just a property on the current open instance. Turning it off (or deleting that instance) stops future instances — there's no separate "series" entity to manage.
