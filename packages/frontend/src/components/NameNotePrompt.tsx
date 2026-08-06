import { useState, type FormEvent } from 'react'

interface NameNotePromptProps {
  onCreate: (name: string) => Promise<void>
  onCancel: () => void
}

// Shown when the bottom-of-viewport capture bar (Scratchpad, captureMode
// "note") is saved from the Notes tab: rather than silently creating a
// ScratchNote session, capture on Notes creates a real Note in the Temp
// folder (auto-created if missing - see App.tsx's handleCreateTempNote), and
// needs a title first. Styled as the same small modal as CreateBoardPrompt.
export function NameNotePrompt({ onCreate, onCancel }: NameNotePromptProps) {
  const [name, setName] = useState('')
  const [submitting, setSubmitting] = useState(false)

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const trimmed = name.trim()
    if (!trimmed) return
    setSubmitting(true)
    try {
      await onCreate(trimmed)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center bg-black/60 p-4"
      role="dialog"
      aria-modal="true"
      aria-label="Name your note"
    >
      <div className="w-full max-w-sm rounded-2xl border border-slate-200 bg-white p-6 text-slate-900 shadow-xl dark:border-white/10 dark:bg-[#160f24] dark:text-slate-100">
        <p className="mb-3 text-sm text-slate-700 dark:text-slate-200">
          Name this note. It'll be saved in the Temp folder.
        </p>
        <form onSubmit={handleSubmit} className="flex items-center gap-2">
          <input
            autoFocus
            type="text"
            aria-label="Note title"
            placeholder="Note title…"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="flex-1 rounded-lg border border-fuchsia-400/60 bg-white px-3 py-1.5 text-sm text-slate-900 outline-none dark:bg-white/5 dark:text-slate-100"
          />
          <button
            type="submit"
            disabled={submitting}
            className="shrink-0 rounded-full bg-gradient-to-r from-violet-500 to-fuchsia-500 px-3 py-1.5 text-xs font-semibold text-white hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {submitting ? 'Saving...' : 'Save note'}
          </button>
        </form>
        <button
          type="button"
          onClick={onCancel}
          className="mt-3 text-xs text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
        >
          Cancel
        </button>
      </div>
    </div>
  )
}
