import { DndContext, KeyboardSensor, PointerSensor, closestCenter, useSensor, useSensors } from '@dnd-kit/core'
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
import { RichTextEditor } from './RichTextEditor'
import { TagInput } from './TagInput'

const PRIORITIES = ['High', 'Medium', 'Low']

// Simple presets only, per the spec — no custom interval/weekday selection.
// The 'none' option maps to a null recurrence (turns recurrence off).
const RECURRENCE_OPTIONS = [
  { value: 'none', label: 'None' },
  { value: 'daily', label: 'Daily' },
  { value: 'weekly', label: 'Weekly' },
  { value: 'monthly', label: 'Monthly' },
]

const PRIORITY_BADGE_STYLES = {
  High: 'bg-red-100 text-red-700 dark:bg-red-500/20 dark:text-red-300',
  Medium: 'bg-amber-100 text-amber-700 dark:bg-amber-500/20 dark:text-amber-300',
  Low: 'bg-slate-200 text-slate-600 dark:bg-slate-500/20 dark:text-slate-300',
}

function todoKey(todo) {
  return String(getId(todo))
}

// Reorders the *visible* (resolvable) ids per the drag result while leaving
// any dangling id (its todo since deleted) at its original index - dragging
// only ever reorders what's actually rendered, never resolves or discards a
// dangling reference.
function reorderLinkedIds(fullIds, todosList, activeId, overId) {
  const isResolvable = (linkId) => todosList.some((t) => todoKey(t) === linkId)
  const resolvedIds = fullIds.filter(isResolvable)
  const oldIndex = resolvedIds.indexOf(activeId)
  const newIndex = resolvedIds.indexOf(overId)
  if (oldIndex === -1 || newIndex === -1) return fullIds
  const reordered = arrayMove(resolvedIds, oldIndex, newIndex)
  let cursor = 0
  return fullIds.map((linkId) => (isResolvable(linkId) ? reordered[cursor++] : linkId))
}

// One row in the linked-todos list. The drag handle is the sole
// draggable/sortable affordance - the row's own click-to-select and the
// unlink "×" keep working unchanged, same as before this feature.
function SortableLinkedTodoRow({ todo: t, selected, onSelect, onUnlink }) {
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

// Compact read-only stand-in for the editable header, shown on the Todos tab
// so the widened linking workspace doesn't compete with a full edit form the
// user isn't using in that moment.
function CollapsedHeader({ title, priority, dueDate, category, onClose }) {
  return (
    <div className="mb-3 flex items-start justify-between gap-3">
      <div className="min-w-0">
        <h2 className="truncate text-lg font-semibold text-slate-900 dark:text-slate-100">{title}</h2>
        <div className="mt-1.5 flex flex-wrap items-center gap-2">
          <span
            className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${PRIORITY_BADGE_STYLES[priority]}`}
          >
            {priority}
          </span>
          {dueDate && (
            <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-medium text-slate-500 dark:bg-white/5 dark:text-slate-400">
              Due {dueDate}
            </span>
          )}
          {category && (
            <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-medium text-slate-500 dark:bg-white/5 dark:text-slate-400">
              <span className="h-1.5 w-1.5 rounded-full" style={{ background: category.color }} />
              {category.name}
            </span>
          )}
        </div>
      </div>
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
// since a brand-new todo has no id yet to link against. `onSaveLinkedTodo`
// persists a linked todo's own body independently, without closing this
// popup — distinct from `onSave`, which only ever saves the currently open
// (parent) todo's own fields. `onReorderLinkedTodos` persists a drag reorder
// of the linked list immediately (optimistic, with rollback on failure) —
// distinct from both of the above, and independent of the parent's own
// Save/Cancel footer.
export function TodoDetail({
  todo,
  categories,
  availableTags,
  todos,
  onClose,
  onSave,
  onSaveLinkedTodo,
  onReorderLinkedTodos,
}) {
  const id = getId(todo)
  const isNew = !id
  const canLink = !isNew && Array.isArray(todos)

  const [title, setTitle] = useState(todo.title ?? '')
  const [priority, setPriority] = useState(todo.priority ?? 'Medium')
  // Native <input type="date">'s string value is used directly - never
  // round-tripped through a Date object, to avoid local/UTC day-shift bugs.
  const [dueDate, setDueDate] = useState(todo.dueDate ?? '')
  // A new todo has no categoryId yet - default to the first available
  // category rather than '', which would fail the backend's ObjectId cast.
  const [categoryId, setCategoryId] = useState(
    String(todo.categoryId ?? getId(categories[0]) ?? ''),
  )
  const [tags, setTags] = useState(todo.tags ?? [])
  const [recurrence, setRecurrence] = useState(todo.recurrence?.pattern ?? 'none')
  const [officeLinked, setOfficeLinked] = useState(Boolean(todo.officeLinked))
  const [editingBody, setEditingBody] = useState(false)
  const [saving, setSaving] = useState(false)
  const bodyRef = useRef(null)

  // Local, staged list of linked todo ids - committed to the backend only
  // when the parent's own Save button is clicked, same as `tags` above.
  const [linkedTodoIds, setLinkedTodoIds] = useState(() => (todo.linkedTodoIds ?? []).map(String))
  const [tab, setTab] = useState('notes')
  const [query, setQuery] = useState('')
  const [selectedLinkedId, setSelectedLinkedId] = useState(null)
  const [savingLinkedNotes, setSavingLinkedNotes] = useState(false)
  // The RichTextEditor for the parent's own body and for a selected linked
  // todo's notes are both conditionally rendered (tab, and which linked todo
  // is selected) - capture their live document into these overrides before
  // unmounting, so switching back shows unsaved edits rather than the stale
  // prop.
  const [bodyOverride, setBodyOverride] = useState(null)
  const [linkedNotesOverrides, setLinkedNotesOverrides] = useState({})
  const linkedNotesRef = useRef(null)

  function captureOpenEditors() {
    if (tab === 'notes' && bodyRef.current) setBodyOverride(bodyRef.current.getJSON())
    if (selectedLinkedId && linkedNotesRef.current) {
      const json = linkedNotesRef.current.getJSON()
      setLinkedNotesOverrides((prev) => ({ ...prev, [selectedLinkedId]: json }))
    }
  }

  function switchTab(key) {
    captureOpenEditors()
    setTab(key)
  }

  function selectLinked(linkId) {
    captureOpenEditors()
    setSelectedLinkedId(linkId)
  }

  function handleLink(childId) {
    setLinkedTodoIds((prev) => [...prev, childId])
    setQuery('')
  }

  function handleUnlink(childId) {
    setLinkedTodoIds((prev) => prev.filter((linkedId) => linkedId !== childId))
    if (selectedLinkedId === childId) setSelectedLinkedId(null)
  }

  const dragSensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )

  // Persists immediately on drop, independent of the parent's own Save
  // button (unlike link/unlink above, which only stage `linkedTodoIds`
  // locally). Optimistic: the list reorders right away, then rolls back to
  // the pre-drag order if the PATCH fails.
  async function handleDragEnd(event) {
    const { active, over } = event
    if (!over || active.id === over.id) return
    const previous = linkedTodoIds
    const next = reorderLinkedIds(linkedTodoIds, todos, active.id, over.id)
    setLinkedTodoIds(next)
    const ok = await onReorderLinkedTodos(id, { linkedTodoIds: next })
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
  const linked = canLink
    ? linkedTodoIds.map((linkId) => todos.find((t) => todoKey(t) === linkId)).filter(Boolean)
    : []
  const results =
    canLink && query.trim()
      ? todos
          .filter((t) => todoKey(t) !== todoKey(todo))
          .filter((t) => !linkedTodoIds.includes(todoKey(t)))
          .filter((t) => t.title.toLowerCase().includes(query.trim().toLowerCase()))
          .slice(0, 6)
      : []
  const selectedLinkedTodo = linked.find((t) => todoKey(t) === selectedLinkedId)
  const isTodosTab = canLink && tab === 'todos'
  const selectedCategory = categories.find((c) => String(getId(c)) === categoryId)

  async function handleSaveLinkedNotes() {
    if (!selectedLinkedTodo) return
    const linkedId = todoKey(selectedLinkedTodo)
    const json = linkedNotesRef.current?.getJSON() ?? linkedNotesOverrides[linkedId] ?? selectedLinkedTodo.body ?? null
    setSavingLinkedNotes(true)
    try {
      await onSaveLinkedTodo(linkedId, { body: json })
      setLinkedNotesOverrides((prev) => {
        const next = { ...prev }
        delete next[linkedId]
        return next
      })
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
        className={`rounded-2xl border border-slate-200 bg-white p-6 text-slate-900 shadow-xl transition-[max-width] duration-150 dark:border-white/10 dark:bg-[#160f24] dark:text-slate-100 ${
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
            {[
              { key: 'notes', label: 'Notes' },
              { key: 'todos', label: `Todos${linked.length ? ` (${linked.length})` : ''}` },
            ].map((t) => (
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
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-slate-500 dark:text-slate-300">Notes</span>
              <button
                type="button"
                onClick={() => setEditingBody((v) => !v)}
                className="text-xs font-semibold text-fuchsia-600 hover:text-fuchsia-700 hover:underline dark:text-fuchsia-300 dark:hover:text-fuchsia-200"
              >
                {editingBody ? 'Done editing' : 'Edit'}
              </button>
            </div>
            <RichTextEditor
              ref={bodyRef}
              content={bodyOverride ?? todo.body}
              editable={editingBody}
              toolbar
              className="min-h-[120px] rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-900 dark:border-white/10 dark:bg-white/5 dark:text-slate-100"
              contentClassName="max-h-[40vh] overflow-y-auto [&_.tiptap]:min-h-[100px] [&_.tiptap]:outline-none [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:list-decimal [&_ol]:pl-5 [&_u]:underline [&_s]:line-through [&_a]:text-fuchsia-600 [&_a]:no-underline [&_a:hover]:text-fuchsia-700 [&_a:hover]:underline dark:[&_a]:text-fuchsia-300 dark:[&_a:hover]:text-fuchsia-200"
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
                    <button
                      type="button"
                      aria-label={`Save notes for ${selectedLinkedTodo.title}`}
                      disabled={savingLinkedNotes}
                      onClick={handleSaveLinkedNotes}
                      className="shrink-0 rounded-full bg-gradient-to-r from-violet-500 to-fuchsia-500 px-2.5 py-1 text-[11px] font-semibold text-white hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {savingLinkedNotes ? 'Saving...' : 'Save'}
                    </button>
                  </div>
                  <RichTextEditor
                    key={todoKey(selectedLinkedTodo)}
                    ref={linkedNotesRef}
                    content={linkedNotesOverrides[todoKey(selectedLinkedTodo)] ?? selectedLinkedTodo.body}
                    editable
                    toolbar
                    className="flex-1 overflow-hidden rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-900 dark:border-white/10 dark:bg-white/5 dark:text-slate-100"
                    contentClassName="h-full overflow-y-auto [&_.tiptap]:min-h-[120px] [&_.tiptap]:outline-none [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:list-decimal [&_ol]:pl-5 [&_u]:underline [&_s]:line-through [&_a]:text-fuchsia-600 [&_a]:no-underline [&_a:hover]:text-fuchsia-700 [&_a:hover]:underline dark:[&_a]:text-fuchsia-300 dark:[&_a:hover]:text-fuchsia-200"
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
