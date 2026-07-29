import { useState, type FormEvent, type KeyboardEvent } from 'react'

interface TodoQuickAddProps {
  onAdd: (title: string) => Promise<void> | void
  // Optional: real usage (App.jsx) always provides it, but a call site that
  // only cares about plain quick-add (e.g. a test exercising just Enter/Add)
  // can omit it - Shift+Enter then safely no-ops instead of throwing.
  onOpenFull?: (title: string) => void
}

// Title-only quick-add: type a title, hit Enter (or click Add) to create a
// todo immediately. Shift+Enter instead hands the typed title off to the full
// edit popup (via onOpenFull) so priority/tags/due date/etc. can be set
// before the todo is actually created.
export function TodoQuickAdd({ onAdd, onOpenFull }: TodoQuickAddProps) {
  const [title, setTitle] = useState('')
  const [submitting, setSubmitting] = useState(false)

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const trimmed = title.trim()
    if (!trimmed || submitting) return

    setSubmitting(true)
    try {
      await onAdd(trimmed)
      setTitle('')
    } finally {
      setSubmitting(false)
    }
  }

  function handleKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key !== 'Enter' || !e.shiftKey) return
    e.preventDefault()
    onOpenFull?.(title.trim())
    setTitle('')
  }

  return (
    <form onSubmit={handleSubmit} className="mb-5 flex gap-2">
      <input
        type="text"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder="Quick-add a todo (enter) or shift+enter for full editor..."
        aria-label="New todo title"
        className="flex-1 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-fuchsia-400/60 focus:outline-none dark:border-white/10 dark:bg-white/5 dark:text-slate-100 dark:placeholder:text-slate-500"
      />
      <button
        type="submit"
        disabled={!title.trim() || submitting}
        className="rounded-lg bg-gradient-to-r from-violet-500 to-fuchsia-500 px-4 py-2 text-sm font-semibold text-white hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
      >
        Add
      </button>
    </form>
  )
}
