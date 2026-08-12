# 01 — SVAR Gantt feasibility prototype

Type: prototype
Status: open

## Question

Build a throwaway `@svar-ui/react-gantt` (open-source edition) prototype, driven by real shapes from this app's data (`TeamSprintPlan`, `SprintCapacity`, `SprintPlanEntry`), to answer:

1. Can per-row leave/holiday shading be rendered using **pre-computed** data (from the existing capacity endpoint) without needing SVAR's PRO-gated resource-calendar feature? (The research's working theory in `.scratch/sprint-gantt-chart/research/gantt-library-selection.md` §0 is that this only needs *rendering*, not a scheduling engine — confirm or refute.)
2. Can a Split ticket's Dev bar and QA bar — which may land on **different people's rows** — be visually linked or highlighted as belonging to the same ticket? This is a **hard v1 requirement** (see the map's Decided section), and the research flagged it as unresolved in every library evaluated, SVAR included. If SVAR genuinely cannot do this cleanly, this ticket must decide the fallback (e.g. `frappe-gantt` + hand-rolled link rendering, reconsidering `dhtmlx-gantt` Community's `link_class` hook, or another approach) rather than deferring the question further down the map.
3. Does dragging a bar to a new start date work in practice, and can the app read back the resulting new date (to persist as a start-date override) and the resulting new row order (to write back to `order`/`devOrder`/`qaOrder`)?
4. What should the popup/modal container look like at "larger" size holding this chart — is there an existing modal component/convention in this codebase to reuse (check `docs/ui-conventions.md` first)?

If the SVAR pick is confirmed, note any API specifics discovered (e.g. exact prop/hook names for shading, linking, drag events) so later tickets can rely on them. If SVAR is rejected, record the replacement pick and why, updating the map's Notes section accordingly.
