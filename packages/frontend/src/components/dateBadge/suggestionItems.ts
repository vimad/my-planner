export interface DateSuggestionItem {
  id: 'today' | 'tomorrow' | 'pick'
  label: string
  keywords: string[]
}

const ALL_ITEMS: DateSuggestionItem[] = [
  { id: 'today', label: 'Today', keywords: ['today'] },
  { id: 'tomorrow', label: 'Tomorrow', keywords: ['tomorrow'] },
  { id: 'pick', label: 'Pick a date…', keywords: ['date', 'pick', 'calendar'] },
]

// Matches on substring against each item's keywords, not just a startsWith
// on the label - lets "@date" reach the "Pick a date…" item (whose label
// starts with "Pick") and "@to" narrow to both Today and Tomorrow.
export function filterDateSuggestionItems(query: string): DateSuggestionItem[] {
  const q = query.toLowerCase().trim()
  if (!q) return ALL_ITEMS
  return ALL_ITEMS.filter((item) => item.keywords.some((k) => k.includes(q)))
}
