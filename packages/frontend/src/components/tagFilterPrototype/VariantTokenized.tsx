// PROTOTYPE — variant B: tags live inside the search box itself. Typing
// still runs the normal live title/body search; if what's typed matches a
// known tag, a suggestion appears that "graduates" the text into a
// persistent chip token sitting inside the same field. No new UI real
// estate beyond the existing search input.
import { useState, type KeyboardEvent } from 'react'
import type { TagFilterVariantProps } from './types'

export const name = 'Tokenized search box'

export function VariantTokenized({
  searchQuery,
  onSearchQueryChange,
  availableTags,
  selectedTags,
  onToggleTag,
  onClearTags,
}: TagFilterVariantProps) {
  const [focused, setFocused] = useState(false)

  const trimmed = searchQuery.trim().toLowerCase()
  const suggestions = trimmed
    ? availableTags.filter((t) => !selectedTags.includes(t) && t.toLowerCase().includes(trimmed))
    : []

  function commitTag(tag: string) {
    onToggleTag(tag)
    onSearchQueryChange('')
  }

  function handleKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter' && suggestions.length > 0) {
      e.preventDefault()
      commitTag(suggestions[0])
    } else if (e.key === 'Backspace' && searchQuery === '' && selectedTags.length > 0) {
      onToggleTag(selectedTags[selectedTags.length - 1])
    }
  }

  return (
    <div className="relative mb-4">
      <div
        className={`flex w-full flex-wrap items-center gap-1.5 rounded-lg border bg-slate-50 px-2 py-1.5 dark:bg-white/5 ${
          focused ? 'border-fuchsia-400/60' : 'border-slate-200 dark:border-white/10'
        }`}
      >
        {selectedTags.map((tag) => (
          <span
            key={tag}
            className="flex shrink-0 items-center gap-1 rounded-full bg-gradient-to-r from-violet-500 to-fuchsia-500 px-2 py-0.5 text-xs font-medium text-white"
          >
            {tag}
            <button
              type="button"
              aria-label={`Remove tag filter ${tag}`}
              onClick={() => onToggleTag(tag)}
              className="text-white/80 hover:text-white"
            >
              ×
            </button>
          </span>
        ))}
        <input
          type="search"
          value={searchQuery}
          onChange={(e) => onSearchQueryChange(e.target.value)}
          onKeyDown={handleKeyDown}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          placeholder={selectedTags.length > 0 ? 'Search, or type a tag...' : 'Search todos, or type a tag to filter...'}
          aria-label="Search todos or filter by tag"
          className="min-w-[8rem] flex-1 bg-transparent px-1 py-0.5 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none dark:text-slate-100 dark:placeholder:text-slate-500"
        />
        {selectedTags.length > 0 && (
          <button
            type="button"
            onClick={onClearTags}
            className="ml-auto shrink-0 text-xs text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
          >
            Clear
          </button>
        )}
      </div>

      {suggestions.length > 0 && (
        <ul
          role="listbox"
          aria-label="Tag suggestions"
          className="absolute z-10 mt-1 w-full rounded-lg border border-slate-200 bg-white py-1 shadow-lg dark:border-white/10 dark:bg-[#1a1229]"
        >
          {suggestions.map((tag) => (
            <li key={tag}>
              <button
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => commitTag(tag)}
                className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm text-slate-700 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-white/10"
              >
                <span className="text-slate-400 dark:text-slate-500">Filter by tag:</span> {tag}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
