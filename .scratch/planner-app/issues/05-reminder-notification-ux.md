# Reminder & Notification UX

Type: grilling
Status: resolved

## Question

How should in-app reminders work? Locked during charting: in-app only, no OS/browser push. Still open:

- When does a reminder trigger relative to a todo's due date (e.g. on the day, some lead time before, at open-time only)?
- Where does it surface in the UI (banner, badge/count, toast, dedicated panel)?
- Can a reminder be snoozed or dismissed, and does dismissal persist?
- Does it respect priority/category (e.g. only High-priority items get a prominent reminder)?
- Does it interact with the today-highlight behavior recorded in the map's Notes, or is that a separate mechanism?

## Answer

**Reversed from charting: no reminders or notifications at all.** The user decided the feature isn't needed — reminders were tentatively scoped in during charting, but on reaching this ticket the call was made not to build any reminder/notification mechanism, in-app or otherwise. The dashboard's automatic today-highlight behavior (todos due today are visually highlighted wherever they appear — decided during charting, unaffected by this) is considered sufficient for surfacing due items; no separate reminder/alert system is needed on top of it.
