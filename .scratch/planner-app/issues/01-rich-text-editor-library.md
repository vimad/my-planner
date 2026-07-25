# Rich Text Editor Library

Type: research
Status: resolved

## Question

Which rich-text editor library should the planner app use for todo bodies and scratch notes?

Requirements:
- Supports: bullet & numbered lists, bold/italic/basic inline styling, checklists (nested sub-tasks with interactive checkboxes), headings, and links.
- Free, open-source, well-maintained, popular, and modern.
- Compatible with React 19 + Vite (see repo `packages/frontend/package.json`).
- Supports a clean "view mode" — rendering saved content read-only with formatting intact (e.g. bullets visible without the editor chrome) — and an "edit mode" using the same editor/data format, since the app needs both.
- Reasonable bundle size and active maintenance (recent releases, real adoption).

Evaluate concrete candidates (e.g. Tiptap, Lexical, BlockNote, Plate, Slate) against the above and recommend one, with the tradeoffs that ruled out the others.

## Answer

**Use Tiptap** (`@tiptap/core` + `@tiptap/react` + `@tiptap/starter-kit` + `@tiptap/extension-list`) for both todo bodies and scratch notes. It has an explicit `^19.0.0` React peerDependency, a documented native nested-checklist flag (`TaskItem.configure({ nested: true })`), and view/edit modes that are literally the same `Editor` instance and JSON document with a single `editable: false` toggle — no separate renderer to drift out of sync. It also leads the field on adoption (37.8K GitHub stars, ~12–15.5M weekly npm downloads) and release cadence, carries a plain MIT license, and lands at a moderate ~120–140 KB gzip for the required feature set — well under BlockNote's ~400–460 KB. Lexical was the closest runner-up (same one-editor read-only pattern, but a less explicit React 19 peer range and lower adoption); BlockNote had the cleanest native block-nesting but is oversized and split-licensed (MPL-2.0/GPL-3.0); Plate is a plugin layer over Slate with a separate `<PlateStatic>` read-only renderer (two code paths, not one flag); Slate was ruled out outright since it has no built-in rich-text schema at all.

Full findings and citations: [01-rich-text-editor-library-findings.md](01-rich-text-editor-library-findings.md)
