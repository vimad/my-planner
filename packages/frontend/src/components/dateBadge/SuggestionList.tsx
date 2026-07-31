import { forwardRef, useEffect, useImperativeHandle, useState } from 'react'
import type { DateSuggestionItem } from './suggestionItems'

export interface SuggestionListHandle {
  onKeyDown: (props: { event: KeyboardEvent }) => boolean
}

interface SuggestionListProps {
  items: DateSuggestionItem[]
  command: (item: DateSuggestionItem) => void
}

// The "@" trigger's dropdown - Today / Tomorrow / Pick a date, filtered as
// the user keeps typing. Exposes onKeyDown via ref so the Suggestion
// plugin's render().onKeyDown can forward arrow/enter/escape into it (the
// plugin owns the keyboard, not this component's own DOM).
export const SuggestionList = forwardRef<SuggestionListHandle, SuggestionListProps>(function SuggestionList(
  { items, command },
  ref,
) {
  const [selectedIndex, setSelectedIndex] = useState(0)

  useEffect(() => {
    setSelectedIndex(0)
  }, [items])

  function selectItem(index: number) {
    const item = items[index]
    if (item) command(item)
  }

  useImperativeHandle(ref, () => ({
    onKeyDown: ({ event }) => {
      if (event.key === 'ArrowUp') {
        setSelectedIndex((i) => (i + items.length - 1) % items.length)
        return true
      }
      if (event.key === 'ArrowDown') {
        setSelectedIndex((i) => (i + 1) % items.length)
        return true
      }
      if (event.key === 'Enter') {
        selectItem(selectedIndex)
        return true
      }
      return false
    },
  }))

  if (items.length === 0) {
    return <div className="px-3 py-2 text-xs text-slate-400 dark:text-slate-500">No match</div>
  }

  return (
    <ul role="listbox" aria-label="Insert date" className="w-48 py-1">
      {items.map((item, index) => (
        <li key={item.id} role="option" aria-selected={index === selectedIndex}>
          <button
            type="button"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => selectItem(index)}
            onMouseEnter={() => setSelectedIndex(index)}
            className={`flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm ${
              index === selectedIndex
                ? 'bg-violet-100 text-violet-700 dark:bg-violet-500/30 dark:text-violet-200'
                : 'text-slate-700 dark:text-slate-200'
            }`}
          >
            <span aria-hidden="true">📅</span>
            {item.label}
          </button>
        </li>
      ))}
    </ul>
  )
})
