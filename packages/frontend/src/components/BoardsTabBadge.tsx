import { forwardRef } from 'react'

interface BoardsTabBadgeProps {
  label: string
  count: number
  // True for a brief window right after a fly animation lands (see
  // FlyToBoardsBadge's onComplete) - drives the badge's "pop" per spec.
  // Never set on a quick-remove, which decrements the count with no pop.
  bumped: boolean
}

// The Boards tab's own label plus its corner-chip toggle badge (see the
// Boards spec's "Quick-add icon" section - variant A, the validated winner
// from prototype/boards-quick-add-icon-variants). `count` always reflects
// the active board's current item count regardless of which tab is open,
// since App.tsx derives it from the same hooks/useBoards state BoardsView
// itself reads - not anything local to this component. The forwarded ref is
// set by App.tsx as FlyToBoardsBadge's landing target.
export const BoardsTabBadge = forwardRef<HTMLSpanElement, BoardsTabBadgeProps>(function BoardsTabBadge(
  { label, count, bumped },
  ref,
) {
  return (
    <span className="relative inline-flex items-center">
      {label}
      <span
        ref={ref}
        className={`absolute -right-3 -top-2.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-fuchsia-500 px-1 text-[10px] font-bold leading-none text-white shadow transition-transform duration-300 ${
          count > 0 ? 'opacity-100' : 'opacity-0'
        } ${bumped ? 'scale-125' : 'scale-100'}`}
      >
        {count}
      </span>
    </span>
  )
})
