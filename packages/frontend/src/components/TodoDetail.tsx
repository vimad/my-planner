import type { JSONContent } from '@tiptap/core'
import { DndContext, KeyboardSensor, PointerSensor, closestCenter, useSensor, useSensors } from '@dnd-kit/core'
import type { DragEndEvent } from '@dnd-kit/core'
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { useRef, useState } from 'react'
import { getId } from '../utils/getId'
import type { Category, Todo, TodoPriority, TodoRecurrence } from '../types'
import { ExpandableNotesEditor } from './ExpandableNotesEditor'
import type { RichTextEditorHandle } from './RichTextEditor'
import { TagInput } from './TagInput'
import { TodoSummaryHeader } from './TodoSummaryHeader'

const PRIORITIES: TodoPriority[] = ['High', 'Medium', 'Low']

// Simple presets only, per the spec — no custom interval/weekday selection.
// The 'none' option maps to a null recurrence (turns recurrence off).
type RecurrenceOptionValue = 'none' | TodoRecurrence['pattern']

const RECURRENCE_OPTIONS: { value: RecurrenceOptionValue; label: string }[] = [
  { value: 'none', label: 'None' },
  { value: 'daily', label: 'Daily' },
  { value: 'weekly', label: 'Weekly' },
  { value: 'monthly', label: 'Monthly' },
]

function todoKey(todo: Todo): string {
  return String(getId(todo))
}

// Reorders the *visible* (resolvable) ids per the drag result while leaving
// any dangling id (its todo since deleted) at its original index - dragging
// only ever reorders what's actually rendered, never resolves or discards a
// dangling reference.
function reorderLinkedIds(fullIds: string[], todosList: Todo[], activeId: string, overId: string): string[] {
  const isResolvable = (linkId: string) => todosList.some((t) => todoKey(t) === linkId)
  const resolvedIds = fullIds.filter(isResolvable)
  const oldIndex = resolvedIds.indexOf(activeId)
  const newIndex = resolvedIds.indexOf(overId)
  if (oldIndex === -1 || newIndex === -1) return fullIds
  const reordered = arrayMove(resolvedIds, oldIndex, newIndex)
  let cursor = 0
  return fullIds.map((linkId) => (isResolvable(linkId) ? reordered[cursor++] : linkId))
}

interface SortableLinkedTodoRowProps {
  todo: Todo
  selected: boolean
  onSelect: (id: string) => void
  onUnlink: (id: string) => void
}

// One row in the linked-todos list. The drag handle is the sole
// draggable/sortable affordance - the row's own click-to-select and the
// unlink "×" keep working unchanged, same as before this feature.
function SortableLinkedTodoRow({ todo: t, selected, onSelect, onUnlink }: SortableLinkedTodoRowProps) {
  const key = todoKey(t)
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: key })
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  }

  return (
    <div
      ref={setNodeRef}
      style={style}
      role="button"
      tabIndex={0}
      onClick={() => onSelect(key)}
      className={`flex items-center gap-1.5 rounded-lg border px-2 py-2 text-sm transition ${
        selected
          ? 'border-fuchsia-400/60 bg-fuchsia-50 dark:border-fuchsia-400/60 dark:bg-fuchsia-500/10'
          : 'border-slate-200 bg-slate-50 hover:bg-slate-100 dark:border-white/10 dark:bg-white/5 dark:hover:bg-white/10'
      } ${isDragging ? 'opacity-50' : ''}`}
    >
      <button
        type="button"
        aria-label={`Reorder ${t.title}`}
        {...attributes}
        {...listeners}
        onClick={(e) => e.stopPropagation()}
        className="shrink-0 cursor-grab touch-none rounded px-1 text-slate-400 hover:bg-slate-200 hover:text-slate-700 active:cursor-grabbing dark:hover:bg-white/10 dark:hover:text-slate-200"
      >
        ⠿
      </button>
      <span className="min-w-0 flex-1 truncate text-slate-800 dark:text-slate-100">{t.title}</span>
      <button
        type="button"
        aria-label={`Unlink ${t.title}`}
        onClick={(e) => {
          e.stopPropagation()
          onUnlink(key)
        }}
        className="shrink-0 rounded-full px-1.5 text-slate-400 hover:bg-slate-200 hover:text-slate-700 dark:hover:bg-white/10 dark:hover:text-slate-200"
      >
        ×
      </button>
    </div>
  )
}

interface CollapsedHeaderProps {
  title: string
  priority: TodoPriority
  dueDate: string
  category?: Category
  onClose: () => void
}

// Compact read-only stand-in for the editable header, shown on the Todos tab
// so the widened linking workspace doesn't compete with a full edit form the
// user isn't using in that moment. The display bits themselves live in the
// shared TodoSummaryHeader (also reused by Board todo-cards); this just adds
// the Close affordance a board card has no use for.
function CollapsedHeader({ title, priority, dueDate, category, onClose }: CollapsedHeaderProps) {
  return (
    <div className="mb-3 flex items-start justify-between gap-3">
      <TodoSummaryHeader title={title} priority={priority} dueDate={dueDate} category={category} />
      <button
        type="button"
        aria-label="Close"
        onClick={onClose}
        className="shrink-0 rounded-full px-2 py-0.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-white/10 dark:hover:text-slate-200"
      >
        ×
      </button>
    </div>
  )
}

// Patch shape sent to onSave - matches the backend's PATCH/POST /api/todos
// body exactly (see App.jsx's handleUpdateTodo/handleCreateTodoDetailed).
// linkedTodoIds is only included when linking is enabled (`canLink`), same
// as the JS spread it replaces.
export interface TodoSavePatch {
  title: string
  priority: TodoPriority
  dueDate: string | null
  categoryId: string
  tags: string[]
  body: JSONContent | null
  recurrence: TodoRecurrence | null
  officeLinked: boolean
  linkedTodoIds?: string[]
}

interface TodoDetailProps {
  todo: Todo
  categories: Category[]
  availableTags: string[]
  // Opt-in: omitting it (as the new-todo popup does) hides the Todos tab -
  // see the module doc comment below.
  todos?: Todo[]
  onClose: () => void
  onSave: (id: string | undefined, patch: TodoSavePatch) => Promise<void> | void
  // Persists a single todo's `body` by id, independent of `onSave` — used by
  // both the parent's own notes Save button (called with this todo's own
  // id) and the linked-notes panel's Save button (called with the selected
  // linked todo's id). Omitted for the new-todo popup, which has no id yet.
  onSaveNotes?: (id: string, patch: { body: JSONContent | null }) => Promise<void> | void
  onReorderLinkedTodos?: (id: string | undefined, patch: { linkedTodoIds: string[] }) => Promise<boolean> | boolean
  // Renders a "Mark complete" button in the footer for an existing,
  // not-yet-completed todo. Fired with the todo's id - the caller (App.tsx)
  // owns confirmation and the "Add followup" checkbox via the shared
  // ConfirmDialog, same as the todo-list checkbox's mark-complete flow, so
  // this component doesn't duplicate that UI.
  onMarkComplete?: (id: string) => void
}

// In-page overlay (no routing) for viewing/editing a single todo's detail:
// priority, due date, category, tags, recurrence, rich-text body, and (when
// a `todos` list is supplied) linked todos.
//
// Doubles as the "full add" popup for a brand-new todo: pass a todo-like
// object with no _id/id (e.g. { title: draftTitle }) and `isNew` is inferred
// from that missing id. onSave is still called as onSave(id, patch); for a
// new todo, id is undefined and the caller is expected to create rather than
// update.
//
// Linking other todos is opt-in via the `todos` prop (the full todo list) —
// omitting it (as the new-todo popup does) hides the Todos tab entirely,
// since a brand-new todo has no id yet to link against. `onSaveNotes`
// persists a single todo's body independently by id — the parent's own
// notes (via its own Save button) or a linked todo's notes — without
// closing this popup — distinct from `onSave`, which saves every field of
// the currently open (parent) todo at once. `onReorderLinkedTodos` persists
// a drag reorder of the linked list immediately (optimistic, with rollback
// on failure) — distinct from both of the above, and independent of the
// parent's own Save/Cancel footer.
export function TodoDetail({
  todo,
  categories,
  availableTags,
  todos,
  onClose,
  onSave,
  onSaveNotes,
  onReorderLinkedTodos,
  onMarkComplete,
}: TodoDetailProps) {
  const id = getId(todo)
  const isNew = !id
  const canLink = !isNew && Array.isArray(todos)
  // Guaranteed non-empty-array whenever canLink is true - lets the rest of
  // the component avoid re-deriving/narrowing `todos` (possibly undefined)
  // at every use site.
  const todosList: Todo[] = todos ?? []

  const [title, setTitle] = useState(todo.title ?? '')
  const [priority, setPriority] = useState<TodoPriority>(todo.priority ?? 'Medium')
  // Native <input type="date">'s string value is used directly - never
  // round-tripped through a Date object, to avoid local/UTC day-shift bugs.
  const [dueDate, setDueDate] = useState(todo.dueDate ?? '')
  // A new todo has no categoryId yet - default to the first available
  // category rather than '', which would fail the backend's ObjectId cast.
  const [categoryId, setCategoryId] = useState(
    String(todo.categoryId ?? getId(categories[0]) ?? ''),
  )
  const [tags, setTags] = useState<string[]>(todo.tags ?? [])
  const [recurrence, setRecurrence] = useState<RecurrenceOptionValue>(todo.recurrence?.pattern ?? 'none')
  const [officeLinked, setOfficeLinked] = useState(Boolean(todo.officeLinked))
  const [saving, setSaving] = useState(false)
  // Whether the parent todo's own notes box currently differs from
  // `todo.body` (the real database value) - drives the light accent border
  // and the independent notes Save button, both shown only for an existing
  // todo (a new todo has no id yet to save against, see `isNew` below).
  const [notesDirty, setNotesDirty] = useState(false)
  const [savingNotes, setSavingNotes] = useState(false)
  const bodyRef = useRef<RichTextEditorHandle>(null)

  // Local, staged list of linked todo ids - committed to the backend only
  // when the parent's own Save button is clicked, same as `tags` above.
  const [linkedTodoIds, setLinkedTodoIds] = useState<string[]>(() => (todo.linkedTodoIds ?? []).map(String))
  const [tab, setTab] = useState<'notes' | 'todos'>('notes')
  const [query, setQuery] = useState('')
  const [selectedLinkedId, setSelectedLinkedId] = useState<string | null>(null)
  const [savingLinkedNotes, setSavingLinkedNotes] = useState(false)
  // Whether the selected linked todo's notes box currently differs from its
  // own `body` (the real database value) - same role as `notesDirty` above,
  // but for whichever linked todo is currently selected on the Todos tab.
  // Reset explicitly on selection change (see `selectLinked`/`handleUnlink`
  // below) so a stale true from the previously-selected todo can't flash the
  // border/Save button for a newly-selected, actually-clean todo before the
  // freshly-mounted editor's own onDirtyChange corrects it.
  const [linkedNotesDirty, setLinkedNotesDirty] = useState(false)
  // The RichTextEditor for the parent's own body and for a selected linked
  // todo's notes are both conditionally rendered (tab, and which linked todo
  // is selected) - capture their live document into these overrides before
  // unmounting, so switching back shows unsaved edits rather than the stale
  // prop.
  const [bodyOverride, setBodyOverride] = useState<JSONContent | null>(null)
  const [linkedNotesOverrides, setLinkedNotesOverrides] = useState<Record<string, JSONContent | null>>({})
  const linkedNotesRef = useRef<RichTextEditorHandle>(null)

  function captureOpenEditors() {
    if (tab === 'notes' && bodyRef.current) setBodyOverride(bodyRef.current.getJSON())
    if (selectedLinkedId && linkedNotesRef.current) {
      const json = linkedNotesRef.current.getJSON()
      setLinkedNotesOverrides((prev) => ({ ...prev, [selectedLinkedId]: json }))
    }
  }

  function switchTab(key: 'notes' | 'todos') {
    captureOpenEditors()
    setTab(key)
  }

  function selectLinked(linkId: string) {
    captureOpenEditors()
    setSelectedLinkedId(linkId)
    setLinkedNotesDirty(false)
  }

  function handleLink(childId: string) {
    setLinkedTodoIds((prev) => [...prev, childId])
    setQuery('')
  }

  function handleUnlink(childId: string) {
    setLinkedTodoIds((prev) => prev.filter((linkedId) => linkedId !== childId))
    if (selectedLinkedId === childId) {
      setSelectedLinkedId(null)
      setLinkedNotesDirty(false)
    }
  }

  const dragSensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )

  // Persists immediately on drop, independent of the parent's own Save
  // button (unlike link/unlink above, which only stage `linkedTodoIds`
  // locally). Optimistic: the list reorders right away, then rolls back to
  // the pre-drag order if the PATCH fails.
  async function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event
    if (!over || active.id === over.id) return
    const activeId = String(active.id)
    const overId = String(over.id)
    const previous = linkedTodoIds
    const next = reorderLinkedIds(linkedTodoIds, todosList, activeId, overId)
    setLinkedTodoIds(next)
    const ok = await onReorderLinkedTodos?.(id, { linkedTodoIds: next })
    if (!ok) setLinkedTodoIds(previous)
  }

  async function handleSave() {
    const body = tab === 'notes' && bodyRef.current ? bodyRef.current.getJSON() : (bodyOverride ?? todo.body ?? null)
    setSaving(true)
    try {
      await onSave(id, {
        title: title.trim() || todo.title,
        priority,
        dueDate: dueDate || null,
        categoryId,
        tags,
        body,
        recurrence: recurrence === 'none' ? null : { pattern: recurrence },
        officeLinked,
        ...(canLink ? { linkedTodoIds } : {}),
      })
    } finally {
      setSaving(false)
    }
  }

  // linkedTodoIds's own array order is authoritative for render/drag order -
  // not `todos`'s order (which is the app-wide list, sorted newest-first).
  // A dangling id (its todo since deleted) resolves to undefined and is
  // dropped here, per the no-cascade tolerance documented on the schema.
  const linked: Todo[] = canLink
    ? linkedTodoIds
        .map((linkId) => todosList.find((t) => todoKey(t) === linkId))
        .filter((t): t is Todo => Boolean(t))
    : []
  const results =
    canLink && query.trim()
      ? todosList
          .filter((t) => todoKey(t) !== todoKey(todo))
          .filter((t) => !linkedTodoIds.includes(todoKey(t)))
          .filter((t) => t.title.toLowerCase().includes(query.trim().toLowerCase()))
          .slice(0, 6)
      : []
  const selectedLinkedTodo = linked.find((t) => todoKey(t) === selectedLinkedId)
  const isTodosTab = canLink && tab === 'todos'
  const selectedCategory = categories.find((c) => String(getId(c)) === categoryId)

  // Persists the parent todo's own notes body immediately via the renamed
  // `onSaveNotes` prop, independent of the footer Save/Add button - mirrors
  // handleSaveLinkedNotes below. Only reachable for an existing todo (the
  // Save button that calls this isn't rendered for a new one, see `isNew`
  // in the JSX), so `id` is guaranteed non-empty here.
  async function handleSaveNotes() {
    if (!id) return
    const json = bodyRef.current?.getJSON() ?? bodyOverride ?? todo.body ?? null
    setSavingNotes(true)
    try {
      await onSaveNotes?.(id, { body: json })
      // Resets the dirty-tracking baseline synchronously so the border/
      // button clear immediately, without waiting on a background refetch.
      bodyRef.current?.markSaved()
    } finally {
      setSavingNotes(false)
    }
  }

  async function handleSaveLinkedNotes() {
    if (!selectedLinkedTodo) return
    const linkedId = todoKey(selectedLinkedTodo)
    const json = linkedNotesRef.current?.getJSON() ?? linkedNotesOverrides[linkedId] ?? selectedLinkedTodo.body ?? null
    setSavingLinkedNotes(true)
    try {
      await onSaveNotes?.(linkedId, { body: json })
      setLinkedNotesOverrides((prev) => {
        const next = { ...prev }
        delete next[linkedId]
        return next
      })
      // Resets the dirty-tracking baseline synchronously so the border/
      // button clear immediately, mirroring handleSaveNotes above.
      linkedNotesRef.current?.markSaved()
    } finally {
      setSavingLinkedNotes(false)
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      role="dialog"
      aria-modal="true"
      aria-label={isNew ? 'New todo' : `Edit ${todo.title}`}
    >
      <div
        className={`max-h-[calc(100vh-4rem)] overflow-y-auto rounded-2xl border border-slate-200 bg-white p-6 text-slate-900 shadow-xl transition-[max-width] duration-150 dark:border-white/10 dark:bg-[#160f24] dark:text-slate-100 ${
          isTodosTab ? 'w-full max-w-3xl' : 'w-full max-w-lg'
        }`}
      >
        {isTodosTab ? (
          <CollapsedHeader
            title={title}
            priority={priority}
            dueDate={dueDate}
            category={selectedCategory}
            onClose={onClose}
          />
        ) : (
          <>
            <div className="mb-4 flex items-center justify-between gap-2">
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                aria-label="Todo title"
                className="flex-1 rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 text-lg font-semibold text-slate-900 focus:border-fuchsia-400/60 focus:outline-none dark:border-white/10 dark:bg-white/5 dark:text-slate-100"
              />
              <button
                type="button"
                aria-label="Close"
                onClick={onClose}
                className="shrink-0 rounded-full px-2 py-0.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-white/10 dark:hover:text-slate-200"
              >
                ×
              </button>
            </div>

            <div className="mb-4 flex flex-col gap-1">
              <span className="text-xs font-medium text-slate-500 dark:text-slate-300">Priority</span>
              <div role="group" aria-label="Priority" className="flex gap-2">
                {PRIORITIES.map((p) => (
                  <button
                    key={p}
                    type="button"
                    aria-pressed={priority === p}
                    onClick={() => setPriority(p)}
                    className={`rounded-full px-3 py-1 text-xs font-semibold transition ${
                      priority === p
                        ? 'bg-gradient-to-r from-violet-500 to-fuchsia-500 text-white'
                        : 'bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-white/5 dark:text-slate-300 dark:hover:bg-white/10'
                    }`}
                  >
                    {p}
                  </button>
                ))}
              </div>
            </div>

            <div className="mb-4 grid grid-cols-2 gap-3">
              <div className="flex flex-col gap-1">
                <label htmlFor="todo-due-date" className="text-xs font-medium text-slate-500 dark:text-slate-300">
                  Due date
                </label>
                <input
                  id="todo-due-date"
                  type="date"
                  value={dueDate ?? ''}
                  onChange={(e) => setDueDate(e.target.value)}
                  className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-900 focus:border-fuchsia-400/60 focus:outline-none dark:border-white/10 dark:bg-white/5 dark:text-slate-100"
                />
              </div>
              <div className="flex flex-col gap-1">
                <label htmlFor="todo-category" className="text-xs font-medium text-slate-500 dark:text-slate-300">
                  Category
                </label>
                <select
                  id="todo-category"
                  value={categoryId}
                  onChange={(e) => setCategoryId(e.target.value)}
                  className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-900 focus:border-fuchsia-400/60 focus:outline-none dark:border-white/10 dark:bg-white/5 dark:text-slate-100"
                >
                  {categories.map((c) => {
                    const cid = String(getId(c))
                    return (
                      <option key={cid} value={cid} className="bg-white dark:bg-[#160f24]">
                        {c.name}
                      </option>
                    )
                  })}
                </select>
              </div>
            </div>

            <div className="mb-4 flex flex-col gap-1">
              <label className="flex items-center gap-2 text-xs font-medium text-slate-600 dark:text-slate-300">
                <input
                  type="checkbox"
                  checked={officeLinked}
                  onChange={(e) => setOfficeLinked(e.target.checked)}
                  className="h-3.5 w-3.5 accent-fuchsia-500"
                />
                Link to next office day
              </label>
              {officeLinked && dueDate && (
                <p className="text-[11px] text-slate-400 dark:text-slate-500">
                  Due date above takes priority while it's set.
                </p>
              )}
            </div>

            <div className="mb-4 flex flex-col gap-1">
              <span className="text-xs font-medium text-slate-500 dark:text-slate-300">Tags</span>
              <TagInput tags={tags} onChange={setTags} suggestions={availableTags} />
            </div>

            <div className="mb-4 flex flex-col gap-1">
              <span className="text-xs font-medium text-slate-500 dark:text-slate-300">Repeat</span>
              <div role="group" aria-label="Repeat" className="flex gap-2">
                {RECURRENCE_OPTIONS.map((opt) => (
                  <button
                    key={opt.value}
                    type="button"
                    aria-pressed={recurrence === opt.value}
                    onClick={() => setRecurrence(opt.value)}
                    className={`rounded-full px-3 py-1 text-xs font-semibold transition ${
                      recurrence === opt.value
                        ? 'bg-gradient-to-r from-violet-500 to-fuchsia-500 text-white'
                        : 'bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-white/5 dark:text-slate-300 dark:hover:bg-white/10'
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>
          </>
        )}

        {canLink && (
          <div
            role="tablist"
            aria-label="Todo detail sections"
            className="mb-4 flex gap-1 border-b border-slate-200 dark:border-white/10"
          >
            {(
              [
                { key: 'notes', label: 'Notes' },
                { key: 'todos', label: `Todos${linked.length ? ` (${linked.length})` : ''}` },
              ] as const
            ).map((t) => (
              <button
                key={t.key}
                type="button"
                role="tab"
                aria-selected={tab === t.key}
                onClick={() => switchTab(t.key)}
                className={`-mb-px border-b-2 px-3 py-2 text-sm font-semibold transition ${
                  tab === t.key
                    ? 'border-fuchsia-500 text-fuchsia-600 dark:border-fuchsia-400 dark:text-fuchsia-300'
                    : 'border-transparent text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200'
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>
        )}

        {(!canLink || tab === 'notes') && (
          <div className="mb-5 flex flex-col gap-1">
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-medium text-slate-500 dark:text-slate-300">Notes</span>
              {!isNew && notesDirty && (
                <button
                  type="button"
                  aria-label="Save notes"
                  disabled={savingNotes}
                  onClick={handleSaveNotes}
                  className="shrink-0 rounded-full bg-gradient-to-r from-violet-500 to-fuchsia-500 px-2.5 py-1 text-[11px] font-semibold text-white hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {savingNotes ? 'Saving...' : 'Save'}
                </button>
              )}
            </div>
            <ExpandableNotesEditor
              ref={bodyRef}
              content={bodyOverride ?? todo.body}
              savedContent={todo.body}
              editable
              toolbar
              onDirtyChange={setNotesDirty}
              className={`min-h-[120px] rounded-lg border bg-slate-50 px-3 py-2 text-sm text-slate-900 dark:bg-white/5 dark:text-slate-100 ${
                !isNew && notesDirty
                  ? 'border-fuchsia-400/60 dark:border-fuchsia-400/60'
                  : 'border-slate-200 dark:border-white/10'
              }`}
              contentClassName="max-h-[40vh] overflow-y-auto [&_.tiptap]:min-h-[100px]"
            />
          </div>
        )}

        {isTodosTab && (
          <div className="mb-5 grid h-[340px] grid-cols-[280px_1fr] gap-3">
            <div className="flex flex-col gap-3 overflow-y-auto rounded-lg border border-slate-200 p-3 dark:border-white/10">
              <input
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search todos to link..."
                aria-label="Search todos to link"
                className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 text-sm text-slate-900 placeholder:text-slate-400 focus:border-fuchsia-400/60 focus:outline-none dark:border-white/10 dark:bg-white/5 dark:text-slate-100 dark:placeholder:text-slate-500"
              />
              {results.length > 0 && (
                <div className="flex flex-col gap-1 rounded-lg border border-slate-200 bg-white p-1 shadow-sm dark:border-white/10 dark:bg-[#1c1330]">
                  {results.map((t) => (
                    <button
                      key={todoKey(t)}
                      type="button"
                      onClick={() => handleLink(todoKey(t))}
                      className="flex items-center justify-between rounded-md px-2 py-1.5 text-left text-sm text-slate-700 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-white/10"
                    >
                      <span className="truncate">{t.title}</span>
                      <span className="shrink-0 text-xs font-semibold text-fuchsia-600 dark:text-fuchsia-300">
                        + Add
                      </span>
                    </button>
                  ))}
                </div>
              )}

              <div className="flex flex-col gap-1">
                <span className="text-xs font-medium text-slate-500 dark:text-slate-300">
                  Linked ({linked.length})
                </span>
                {linked.length === 0 && (
                  <p className="rounded-lg border border-dashed border-slate-200 px-3 py-4 text-center text-xs text-slate-400 dark:border-white/10 dark:text-slate-500">
                    No todos linked yet.
                  </p>
                )}
                <DndContext
                  sensors={dragSensors}
                  collisionDetection={closestCenter}
                  onDragEnd={handleDragEnd}
                >
                  <SortableContext items={linked.map(todoKey)} strategy={verticalListSortingStrategy}>
                    {linked.map((t) => (
                      <SortableLinkedTodoRow
                        key={todoKey(t)}
                        todo={t}
                        selected={selectedLinkedId === todoKey(t)}
                        onSelect={selectLinked}
                        onUnlink={handleUnlink}
                      />
                    ))}
                  </SortableContext>
                </DndContext>
              </div>
            </div>

            <div className="flex flex-col overflow-hidden rounded-lg border border-slate-200 p-3 dark:border-white/10">
              {selectedLinkedTodo ? (
                <>
                  <div className="mb-2 flex items-center justify-between gap-2">
                    <span className="truncate text-sm font-semibold text-slate-900 dark:text-slate-100">
                      {selectedLinkedTodo.title}
                    </span>
                    {linkedNotesDirty && (
                      <button
                        type="button"
                        aria-label={`Save notes for ${selectedLinkedTodo.title}`}
                        disabled={savingLinkedNotes}
                        onClick={handleSaveLinkedNotes}
                        className="shrink-0 rounded-full bg-gradient-to-r from-violet-500 to-fuchsia-500 px-2.5 py-1 text-[11px] font-semibold text-white hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        {savingLinkedNotes ? 'Saving...' : 'Save'}
                      </button>
                    )}
                  </div>
                  <ExpandableNotesEditor
                    key={todoKey(selectedLinkedTodo)}
                    ref={linkedNotesRef}
                    content={linkedNotesOverrides[todoKey(selectedLinkedTodo)] ?? selectedLinkedTodo.body}
                    savedContent={selectedLinkedTodo.body}
                    editable
                    toolbar
                    onDirtyChange={setLinkedNotesDirty}
                    className={`flex-1 overflow-hidden rounded-lg border bg-slate-50 px-3 py-2 text-sm text-slate-900 dark:bg-white/5 dark:text-slate-100 ${
                      linkedNotesDirty
                        ? 'border-fuchsia-400/60 dark:border-fuchsia-400/60'
                        : 'border-slate-200 dark:border-white/10'
                    }`}
                    contentClassName="h-full overflow-y-auto [&_.tiptap]:min-h-[120px]"
                  />
                </>
              ) : (
                <div className="flex flex-1 items-center justify-center text-center text-xs text-slate-400 dark:text-slate-500">
                  Select a linked todo on the left to view or edit its notes.
                </div>
              )}
            </div>
          </div>
        )}

        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-100 dark:border-white/10 dark:text-slate-300 dark:hover:bg-white/5"
          >
            Cancel
          </button>
          {!isNew && !todo.completed && onMarkComplete && id && (
            <button
              type="button"
              onClick={() => onMarkComplete(id)}
              className="rounded-lg border border-emerald-400/60 px-3 py-1.5 text-sm font-semibold text-emerald-600 hover:bg-emerald-50 dark:border-emerald-400/40 dark:text-emerald-300 dark:hover:bg-emerald-500/10"
            >
              Mark complete
            </button>
          )}
          <button
            type="button"
            disabled={saving}
            onClick={handleSave}
            className="rounded-lg bg-gradient-to-r from-violet-500 to-fuchsia-500 px-3 py-1.5 text-sm font-semibold text-white hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {saving ? (isNew ? 'Adding...' : 'Saving...') : isNew ? 'Add' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  )
}
