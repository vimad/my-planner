// PROTOTYPE — variant C: search box stays untouched; a small text toggle
// underneath expands into a wrapping strip of tag pills (visually matching
// the category-chip filter above). Collapsed by default, and even while
// collapsed the active tags still show as a compact chip row so the
// filter's state is never invisible.
import { useState } from 'react'
import { ChevronDown } from 'lucide-react'
import type { TagFilterVariantProps } from './types'

export const name = 'Collapsible tag strip'

export function VariantCollapsibleStrip({
  searchQuery,
  onSearchQueryChange,
  availableTags,
  selectedTags,
  onToggleTag,
  onClearTags,
}: TagFilterVariantProps) {
  const [expanded, setExpanded] = useState(false)

  return (
    <div className="mb-4">
      <input
        type="search"
        value={searchQuery}
        onChange={(e) => onSearchQueryChange(e.target.value)}
        placeholder="Search todos by title or body..."
        aria-label="Search todos"
        className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-fuchsia-400/60 focus:outline-none dark:border-white/10 dark:bg-white/5 dark:text-slate-100 dark:placeholder:text-slate-500"
      />

      <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          aria-expanded={expanded}
          className="flex items-center gap-1 text-xs font-medium text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200"
        >
          <ChevronDown size={12} className={`transition-transform ${expanded ? 'rotate-180' : ''}`} />
          {selectedTags.length > 0 ? `Filtered by ${selectedTags.length} tag${selectedTags.length > 1 ? 's' : ''}` : 'Filter by tag'}
        </button>

        {!expanded &&
          selectedTags.map((tag) => (
            <span
              key={tag}
              className="flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-700 dark:bg-white/10 dark:text-slate-200"
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

        {!expanded && selectedTags.length > 0 && (
          <button
            type="button"
            onClick={onClearTags}
            className="text-[11px] text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
          >
            Clear
          </button>
        )}
      </div>

      {expanded && (
        <div className="mt-2 flex flex-wrap items-center gap-1.5 rounded-lg border border-slate-200 bg-slate-50 p-2 dark:border-white/10 dark:bg-white/5">
          {availableTags.length === 0 && (
            <span className="text-xs text-slate-400 dark:text-slate-500">No tags yet</span>
          )}
          {availableTags.map((tag) => {
            const selected = selectedTags.includes(tag)
            return (
              <button
                key={tag}
                type="button"
                onClick={() => onToggleTag(tag)}
                className={`rounded-full px-2.5 py-1 text-xs font-medium transition ${
                  selected
                    ? 'bg-gradient-to-r from-violet-500 to-fuchsia-500 text-white'
                    : 'border border-slate-200 bg-white text-slate-600 hover:bg-slate-100 dark:border-white/10 dark:bg-transparent dark:text-slate-300 dark:hover:bg-white/10'
                }`}
              >
                {tag}
              </button>
            )
          })}
          {selectedTags.length > 0 && (
            <button
              type="button"
              onClick={onClearTags}
              className="ml-1 text-xs text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
            >
              Clear all
            </button>
          )}
        </div>
      )}
    </div>
  )
}
