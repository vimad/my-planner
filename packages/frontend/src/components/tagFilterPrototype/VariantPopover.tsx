// PROTOTYPE — variant A: search box stays untouched; a single filter icon
// button next to it opens a checklist popover of every tag in use. Zero
// added width when no tags are selected; selected tags surface as a small
// removable-chip row so state is visible without reopening the popover.
import { useEffect, useRef, useState } from 'react'
import { Check, Filter } from 'lucide-react'
import type { TagFilterVariantProps } from './types'

export const name = 'Filter icon + popover'

export function VariantPopover({
  searchQuery,
  onSearchQueryChange,
  availableTags,
  selectedTags,
  onToggleTag,
  onClearTags,
}: TagFilterVariantProps) {
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    function onClickOutside(e: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onClickOutside)
    return () => document.removeEventListener('mousedown', onClickOutside)
  }, [open])

  return (
    <div className="mb-4">
      <div className="flex items-center gap-2">
        <input
          type="search"
          value={searchQuery}
          onChange={(e) => onSearchQueryChange(e.target.value)}
          placeholder="Search todos by title or body..."
          aria-label="Search todos"
          className="w-full flex-1 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-fuchsia-400/60 focus:outline-none dark:border-white/10 dark:bg-white/5 dark:text-slate-100 dark:placeholder:text-slate-500"
        />
        <div ref={rootRef} className="relative shrink-0">
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            aria-label="Filter by tag"
            aria-expanded={open}
            className={`relative flex h-[34px] w-[34px] items-center justify-center rounded-lg border transition ${
              selectedTags.length > 0
                ? 'border-fuchsia-400/60 text-fuchsia-600 dark:text-fuchsia-300'
                : 'border-slate-200 text-slate-400 hover:bg-slate-100 hover:text-slate-600 dark:border-white/10 dark:hover:bg-white/10 dark:hover:text-slate-200'
            }`}
          >
            <Filter size={15} />
            {selectedTags.length > 0 && (
              <span className="absolute -right-1.5 -top-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-gradient-to-r from-violet-500 to-fuchsia-500 px-1 text-[9px] font-bold text-white">
                {selectedTags.length}
              </span>
            )}
          </button>

          {open && (
            <div className="absolute right-0 top-[calc(100%+0.375rem)] z-10 max-h-64 w-56 overflow-y-auto rounded-lg border border-slate-200 bg-white py-1 shadow-lg dark:border-white/10 dark:bg-[#1a1229]">
              {availableTags.length === 0 && (
                <p className="px-3 py-1.5 text-sm text-slate-400 dark:text-slate-500">No tags yet</p>
              )}
              {availableTags.map((tag) => {
                const selected = selectedTags.includes(tag)
                return (
                  <button
                    key={tag}
                    type="button"
                    onClick={() => onToggleTag(tag)}
                    className={`flex w-full items-center justify-between gap-2 px-3 py-1.5 text-left text-sm ${
                      selected
                        ? 'bg-fuchsia-50 text-fuchsia-700 dark:bg-fuchsia-500/10 dark:text-fuchsia-300'
                        : 'text-slate-700 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-white/10'
                    }`}
                  >
                    {tag}
                    {selected && <Check size={13} className="shrink-0" />}
                  </button>
                )
              })}
              {selectedTags.length > 0 && (
                <>
                  <div className="my-1 border-t border-slate-200 dark:border-white/10" />
                  <button
                    type="button"
                    onClick={onClearTags}
                    className="block w-full px-3 py-1.5 text-left text-sm text-slate-500 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-white/10"
                  >
                    Clear tag filters
                  </button>
                </>
              )}
            </div>
          )}
        </div>
      </div>

      {selectedTags.length > 0 && (
        <div className="mt-2 flex flex-wrap items-center gap-1.5">
          {selectedTags.map((tag) => (
            <span
              key={tag}
              className="flex items-center gap-1 rounded-full bg-slate-100 px-2.5 py-1 text-xs text-slate-700 dark:bg-white/10 dark:text-slate-200"
            >
              {tag}
              <button
                type="button"
                aria-label={`Remove tag filter ${tag}`}
                onClick={() => onToggleTag(tag)}
                className="text-slate-400 hover:text-slate-700 dark:hover:text-slate-100"
              >
                ×
              </button>
            </span>
          ))}
        </div>
      )}
    </div>
  )
}
