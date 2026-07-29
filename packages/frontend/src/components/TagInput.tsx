import { useState, type KeyboardEvent } from 'react'

interface TagInputProps {
  tags: string[]
  onChange: (tags: string[]) => void
  suggestions?: string[]
}

// Simple tag chip input: type + Enter/comma adds a tag, Backspace on an
// empty field removes the last chip. Suggestions (from GET /api/todos/tags)
// are filtered down to what the user has typed and not already added.
export function TagInput({ tags, onChange, suggestions = [] }: TagInputProps) {
  const [inputValue, setInputValue] = useState('')

  function addTag(raw: string) {
    const tag = raw.trim()
    if (!tag || tags.includes(tag)) {
      setInputValue('')
      return
    }
    onChange([...tags, tag])
    setInputValue('')
  }

  function removeTag(tag: string) {
    onChange(tags.filter((t) => t !== tag))
  }

  function handleKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault()
      addTag(inputValue)
    } else if (e.key === 'Backspace' && inputValue === '' && tags.length > 0) {
      onChange(tags.slice(0, -1))
    }
  }

  const trimmedInput = inputValue.trim().toLowerCase()
  const filteredSuggestions = trimmedInput
    ? suggestions.filter(
        (s) => !tags.includes(s) && s.toLowerCase().includes(trimmedInput),
      )
    : []

  return (
    <div className="flex flex-col gap-2">
      <div role="list" aria-label="Tags" className="flex flex-wrap gap-2">
        {tags.map((tag) => (
          <span
            key={tag}
            role="listitem"
            className="flex items-center gap-1 rounded-full bg-slate-100 px-3 py-1 text-xs text-slate-700 dark:bg-white/10 dark:text-slate-200"
          >
            {tag}
            <button
              type="button"
              aria-label={`Remove tag ${tag}`}
              onClick={() => removeTag(tag)}
              className="text-slate-400 hover:text-slate-700 dark:hover:text-slate-100"
            >
              ×
            </button>
          </span>
        ))}
      </div>

      <div className="relative">
        <input
          type="text"
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Add a tag and press Enter"
          aria-label="Add tag"
          className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-fuchsia-400/60 focus:outline-none dark:border-white/10 dark:bg-white/5 dark:text-slate-100 dark:placeholder:text-slate-500"
        />
        {filteredSuggestions.length > 0 && (
          <ul
            role="listbox"
            aria-label="Tag suggestions"
            className="absolute z-10 mt-1 w-full rounded-lg border border-slate-200 bg-white py-1 shadow-lg dark:border-white/10 dark:bg-[#1a1229]"
          >
            {filteredSuggestions.map((s) => (
              <li key={s} role="option" aria-selected="false">
                <button
                  type="button"
                  onClick={() => addTag(s)}
                  className="w-full px-3 py-1 text-left text-sm text-slate-700 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-white/10"
                >
                  {s}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}
