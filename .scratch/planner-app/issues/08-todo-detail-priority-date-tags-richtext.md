# 08 — Todo detail: priority, due date, tags, category, rich-text body

**What to build:** Opening a todo lets the user set priority, due date, category, free-form tags (with autocomplete), and a rich-text body — written and viewed with the same Tiptap editor, so formatting like bullets and checklists renders correctly in both modes.

**Blocked by:** 07 — Todos: quick-add, Date Agenda dashboard, complete/reopen

**Status:** ready-for-agent

- [ ] Todo model/routes extended to accept `priority` (`High` / `Medium` / `Low`, default `Medium`), `tags` (array of strings), `categoryId` (reassignable), and `body` (Tiptap JSON document)
- [ ] Opening a todo shows a detail/edit view where priority, due date, category, and tags can all be set or changed
- [ ] Tag input offers autocomplete drawn from tags already used on other todos, backed by a distinct-tags endpoint
- [ ] The todo body is edited using Tiptap — `@tiptap/core`, `@tiptap/react`, `@tiptap/starter-kit`, `@tiptap/extension-list` with `TaskItem.configure({ nested: true })` for nested checklists — per [Rich Text Editor Library](../issues/01-rich-text-editor-library.md)
- [ ] The same Tiptap `Editor` instance and JSON document render the body in both edit mode and a read-only view mode (`editable: false`) — no separate renderer for viewing vs. editing
- [ ] The dashboard agenda can be ordered by priority
- [ ] Backend routes are tested via `createApp()` + supertest with mocked models
- [ ] Frontend detail view (priority/date/tag/category editing, rich-text edit/view toggle) is tested via React Testing Library
