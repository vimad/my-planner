import type { BoardItem, BoardItemType } from '../types'

// Composite key identifying one board item - `${itemType}:${itemId}`. Used
// both as the React list key for board-grid cards (see BoardsView's
// SortableContext/dnd-kit `id`s) and as the membership key the quick-add
// icon checks against the active board's current items (see
// BoardQuickAddState.activeItemKeys in types.ts) - centralized here so both
// call sites agree on the exact same shape rather than each hand-rolling
// their own template string.
export function boardItemKey(itemType: BoardItemType, itemId: string): string {
  return `${itemType}:${itemId}`
}

export function itemKey(item: BoardItem): string {
  return boardItemKey(item.itemType, item.itemId)
}
