import { useRef, useState } from 'react'
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

// In-page overlay (no routing) for viewing/editing a single todo's detail:
// priority, due date, category, tags, and rich-text body. Body view/edit
// mode is a toggle over the same RichTextEditor instance/document.
export function TodoDetail({ todo, categories, availableTags, onClose, onSave }) {
  const id = todo._id ?? todo.id

  const [title, setTitle] = useState(todo.title)
  const [priority, setPriority] = useState(todo.priority ?? 'Medium')
  // Native <input type="date">'s string value is used directly - never
  // round-tripped through a Date object, to avoid local/UTC day-shift bugs.
  const [dueDate, setDueDate] = useState(todo.dueDate ?? '')
  const [categoryId, setCategoryId] = useState(String(todo.categoryId ?? ''))
  const [tags, setTags] = useState(todo.tags ?? [])
  const [recurrence, setRecurrence] = useState(todo.recurrence?.pattern ?? 'none')
  const [editingBody, setEditingBody] = useState(false)
  const [saving, setSaving] = useState(false)
  const bodyRef = useRef(null)

  async function handleSave() {
    setSaving(true)
    try {
      const body = bodyRef.current?.getJSON() ?? todo.body ?? null
      await onSave(id, {
        title: title.trim() || todo.title,
        priority,
        dueDate: dueDate || null,
        categoryId,
        tags,
        body,
        recurrence: recurrence === 'none' ? null : { pattern: recurrence },
      })
    } finally {
      setSaving(false)
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      role="dialog"
      aria-modal="true"
      aria-label={`Edit ${todo.title}`}
    >
      <div className="w-full max-w-lg rounded-2xl border border-white/10 bg-[#160f24] p-6 text-slate-100 shadow-xl">
        <div className="mb-4 flex items-center justify-between gap-2">
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            aria-label="Todo title"
            className="flex-1 bg-transparent text-lg font-semibold text-slate-100 focus:outline-none"
          />
          <button
            type="button"
            aria-label="Close"
            onClick={onClose}
            className="shrink-0 rounded-full px-2 py-0.5 text-slate-400 hover:bg-white/10 hover:text-slate-200"
          >
            ×
          </button>
        </div>

        <div className="mb-4 flex flex-col gap-1">
          <span className="text-xs font-medium text-slate-300">Priority</span>
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
                    : 'bg-white/5 text-slate-300 hover:bg-white/10'
                }`}
              >
                {p}
              </button>
            ))}
          </div>
        </div>

        <div className="mb-4 grid grid-cols-2 gap-3">
          <div className="flex flex-col gap-1">
            <label htmlFor="todo-due-date" className="text-xs font-medium text-slate-300">
              Due date
            </label>
            <input
              id="todo-due-date"
              type="date"
              value={dueDate ?? ''}
              onChange={(e) => setDueDate(e.target.value)}
              className="rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-slate-100 focus:border-fuchsia-400/60 focus:outline-none"
            />
          </div>
          <div className="flex flex-col gap-1">
            <label htmlFor="todo-category" className="text-xs font-medium text-slate-300">
              Category
            </label>
            <select
              id="todo-category"
              value={categoryId}
              onChange={(e) => setCategoryId(e.target.value)}
              className="rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-slate-100 focus:border-fuchsia-400/60 focus:outline-none"
            >
              {categories.map((c) => {
                const cid = String(c._id ?? c.id)
                return (
                  <option key={cid} value={cid} className="bg-[#160f24]">
                    {c.name}
                  </option>
                )
              })}
            </select>
          </div>
        </div>

        <div className="mb-4 flex flex-col gap-1">
          <span className="text-xs font-medium text-slate-300">Tags</span>
          <TagInput tags={tags} onChange={setTags} suggestions={availableTags} />
        </div>

        <div className="mb-4 flex flex-col gap-1">
          <span className="text-xs font-medium text-slate-300">Repeat</span>
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
                    : 'bg-white/5 text-slate-300 hover:bg-white/10'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        <div className="mb-5 flex flex-col gap-1">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-300">Notes</span>
            <button
              type="button"
              onClick={() => setEditingBody((v) => !v)}
              className="text-xs font-semibold text-fuchsia-300 hover:text-fuchsia-200 hover:underline"
            >
              {editingBody ? 'Done editing' : 'Edit'}
            </button>
          </div>
          <RichTextEditor
            ref={bodyRef}
            content={todo.body}
            editable={editingBody}
            className="min-h-[120px] rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-slate-100 [&_.tiptap]:min-h-[100px] [&_.tiptap]:outline-none [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:list-decimal [&_ol]:pl-5"
          />
        </div>

        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-white/10 px-3 py-1.5 text-sm text-slate-300 hover:bg-white/5"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={saving}
            onClick={handleSave}
            className="rounded-lg bg-gradient-to-r from-violet-500 to-fuchsia-500 px-3 py-1.5 text-sm font-semibold text-white hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {saving ? 'Saving...' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  )
}
