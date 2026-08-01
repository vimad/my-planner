import { useState, type FormEvent } from 'react'

interface CreateBoardPromptProps {
  itemLabel: string
  onCreate: (name: string) => Promise<void>
  onCancel: () => void
}

// Zero-boards quick-add prompt (see the Boards spec: "If there are zero
// boards yet, clicking the icon instead prompts the user to name and create
// the first board before the item is added — no silent auto-created
// board"). Triggered from anywhere in the app (any todo/note row), so unlike
// BoardsView's own BoardSwitcher create-form (an inline, dropdown-attached
// affordance that only makes sense inside the Boards view itself) this is a
// modal - but both funnel through the exact same hooks/useBoards.createBoard
// mutation App.tsx owns, so there's still only one board-creation code path,
// just two entry points into it.
export function CreateBoardPrompt({ itemLabel, onCreate, onCancel }: CreateBoardPromptProps) {
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
      aria-label="Create your first board"
    >
      <div className="w-full max-w-sm rounded-2xl border border-slate-200 bg-white p-6 text-slate-900 shadow-xl dark:border-white/10 dark:bg-[#160f24] dark:text-slate-100">
        <p className="mb-3 text-sm text-slate-700 dark:text-slate-200">
          {`Name a board to add "${itemLabel}" to. Boards pull together todos and notes for something you're working on.`}
        </p>
        <form onSubmit={handleSubmit} className="flex items-center gap-2">
          <input
            autoFocus
            type="text"
            aria-label="New board name"
            placeholder="Name your first board…"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="flex-1 rounded-lg border border-fuchsia-400/60 bg-white px-3 py-1.5 text-sm text-slate-900 outline-none dark:bg-white/5 dark:text-slate-100"
          />
          <button
            type="submit"
            disabled={submitting}
            className="shrink-0 rounded-full bg-gradient-to-r from-violet-500 to-fuchsia-500 px-3 py-1.5 text-xs font-semibold text-white hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {submitting ? 'Creating...' : 'Create board'}
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
