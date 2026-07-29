import type { JSONContent } from '@tiptap/core'
import { useRef, useState } from 'react'
import { getId } from '../utils/getId'
import type { Category, ScratchLine, ScratchNote } from '../types'
import { RichTextEditor, type RichTextEditorHandle } from './RichTextEditor'
import { ScratchNoteCard, type PromoteOptions } from './ScratchNoteCard'

// A line freshly split out of the capture bar's document - not yet a full
// ScratchLine, since `id`/`promotedTodoId` are assigned by the backend route
// on create (see POST /api/scratch-notes), not here.
export interface DraftScratchLine {
  content: JSONContent | null
}

// Splits a captured Tiptap doc into one line per top-level block (each
// paragraph the user typed, separated by Enter), matching the "lines as an
// array of independent Tiptap documents" shape ScratchNote already stores.
// A doc with no top-level blocks (shouldn't happen - Tiptap always keeps at
// least an empty paragraph) falls back to a single line so Save never
// silently no-ops.
export function splitIntoLines(doc: JSONContent | null | undefined): DraftScratchLine[] {
  if (!doc?.content?.length) return [{ content: doc ?? null }]
  return doc.content.map((node) => ({ content: { type: 'doc', content: [node] } }))
}

interface ScratchpadProps {
  notes: ScratchNote[]
  categories: Category[]
  onCreateNote: (lines: DraftScratchLine[]) => Promise<void> | void
  onUpdateLines: (id: string, lines: ScratchLine[]) => void
  onPromote: (noteId: string, lineId: string, options: PromoteOptions) => Promise<void> | void
  onArchive: (id: string) => void
  onDelete: (id: string) => void
}

// Capture lives in the chrome, always on screen: a chat-input-style bar
// pinned to the bottom of the viewport. Click it and it grows upward into a
// full editor in place; saving creates a new scratch note (session) seeded
// with one line per paragraph typed - each Enter-separated line lands as its
// own independently promotable line, same as lines added later via "+ Add
// line" - then collapses back. Browsing existing sessions is a separate
// concern off a small icon rail on the left edge that slides in an overlay
// panel. (Landed from the "scratchpad placement" UI prototype - see the
// throwaway branch for the FAB/drawer and modal/grid alternatives.)
export function Scratchpad({ notes, categories, onCreateNote, onUpdateLines, onPromote, onArchive, onDelete }: ScratchpadProps) {
  const [expanded, setExpanded] = useState(false)
  const [panelOpen, setPanelOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const editorRef = useRef<RichTextEditorHandle>(null)

  async function handleSave() {
    const doc = editorRef.current?.getJSON()
    if (!doc) return
    const lines = splitIntoLines(doc)
    if (lines.length === 0) return
    setSaving(true)
    try {
      await onCreateNote(lines)
      setExpanded(false)
    } finally {
      setSaving(false)
    }
  }

  return (
    <section aria-label="Scratchpad">
      <button
        type="button"
        onClick={() => setPanelOpen(true)}
        aria-label={`Open scratchpad sessions (${notes.length})`}
        className="fixed left-0 top-1/2 z-30 -translate-y-1/2 rounded-r-xl border border-slate-200 bg-white px-2 py-4 text-xs font-semibold text-slate-600 shadow-sm hover:bg-slate-50 dark:border-white/10 dark:bg-white/5 dark:text-slate-300 dark:shadow-none dark:backdrop-blur-md dark:hover:bg-white/10"
        style={{ writingMode: 'vertical-rl' }}
      >
        Sessions ({notes.length})
      </button>

      {panelOpen && (
        <>
          <div
            className="fixed inset-0 z-40 bg-black/50"
            onClick={() => setPanelOpen(false)}
            aria-hidden="true"
          />
          <div className="fixed inset-y-0 left-0 z-50 flex w-full max-w-md flex-col border-r border-slate-200 bg-white p-5 shadow-2xl dark:border-white/10 dark:bg-[#0f0f18]">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">Scratchpad sessions</h2>
              <button
                type="button"
                onClick={() => setPanelOpen(false)}
                aria-label="Close scratchpad sessions"
                className="rounded-full px-2 py-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-white/10 dark:hover:text-slate-200"
              >
                ✕
              </button>
            </div>
            <div className="flex-1 overflow-y-auto pb-24">
              {notes.length === 0 && (
                <p className="text-sm text-slate-500 dark:text-slate-400">
                  No scratch notes yet — jot something down before it slips your mind.
                </p>
              )}
              <div className="flex flex-col gap-3">
                {notes.map((note) => {
                  const id = String(getId(note))
                  return (
                    <ScratchNoteCard
                      key={id}
                      note={note}
                      categories={categories}
                      onUpdateLines={(lines) => onUpdateLines(id, lines)}
                      onPromote={(lineId, options) => onPromote(id, lineId, options)}
                      onArchive={() => onArchive(id)}
                      onDelete={() => onDelete(id)}
                    />
                  )
                })}
              </div>
            </div>
          </div>
        </>
      )}

      <div className="fixed inset-x-0 bottom-0 z-40 border-t border-slate-200 bg-white/95 dark:border-white/10 dark:bg-[#0f0f18]/95 dark:backdrop-blur-md">
        <div className="mx-auto max-w-3xl px-4 py-3">
          {!expanded ? (
            <button
              type="button"
              onClick={() => setExpanded(true)}
              className="w-full rounded-full border border-slate-200 bg-slate-50 px-4 py-2.5 text-left text-sm text-slate-400 hover:bg-slate-100 dark:border-white/10 dark:bg-white/5 dark:hover:bg-white/10"
            >
              Jot something down...
            </button>
          ) : (
            <div className="rounded-2xl border border-fuchsia-300/50 bg-fuchsia-50/40 p-3 dark:border-fuchsia-400/30 dark:bg-white/5">
              <div className="mb-2 min-h-[3.5rem] rounded-lg border border-slate-200 bg-white px-3 py-2 dark:border-white/10 dark:bg-white/5">
                <RichTextEditor
                  ref={editorRef}
                  content={null}
                  editable
                  className="text-sm text-slate-900 dark:text-slate-100 [&_.tiptap]:outline-none"
                />
              </div>
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setExpanded(false)}
                  className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs text-slate-600 hover:bg-slate-100 dark:border-white/10 dark:text-slate-300 dark:hover:bg-white/5"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={saving}
                  onClick={handleSave}
                  className="rounded-lg bg-gradient-to-r from-violet-500 to-fuchsia-500 px-3 py-1.5 text-xs font-semibold text-white hover:opacity-90 disabled:opacity-50"
                >
                  {saving ? 'Saving...' : 'Save'}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Keeps page content from being hidden behind the fixed bottom bar */}
      <div className="h-20" aria-hidden="true" />
    </section>
  )
}
