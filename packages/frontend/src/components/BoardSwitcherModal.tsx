import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import { getId } from '../utils/getId'
import type { Board } from '../types'

interface BoardSwitcherModalProps {
  boards: Board[]
  activeBoardId: string | null
  onSelect: (id: string) => void
  onCreate: (name: string) => Promise<void>
  onClose: () => void
}

// Global "switch active board" palette, opened from anywhere in the app via
// the Ctrl+A shortcut (see App.tsx's window-level keydown effect) - lets the
// user change Profile.activeBoardId without first navigating to the Boards
// tab. Deliberately a thin list+create modal rather than reusing BoardsView's
// own BoardSwitcher: that one is inline/dropdown-shaped and lives inside the
// Boards tab's DOM, so it can't be triggered globally the way a fixed overlay
// can.
export function BoardSwitcherModal({ boards, activeBoardId, onSelect, onCreate, onClose }: BoardSwitcherModalProps) {
  const [query, setQuery] = useState('')
  const [creating, setCreating] = useState(boards.length === 0)
  const [draftName, setDraftName] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [highlightedIndex, setHighlightedIndex] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const itemRefs = useRef<Array<HTMLButtonElement | null>>([])

  useEffect(() => {
    inputRef.current?.focus()
  }, [creating])

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [onClose])

  const trimmedQuery = query.trim().toLowerCase()
  const filteredBoards = useMemo(
    () => (trimmedQuery ? boards.filter((b) => b.name.toLowerCase().includes(trimmedQuery)) : boards),
    [boards, trimmedQuery],
  )

  // Keeps the keyboard highlight on the currently active board whenever the
  // filtered list changes (query edited, boards list refreshed) - falling
  // back to the top result when the active board has been filtered out or
  // there isn't one yet (e.g. the very first board).
  useEffect(() => {
    const activeIndex = filteredBoards.findIndex((b) => String(getId(b)) === activeBoardId)
    setHighlightedIndex(activeIndex >= 0 ? activeIndex : 0)
  }, [filteredBoards, activeBoardId])

  // Keeps the highlighted row scrolled into view as arrow keys move it past
  // the visible edge of the (max-h-72, overflow-y-auto) list.
  useEffect(() => {
    itemRefs.current[highlightedIndex]?.scrollIntoView({ block: 'nearest' })
  }, [highlightedIndex])

  function handleQueryKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (filteredBoards.length === 0) return
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setHighlightedIndex((i) => (i + 1) % filteredBoards.length)
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setHighlightedIndex((i) => (i - 1 + filteredBoards.length) % filteredBoards.length)
    } else if (e.key === 'Enter') {
      e.preventDefault()
      onSelect(String(getId(filteredBoards[highlightedIndex])))
    }
  }

  async function submitCreate(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const name = draftName.trim()
    if (!name) return
    setSubmitting(true)
    try {
      await onCreate(name)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div
      className="fixed inset-0 z-[70] flex items-start justify-center bg-black/60 p-4 pt-[15vh]"
      role="dialog"
      aria-modal="true"
      aria-label="Switch active board"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-4 text-slate-900 shadow-xl dark:border-white/10 dark:bg-[#160f24] dark:text-slate-100">
        {creating ? (
          <form onSubmit={submitCreate} className="flex items-center gap-2">
            <input
              ref={inputRef}
              type="text"
              aria-label="New board name"
              placeholder={boards.length === 0 ? 'Name your first board…' : 'New board name…'}
              value={draftName}
              onChange={(e) => setDraftName(e.target.value)}
              className="flex-1 rounded-lg border border-fuchsia-400/60 bg-white px-3 py-1.5 text-sm text-slate-900 outline-none dark:bg-white/5 dark:text-slate-100"
            />
            <button
              type="submit"
              disabled={submitting}
              className="shrink-0 rounded-full bg-gradient-to-r from-violet-500 to-fuchsia-500 px-3 py-1.5 text-xs font-semibold text-white hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {submitting ? 'Creating...' : boards.length === 0 ? 'Create board' : 'Create'}
            </button>
            {boards.length > 0 && (
              <button
                type="button"
                onClick={() => {
                  setCreating(false)
                  setDraftName('')
                }}
                className="shrink-0 text-xs text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
              >
                Cancel
              </button>
            )}
          </form>
        ) : (
          <>
            <div className="flex items-center gap-2">
              <input
                ref={inputRef}
                type="text"
                role="combobox"
                aria-label="Filter boards"
                aria-expanded="true"
                aria-controls="board-switcher-list"
                aria-activedescendant={filteredBoards.length > 0 ? `board-switcher-option-${highlightedIndex}` : undefined}
                placeholder="Switch to board…"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={handleQueryKeyDown}
                className="flex-1 rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 text-sm text-slate-900 placeholder:text-slate-400 focus:border-fuchsia-400/60 focus:outline-none dark:border-white/10 dark:bg-white/5 dark:text-slate-100 dark:placeholder:text-slate-500"
              />
              <button
                type="button"
                onClick={() => setCreating(true)}
                className="shrink-0 rounded-full border border-dashed border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-500 hover:bg-slate-100 dark:border-white/20 dark:text-slate-300 dark:hover:bg-white/10"
              >
                + New board
              </button>
            </div>

            <div id="board-switcher-list" role="listbox" aria-label="Boards" className="mt-2 max-h-72 overflow-y-auto">
              {filteredBoards.length === 0 ? (
                <p className="px-2 py-3 text-sm text-slate-400 dark:text-slate-500">No boards match.</p>
              ) : (
                filteredBoards.map((board, index) => {
                  const id = String(getId(board))
                  const active = id === activeBoardId
                  const highlighted = index === highlightedIndex
                  return (
                    <button
                      key={id}
                      ref={(el) => {
                        itemRefs.current[index] = el
                      }}
                      id={`board-switcher-option-${index}`}
                      type="button"
                      role="option"
                      aria-selected={highlighted}
                      onClick={() => onSelect(id)}
                      onMouseEnter={() => setHighlightedIndex(index)}
                      className={`flex w-full items-center justify-between gap-2 rounded-lg px-3 py-2 text-left text-sm ${
                        active
                          ? 'bg-gradient-to-r from-violet-500 to-fuchsia-500 font-semibold text-white'
                          : highlighted
                            ? 'bg-slate-100 text-slate-700 dark:bg-white/10 dark:text-slate-200'
                            : 'text-slate-700 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-white/10'
                      } ${highlighted ? 'ring-2 ring-fuchsia-400/60' : ''}`}
                    >
                      <span className="truncate">{board.name}</span>
                      <span className={`shrink-0 text-xs ${active ? 'text-white/80' : 'text-slate-400 dark:text-slate-500'}`}>
                        {board.items.length}
                      </span>
                    </button>
                  )
                })
              )}
            </div>
          </>
        )}
      </div>
    </div>
  )
}
