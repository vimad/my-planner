# 07 — Frontend: components, part 2 (complex)

**What to build:** Convert the remaining, more complex React components (and their tests) to `.tsx`: `RichTextEditor`, `Scratchpad`, `ScratchNoteCard`, `TodoItem`, `TodoQuickAdd`, `TodoDetail`, `AgendaGroups`, `CompletedTodos`.

**Blocked by:** 06

**Status:** ready-for-agent

## Context

Same tooling setup as Issue 06 (React 19 + Vite/esbuild transpiling, `tsc` type-check-only, `strict: true`). These components are heavier: `RichTextEditor`/`Scratchpad`/`ScratchNoteCard` wrap Tiptap (`@tiptap/react`, `@tiptap/core`, `@tiptap/starter-kit`, `@tiptap/extension-link`, `@tiptap/extension-list`, `@tiptap/extension-underline`) which ships its own types — use them rather than re-declaring editor types. `TodoDetail`/`TodoItem` are where drag-and-drop reordering of linked todos lives (`@dnd-kit/core`, `@dnd-kit/sortable`, `@dnd-kit/utilities`, added recently per git history) — dnd-kit ships types too.

Prop types should be explicit `interface`s, matching real usage at call sites (check `App.jsx`/`TodoDetail.jsx` for how each is actually invoked before typing its props). The `Todo`/`ScratchNote`/`Category` document shapes from the backend (Issue 02) are a different type domain than the frontend — the frontend receives plain JSON over HTTP, not Mongoose documents, so define frontend-side interfaces for these shapes (e.g. in a shared `src/types.ts` if that doesn't already exist by this point, or per-file) rather than importing backend Mongoose types across the package boundary.

## Tasks

- [x] Convert `packages/frontend/src/components/RichTextEditor.jsx` → `.tsx`, plus `RichTextEditor.test.jsx`.
- [x] Convert `packages/frontend/src/components/Scratchpad.jsx` → `.tsx`, plus `Scratchpad.test.jsx`.
- [x] Convert `packages/frontend/src/components/ScratchNoteCard.jsx` → `.tsx`, plus `ScratchNoteCard.test.jsx`.
- [x] Convert `packages/frontend/src/components/TodoItem.jsx` → `.tsx`.
- [x] Convert `packages/frontend/src/components/TodoQuickAdd.jsx` → `.tsx`, plus `TodoQuickAdd.test.jsx`.
- [x] Convert `packages/frontend/src/components/TodoDetail.jsx` → `.tsx`, plus `TodoDetail.test.jsx`.
- [x] Convert `packages/frontend/src/components/AgendaGroups.jsx` → `.tsx`, plus `AgendaGroups.test.jsx`.
- [x] Convert `packages/frontend/src/components/CompletedTodos.jsx` → `.tsx`.
- [x] If you introduce a shared `src/types.ts` (or similar) for `Todo`/`Category`/`ScratchNote` frontend shapes, note that decision here under `## Comments` so Issue 08 (App.jsx) and Issue 05-adjacent code can be checked for consistency with it.
- [x] Run `pnpm --filter frontend typecheck` — zero errors for these files.
- [x] Run `pnpm --filter frontend test` — must stay green.
- [x] Run `pnpm --filter frontend dev`, open the app, sanity-check the scratchpad (rich text editing, promoting a note to a todo), todo quick-add, todo detail view (including the linked-todos drag-reorder), and completed-todos list. Per root `CLAUDE.md`: do all of this against the `Test` category only, and delete any `Test`-category todos/notes you create once done.

## Comments

**Files converted (all via `git mv` to preserve history, then rewritten with types):** `RichTextEditor.tsx`/`.test.tsx`, `Scratchpad.tsx`/`.test.tsx`, `ScratchNoteCard.tsx`/`.test.tsx`, `TodoItem.tsx` (no test file existed), `TodoQuickAdd.tsx`/`.test.tsx`, `TodoDetail.tsx`/`.test.tsx`, `AgendaGroups.tsx`/`.test.tsx`, `CompletedTodos.tsx` (no test file existed). Verified against the actual directory listing first — matches the task list exactly, no extra/missing files.

**Introduced `packages/frontend/src/types.ts`** — the shared `Todo`/`Category`/`ScratchNote` frontend JSON shapes this issue's context called for. **Load-bearing for Issue 08** (`App.jsx`) and worth double-checking against Issue 05's `dateAgenda.ts`/`getId.ts` and Issue 06's per-component `CategoryChipCategory`/`MiniCalendarTodo` interfaces for consistency:

```ts
export type TodoPriority = 'High' | 'Medium' | 'Low'

export interface TodoRecurrence {
  pattern: 'daily' | 'weekly' | 'monthly'
}

export interface Todo {
  _id?: string
  id?: string
  title: string                    // the only required field - see below
  categoryId?: string
  completed?: boolean
  dueDate?: string | null
  priority?: TodoPriority
  tags?: string[]
  officeLinked?: boolean
  body?: JSONContent | null        // from '@tiptap/core'
  recurrence?: TodoRecurrence | null
  linkedTodoIds?: string[]
  createdAt?: string
  updatedAt?: string
}

export interface Category {
  _id?: string
  id?: string
  name: string
  color: string
  system?: boolean
  remaining?: number
  completed?: number
}

export interface ScratchLine {
  id: string
  content: JSONContent | null
  promotedTodoId?: string | null
}

export interface ScratchNote {
  _id?: string
  id?: string
  body: ScratchLine[]
  archived?: boolean
  createdAt?: string
  updatedAt?: string
}
```

**Design decision — only `Todo.title` (and `Category.name`/`color`) are required, everything else optional:** `Todo` has to describe two different runtime shapes with one type — a fully-hydrated todo from `GET /api/todos` (every field present) *and* the in-memory draft `TodoDetail` is opened with for the "new todo" popup (`{ title: draftTitle }`, no `_id` yet, see `App.jsx`'s `handleOpenFullTodo`/`draftTodo`). Making everything but `title` optional lets both flow through the same `Todo` type without a cast or a second "draft" type. `TodoItem`/`AgendaGroups`/`CompletedTodos` only ever receive persisted todos at runtime (sourced from the app-wide `todos` list) but are typed against the same loose `Todo` for consistency — Issue 08 could tighten this with a `PersistedTodo extends Todo { _id: string }` if it turns out to matter, but nothing in this issue needed it.

**Reconciling with Issue 05/06's existing narrower types:** left `dateAgenda.ts`'s `DueDateFields`, `getId.ts`'s `WithId`, `CategoryChip.tsx`'s `CategoryChipCategory`, and `MiniCalendar.tsx`'s `MiniCalendarTodo` untouched, per those files not being in this issue's scope — confirmed all four are structurally compatible with the new `Todo`/`Category` (a `Todo`/`Category` value satisfies each of them), so nothing downstream broke. `RichTextEditor.tsx` exports its own `RichTextEditorHandle` interface (`{ getJSON: () => JSONContent | null }`) for the `forwardRef` imperative handle — not part of `types.ts` since it's Tiptap-specific plumbing, not a data shape.

**Tiptap types:** used `JSONContent` and `Editor` imported from `@tiptap/core`/`@tiptap/react` directly (`@tiptap/react` re-exports everything from `@tiptap/core`) — no redeclaration. `RichTextEditor`'s toolbar mark buttons are typed via a `ToggleableMark = 'bold' | 'italic' | 'underline' | 'strike'` union (a subset of a local `ToolbarState` interface) so `state[mark]` indexing and `editor.chain().focus().toggleMark(mark)` both stay type-safe without `any`.

**dnd-kit types:** `TodoDetail.tsx` imports `DragEndEvent` (type-only) from `@dnd-kit/core`; `useSortable`, `arrayMove`, `sortableKeyboardCoordinates`, `verticalListSortingStrategy` from `@dnd-kit/sortable`; `CSS` from `@dnd-kit/utilities` — all used as shipped, no redeclaration. `TodoDetail.test.tsx`'s `vi.mock('@dnd-kit/core' | '@dnd-kit/sortable', ...)` stubs needed `importOriginal<typeof import('@dnd-kit/core')>()` (generic type argument) to fix `TS2698: Spread types may only be created from object types` on `...actual` — `importOriginal()` returns `unknown` by default. The mocked `DndContext`'s captured `onDragEnd` is only ever invoked by the test with a partial `{ active: { id }, over: { id } }` object (real `DragEndEvent` also requires `activatorEvent`/`collisions`/`delta`, which `handleDragEnd` never reads) — cast with `as DragEndEvent` at the call site rather than loosening the production type.

**`todosList` refactor in `TodoDetail.tsx` (type-only, no behavior change):** introduced `const todosList: Todo[] = todos ?? []` right after `canLink` is computed, and used it everywhere the original code used the possibly-`undefined` `todos` prop directly (`linked`, `results`, `reorderLinkedIds(...)`, `handleDragEnd`). `canLink = !isNew && Array.isArray(todos)` is a runtime invariant TS can't follow across separate variables, so without this the compiler would flag every `todos.find(...)`/`todos.filter(...)` as possibly-undefined even though they're only ever reached when `canLink` (and therefore `todos`) is truthy. `todosList === todos` whenever it's actually read (canLink is false ⇒ the read never happens), so this is a pure type-narrowing convenience, not a semantic change.

**Other small type-driven adjustments, all behavior-preserving or behavior-improving (not behavior-regressing):**
- `TodoQuickAdd`'s `onOpenFull` prop is now optional (`onOpenFull?: (title: string) => void`) with the call site changed to `onOpenFull?.(title.trim())`. The plain-JS original called it unconditionally, which would throw if a caller omitted it and the user pressed Shift+Enter — App.jsx always passes it, so this was latent/untested; making it optional turns a hypothetical crash into a no-op, it doesn't remove any exercised behavior (confirmed by the existing test that renders `<TodoQuickAdd onAdd={onAdd} />` with no `onOpenFull` and never presses Shift+Enter).
- `TodoDetail`'s `onSaveLinkedTodo`/`onReorderLinkedTodos` props are optional for the same reason (the new-todo popup in `App.jsx` never passes them), called via `?.()`.
- `TodoItem`/`AgendaGroups`/`CompletedTodos`/`Scratchpad` all normalize a possibly-`undefined` `getId(...)` result via `String(getId(x))` before passing it to a callback typed as `(id: string) => void` — this exact `String(getId(...))` pattern (not `?? ''`) already existed in the original `TodoDetail.jsx`'s `todoKey` helper and in `ScratchNoteCard.jsx`'s category-id handling, so it's consistent with pre-existing codebase convention, not a new one.
- `AgendaGroups`/`CompletedTodos` look up `categoriesById?.[todo.categoryId ?? '']` (added the `?? ''`) since `Todo.categoryId` is optional but `Record<string, Category>` indexing needs a definite string — a lookup miss (`undefined` category) behaves identically whether the key was `undefined` or `''`, since neither is ever a real category id.

**Verification — all green:**
- `pnpm --filter frontend typecheck` → exit 0, zero errors.
- `pnpm --filter frontend test` → 11 files / 104 tests passed, unchanged from Issue 06's baseline (no tests removed; the object-literal typing fixes needed in test files — see below — didn't change any assertions).
- `pnpm --filter frontend lint` (oxlint) → one warning, `Scratchpad.tsx:21` (`react(only-export-components)`, because `splitIntoLines` is exported alongside the component) — confirmed via `git show HEAD:.../Scratchpad.jsx` that this exact export shape already existed pre-conversion, so it's not a regression introduced here (same class of pre-existing warning noted in Issue 05's comments for the old `Scratchpad.jsx`).
- Test-file-only fixes needed to satisfy `strict: true` (no production-code behavior changes): typed inline `Todo[]`/`Category[]`/`Todo` fixture consts explicitly (plain object-literal array consts get widened to `string` for `priority`/`recurrence.pattern` otherwise, since nothing pins them to the literal union); added `color` to test `categories` fixtures (was missing, `Category.color` is required); changed bare `vi.fn().mockResolvedValue()` to `.mockResolvedValue(undefined)` (this vitest version's typings require an explicit argument); `input.closest('form')` → `input.closest('form')!` (non-null assertion, DOM API returns `Element | null`).
- `pnpm --filter frontend dev` → booted on port 5175 (5173/5174 already in use by other running instances, per the same pattern noted in Issues 01/05/06 — left untouched, killed only the instance started here). Browser-driven sanity check via chrome-devtools MCP, entirely read-only against real data except where noted:
  - Opened a real todo's detail view ("Meeting discussion - 07/28", 8 linked todos) — Notes tab renders correctly (title/priority/due date/category/tags/recurrence/rich-text body), switched to the Todos tab and confirmed the linked-todos list renders with working drag handles (`Reorder …` buttons) and unlink controls, selected a linked todo and confirmed its notes (a bulleted list) render correctly via `RichTextEditor`. Closed via **Cancel** (never Save); a follow-up snapshot confirmed the agenda list was unchanged afterward. No real todo was created, edited, linked, completed, or deleted.
  - Verified `CompletedTodos` (toggled "Show completed") renders the completed list correctly, including a `linkify`-rendered clickable URL in one todo's title.
  - `Test`-category flow (category already existed, reused it): typed a note in the Scratchpad capture bar, saved it (creates a `ScratchNote`, not a todo — always safe), opened the sessions panel, selected the line, promoted it with category = `Test` → created a real `Todo` in the `Test` category, confirmed via its detail view that `categoryId` resolved to `Test`. Closed that dialog via Cancel, then deleted the `Test`-category todo (via its own Delete + Confirm) and the scratch note (via Delete note + Confirm) to leave `Test` empty again. Sessions count and agenda list both back to their pre-test state afterward.
  - Killed only the dev server process this session started (port 5175); left the pre-existing 5173/5174 instances and the backend (port 4100) untouched, per the same convention as prior issues.

**No deviations from the issue's scope:** did not touch `App.jsx`, `main.jsx`, `vite.config.js`, `prototype-views/`, or anything under `packages/backend`.
