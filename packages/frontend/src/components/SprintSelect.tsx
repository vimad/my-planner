import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react'
import { getId } from '../utils/getId'
import type { Sprint } from '../types'

interface SprintSelectProps {
  id: string
  sprints: Sprint[]
  selectedSprintId: string | null
  onSelect: (id: string) => void
}

// Searchable sprint picker - a board can carry years of closed sprints, so a
// plain <select> listing every one is slow to scan. Typing filters by name;
// the trigger button always shows the current selection (defaults to the
// active sprint, per useSprintPlan/useStatusView's sprint effect). Adapted
// from BoardSwitcherModal's combobox (query + highlightedIndex +
// arrow/Enter/Escape), anchored inline (archetype A, docs/ui-conventions.md)
// instead of a full-screen modal.
export function SprintSelect({ id, sprints, selectedSprintId, onSelect }: SprintSelectProps) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [highlightedIndex, setHighlightedIndex] = useState(0)
  const containerRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const itemRefs = useRef<Array<HTMLButtonElement | null>>([])

  const selected = sprints.find((s) => getId(s) === selectedSprintId) ?? null

  const trimmedQuery = query.trim().toLowerCase()
  const filteredSprints = useMemo(
    () => (trimmedQuery ? sprints.filter((s) => s.name.toLowerCase().includes(trimmedQuery)) : sprints),
    [sprints, trimmedQuery],
  )

  useEffect(() => {
    if (open) inputRef.current?.focus()
  }, [open])

  // Keeps the keyboard highlight on the currently selected sprint whenever
  // the filtered list changes - same convention as BoardSwitcherModal.
  useEffect(() => {
    if (!open) return
    const activeIndex = filteredSprints.findIndex((s) => getId(s) === selectedSprintId)
    setHighlightedIndex(activeIndex >= 0 ? activeIndex : 0)
  }, [open, filteredSprints, selectedSprintId])

  useEffect(() => {
    itemRefs.current[highlightedIndex]?.scrollIntoView({ block: 'nearest' })
  }, [highlightedIndex])

  useEffect(() => {
    if (!open) return
    function onMouseDown(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    window.addEventListener('mousedown', onMouseDown)
    return () => window.removeEventListener('mousedown', onMouseDown)
  }, [open])

  function closeAndReset() {
    setOpen(false)
    setQuery('')
  }

  function selectSprint(sprintId: string) {
    onSelect(sprintId)
    closeAndReset()
  }

  function handleQueryKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Escape') {
      e.preventDefault()
      closeAndReset()
      return
    }
    if (filteredSprints.length === 0) return
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setHighlightedIndex((i) => (i + 1) % filteredSprints.length)
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setHighlightedIndex((i) => (i - 1 + filteredSprints.length) % filteredSprints.length)
    } else if (e.key === 'Enter') {
      e.preventDefault()
      const target = filteredSprints[highlightedIndex]
      if (target) selectSprint(String(getId(target)))
    }
  }

  return (
    <div ref={containerRef} className="relative">
      <button
        id={id}
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="listbox"
        aria-expanded={open}
        className="flex min-w-40 items-center justify-between gap-2 rounded-lg border border-slate-200 bg-slate-50 px-2 py-1.5 text-left text-sm text-slate-700 focus:border-fuchsia-400/60 focus:outline-none dark:border-white/10 dark:bg-white/5 dark:text-slate-200"
      >
        <span className="truncate">{selected ? `${selected.name} (${selected.state})` : 'Select sprint…'}</span>
      </button>

      {open && (
        <div className="absolute left-0 top-[calc(100%+4px)] z-10 w-72 rounded-lg border border-slate-200 bg-white py-1 shadow-lg dark:border-white/10 dark:bg-[#1a1229]">
          <div className="px-2 pb-1">
            <input
              ref={inputRef}
              type="text"
              role="combobox"
              aria-label="Search sprints"
              aria-expanded="true"
              aria-controls={`${id}-listbox`}
              aria-activedescendant={filteredSprints.length > 0 ? `${id}-option-${highlightedIndex}` : undefined}
              placeholder="Search sprints…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={handleQueryKeyDown}
              className="w-full rounded-lg border border-slate-200 bg-slate-50 px-2 py-1 text-sm text-slate-900 placeholder:text-slate-400 focus:border-fuchsia-400/60 focus:outline-none dark:border-white/10 dark:bg-white/5 dark:text-slate-100 dark:placeholder:text-slate-500"
            />
          </div>
          <div id={`${id}-listbox`} role="listbox" aria-label="Sprints" className="max-h-64 overflow-y-auto">
            {filteredSprints.length === 0 ? (
              <p className="px-3 py-1.5 text-sm text-slate-400 dark:text-slate-500">No sprints match.</p>
            ) : (
              filteredSprints.map((sprint, index) => {
                const sprintId = String(getId(sprint))
                const active = sprintId === selectedSprintId
                const highlighted = index === highlightedIndex
                return (
                  <button
                    key={sprintId}
                    ref={(el) => {
                      itemRefs.current[index] = el
                    }}
                    id={`${id}-option-${index}`}
                    type="button"
                    role="option"
                    aria-selected={highlighted}
                    onClick={() => selectSprint(sprintId)}
                    onMouseEnter={() => setHighlightedIndex(index)}
                    className={`block w-full px-3 py-1.5 text-left text-sm ${
                      active
                        ? 'bg-gradient-to-r from-violet-500 to-fuchsia-500 font-semibold text-white'
                        : highlighted
                          ? 'bg-slate-100 text-slate-700 dark:bg-white/10 dark:text-slate-200'
                          : 'text-slate-700 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-white/10'
                    }`}
                  >
                    {sprint.name} <span className="opacity-70">({sprint.state})</span>
                  </button>
                )
              })
            )}
          </div>
        </div>
      )}
    </div>
  )
}
