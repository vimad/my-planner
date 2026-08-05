import { useRef, useState } from 'react'
import { getId } from '../utils/getId'
import type { Category, ScratchLine, ScratchNote, TodoPriority } from '../types'
import { RichTextEditor, type RichTextEditorHandle } from './RichTextEditor'

const PRIORITIES: TodoPriority[] = ['High', 'Medium', 'Low']

// Options collected by the inline promote form for one or more selected
// lines - forwarded verbatim to onPromote per selected line id.
export interface PromoteOptions {
  categoryId: string
  priority: TodoPriority
  dueDate: string | null
}

interface ScratchNoteCardProps {
  note: ScratchNote
  categories: Category[]
  onUpdateLines: (lines: ScratchLine[]) => void
  onPromote: (lineId: string, options: PromoteOptions) => Promise<void> | void
  onArchive: () => void
  onDelete: () => void
}

// A single scratch note card: its lines (each its own small RichTextEditor
// instance, per the "lines as an array of independent Tiptap documents"
// design decision - see ScratchNote model comment), a checkbox per
// not-yet-promoted line, and an inline promote form that fires once per
// selected line. Promoted lines stay visible, dimmed/struck-through, with a
// "linked to todo" indicator.
export function ScratchNoteCard({ note, categories, onUpdateLines, onPromote, onArchive, onDelete }: ScratchNoteCardProps) {
  const lines = note.body ?? []

  const [editingLineId, setEditingLineId] = useState<string | null>(null)
  const [selectedLineIds, setSelectedLineIds] = useState<string[]>([])
  const [showPromoteForm, setShowPromoteForm] = useState(false)
  const [categoryId, setCategoryId] = useState(String(getId(categories[0]) ?? ''))
  const [priority, setPriority] = useState<TodoPriority>('Medium')
  const [dueDate, setDueDate] = useState('')
  const [promoting, setPromoting] = useState(false)
  const editorRef = useRef<RichTextEditorHandle>(null)

  function handleSaveLine(lineId: string) {
    const content = editorRef.current?.getJSON() ?? null
    const nextLines = lines.map((line) => (line.id === lineId ? { ...line, content } : line))
    onUpdateLines(nextLines)
    setEditingLineId(null)
  }

  function handleAddLine() {
    const newLine: ScratchLine = { id: crypto.randomUUID(), content: null, promotedTodoId: null }
    onUpdateLines([...lines, newLine])
    setEditingLineId(newLine.id)
  }

  function toggleSelected(lineId: string) {
    setSelectedLineIds((prev) =>
      prev.includes(lineId) ? prev.filter((existing) => existing !== lineId) : [...prev, lineId],
    )
  }

  const selectableLineIds = lines.filter((line) => !line.promotedTodoId).map((line) => line.id)
  const allSelected =
    selectableLineIds.length > 0 && selectableLineIds.every((id) => selectedLineIds.includes(id))

  function toggleSelectAll() {
    setSelectedLineIds(allSelected ? [] : selectableLineIds)
  }

  async function handlePromoteSelected() {
    setPromoting(true)
    try {
      await Promise.all(
        selectedLineIds.map((lineId) =>
          onPromote(lineId, { categoryId, priority, dueDate: dueDate || null }),
        ),
      )
      setSelectedLineIds([])
      setShowPromoteForm(false)
    } finally {
      setPromoting(false)
    }
  }

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-white/10 dark:bg-white/5 dark:shadow-none dark:backdrop-blur-md">
      <div className="mb-2 flex items-center justify-between gap-2">
        <span className="text-xs text-slate-500 dark:text-slate-400">
          {note.createdAt ? new Date(note.createdAt).toLocaleString() : ''}
        </span>
        <div className="flex gap-2">
          <button
            type="button"
            aria-label="Archive note"
            onClick={onArchive}
            className="rounded-full px-2 py-0.5 text-xs text-slate-400 hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-white/10 dark:hover:text-slate-200"
          >
            Archive
          </button>
          <button
            type="button"
            aria-label="Delete note"
            onClick={onDelete}
            className="rounded-full px-2 py-0.5 text-xs text-red-500 hover:bg-red-50 hover:text-red-600 dark:text-red-400/80 dark:hover:bg-red-500/10 dark:hover:text-red-300"
          >
            Delete
          </button>
        </div>
      </div>

      {lines.length === 0 && <p className="text-sm text-slate-500 dark:text-slate-400">No lines yet.</p>}

      {selectableLineIds.length > 1 && (
        <button
          type="button"
          onClick={toggleSelectAll}
          className="mb-2 text-xs font-semibold text-fuchsia-600 hover:text-fuchsia-700 hover:underline dark:text-fuchsia-300 dark:hover:text-fuchsia-200"
        >
          {allSelected ? 'Clear selection' : 'Select all'}
        </button>
      )}

      <ul className="flex flex-col gap-2">
        {lines.map((line) => {
          const isPromoted = Boolean(line.promotedTodoId)
          const isEditing = editingLineId === line.id

          return (
            <li key={line.id} className="flex items-start gap-2">
              {!isPromoted && (
                <input
                  type="checkbox"
                  aria-label={`Promote ${line.id}`}
                  checked={selectedLineIds.includes(line.id)}
                  onChange={() => toggleSelected(line.id)}
                  className="mt-[3px] h-3.5 w-3.5 shrink-0 accent-fuchsia-500"
                />
              )}
              <div className={`min-w-0 flex-1 ${isPromoted ? 'opacity-60' : ''}`}>
                <RichTextEditor
                  ref={isEditing ? editorRef : undefined}
                  content={line.content}
                  editable={isEditing}
                  className={`text-sm text-slate-900 dark:text-slate-100 ${isPromoted ? 'line-through' : ''}`}
                />
                {isPromoted && (
                  <span className="mt-0.5 inline-block text-xs font-medium text-emerald-600 dark:text-emerald-300">
                    ✓ linked to todo
                  </span>
                )}
              </div>
              {!isPromoted && (
                <button
                  type="button"
                  aria-label={isEditing ? `Save line ${line.id}` : `Edit line ${line.id}`}
                  onClick={() => (isEditing ? handleSaveLine(line.id) : setEditingLineId(line.id))}
                  className="shrink-0 rounded-full px-2 py-0.5 text-xs font-semibold text-fuchsia-600 hover:bg-slate-100 hover:text-fuchsia-700 dark:text-fuchsia-300 dark:hover:bg-white/10 dark:hover:text-fuchsia-200"
                >
                  {isEditing ? 'Save' : 'Edit'}
                </button>
              )}
            </li>
          )
        })}
      </ul>

      <button
        type="button"
        onClick={handleAddLine}
        className="mt-3 text-xs font-semibold text-fuchsia-600 hover:text-fuchsia-700 hover:underline dark:text-fuchsia-300 dark:hover:text-fuchsia-200"
      >
        + Add line
      </button>

      {selectedLineIds.length > 0 && (
        <div className="mt-3 border-t border-slate-200 pt-3 dark:border-white/10">
          {!showPromoteForm ? (
            <button
              type="button"
              onClick={() => setShowPromoteForm(true)}
              className="rounded-lg bg-gradient-to-r from-violet-500 to-fuchsia-500 px-3 py-1.5 text-xs font-semibold text-white hover:opacity-90"
            >
              Promote {selectedLineIds.length} line{selectedLineIds.length > 1 ? 's' : ''}
            </button>
          ) : (
            <div className="flex flex-col gap-2">
              <div className="grid grid-cols-2 gap-2">
                <label className="flex flex-col gap-1">
                  <span className="text-xs font-medium text-slate-500 dark:text-slate-300">Category</span>
                  <select
                    aria-label="Promote category"
                    value={categoryId}
                    onChange={(e) => setCategoryId(e.target.value)}
                    className="rounded-lg border border-slate-200 bg-slate-50 px-2 py-1.5 text-xs text-slate-900 focus:border-fuchsia-400/60 focus:outline-none dark:border-white/10 dark:bg-white/5 dark:text-slate-100"
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
                </label>
                <label className="flex flex-col gap-1">
                  <span className="text-xs font-medium text-slate-500 dark:text-slate-300">Due date</span>
                  <input
                    type="date"
                    aria-label="Promote due date"
                    value={dueDate}
                    onChange={(e) => setDueDate(e.target.value)}
                    className="rounded-lg border border-slate-200 bg-slate-50 px-2 py-1.5 text-xs text-slate-900 focus:border-fuchsia-400/60 focus:outline-none dark:border-white/10 dark:bg-white/5 dark:text-slate-100"
                  />
                </label>
              </div>
              <div role="group" aria-label="Promote priority" className="flex gap-2">
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
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowPromoteForm(false)}
                  className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs text-slate-600 hover:bg-slate-100 dark:border-white/10 dark:text-slate-300 dark:hover:bg-white/5"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={promoting}
                  onClick={handlePromoteSelected}
                  className="rounded-lg bg-gradient-to-r from-violet-500 to-fuchsia-500 px-3 py-1.5 text-xs font-semibold text-white hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {promoting ? 'Promoting...' : 'Confirm promote'}
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
