import { useRef, type MouseEvent } from 'react'
import { boardItemKey } from '../utils/boardItemKey'
import type { BoardItemType, BoardQuickAddState } from '../types'

interface QuickAddIconProps {
  itemType: BoardItemType
  itemId: string
  label: string
  quickAdd: BoardQuickAddState
}

// The one pin quick-add icon shared by every insertion point - TodoItem's
// row and NotesView's note row (see the Boards spec's "Quick-add icon"
// section, and ticket 14). Outline (📍) at rest, filled (📌) once the item
// is on the *active* board specifically. Visual/animation shape (pin, arc,
// corner-chip badge) is the winning variant validated live on branch
// prototype/boards-quick-add-icon-variants - this component only owns the
// icon's own render/click; the fly animation itself is owned by App.tsx
// (see FlyToBoardsBadge), since it flies to a target (the Boards tab badge)
// far outside this row.
export function QuickAddIcon({ itemType, itemId, label, quickAdd }: QuickAddIconProps) {
  const ref = useRef<HTMLButtonElement>(null)
  const active = quickAdd.activeItemKeys.has(boardItemKey(itemType, itemId))
  const ariaLabel = `${active ? 'Remove' : 'Add'} "${label}" ${active ? 'from' : 'to'} the active board`

  function handleClick(e: MouseEvent) {
    // Rows this renders inside (TodoItem, NotesView's note row) have their
    // own click handling (open detail, select note) on an ancestor - this
    // click must never bubble into that.
    e.stopPropagation()
    if (active) {
      quickAdd.onRemove(itemType, itemId)
    } else if (ref.current) {
      quickAdd.onAdd(itemType, itemId, label, ref.current)
    }
  }

  return (
    <button
      ref={ref}
      type="button"
      aria-label={ariaLabel}
      aria-pressed={active}
      title={ariaLabel}
      onClick={handleClick}
      className={`quick-add-icon shrink-0 rounded-full p-0.5 text-sm leading-none transition ${
        active
          ? 'text-fuchsia-500 dark:text-fuchsia-400'
          : 'text-slate-400 hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-white/10 dark:hover:text-slate-200'
      }`}
    >
      {active ? '📌' : '📍'}
    </button>
  )
}
