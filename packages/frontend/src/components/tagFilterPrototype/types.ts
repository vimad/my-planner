// PROTOTYPE — shared prop shape for the tag-filter variants. Wipe me along
// with the rest of this folder once a variant is chosen (see TagFilterPrototypeSwitcher.tsx).
export interface TagFilterVariantProps {
  searchQuery: string
  onSearchQueryChange: (value: string) => void
  availableTags: string[]
  selectedTags: string[]
  onToggleTag: (tag: string) => void
  onClearTags: () => void
}
