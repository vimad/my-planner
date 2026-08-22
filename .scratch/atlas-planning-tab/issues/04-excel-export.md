# 04 — Excel export

**What to build:** An export button on the Planning tab that downloads an `.xlsx` snapshot of the current plan: one sheet listing each roster member, their attached ticket keys, and their leave day count/dates within the current rolling window. Follows the same split used by `sprintExport.ts`/`todosExport.ts`: a pure, unit-testable "build the array-of-arrays" function plus a thin `xlsx`-writing wrapper, including the `isTauri()` branch so the desktop app uses its native save dialog instead of a browser blob download. The button is disabled (with an explanatory title/tooltip) when there's nothing to export.

**Blocked by:** 01 (ticket/person data), 02 (leave data). Independent of 03 — can be built in parallel with the Gantt chart once 02 lands.

- [ ] Pure builder function (working name `buildAtlasPlanningExport`) takes the table + leave data and returns the array-of-arrays for the sheet — no side effects, no `xlsx` import.
- [ ] Thin wrapper function calls `XLSX.writeFile`/equivalent, branching on `isTauri()` to use the desktop save dialog + fs plugin instead of a blob download, matching the existing exporters' pattern exactly.
- [ ] New button component (working name `AtlasPlanningExportButton`), placed in the Planning tab's header row next to other action buttons, using the same outline-button class string the existing export buttons use.
- [ ] Button is disabled with a `title` explaining why when the roster is empty or has no attached tickets/leave to export.
- [ ] Co-located `*.test.ts` for the pure builder function (prior art: `sprintExport.test.ts`) covering at least: multiple people with tickets, a person with none, leave days present vs. absent.
- [ ] Co-located component test for the button's disabled/enabled state.
