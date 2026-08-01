import { useEffect, useRef, useState, type RefObject } from 'react'

export interface FlyEvent {
  fromRect: DOMRect
}

interface FlyToBoardsBadgeProps {
  flyEvent: FlyEvent | null
  targetRef: RefObject<HTMLElement | null>
  // Fires once the ghost lands (or immediately if the target ref isn't
  // mounted yet) - App.tsx uses this to clear the in-flight event and bump
  // the badge's pop, per spec ("increments the badge with a brief pop").
  onComplete: () => void
}

const DURATION_MS = 420
const ARC_HEIGHT = 55

// Arcing fly animation (easeOutCubic, ~420ms) from a clicked quick-add icon
// to the Boards tab's count-chip badge - see the Boards spec's quick-add
// icon section, and the validated prototype (branch
// prototype/boards-quick-add-icon-variants, FlyGhost.tsx variant A, the
// winner - this is that same tween, adapted to plain props instead of the
// prototype's throwaway context). Plain requestAnimationFrame tween, no
// animation library in this project. Only ever fires on add - removing is
// instant with no reverse animation, per spec.
export function FlyToBoardsBadge({ flyEvent, targetRef, onComplete }: FlyToBoardsBadgeProps) {
  const [style, setStyle] = useState<{ left: number; top: number; scale: number; opacity: number } | null>(null)
  const rafRef = useRef<number | null>(null)

  useEffect(() => {
    if (!flyEvent) return
    const target = targetRef.current
    if (!target) {
      onComplete()
      return
    }
    const targetRect = target.getBoundingClientRect()
    const start = {
      x: flyEvent.fromRect.left + flyEvent.fromRect.width / 2,
      y: flyEvent.fromRect.top + flyEvent.fromRect.height / 2,
    }
    const end = { x: targetRect.left + targetRect.width / 2, y: targetRect.top + targetRect.height / 2 }
    const startTime = performance.now()

    function tick(now: number) {
      const t = Math.min(1, (now - startTime) / DURATION_MS)
      const ease = 1 - Math.pow(1 - t, 3)
      const x = start.x + (end.x - start.x) * ease
      const arc = Math.sin(Math.PI * ease) * -ARC_HEIGHT
      const y = start.y + (end.y - start.y) * ease + arc
      setStyle({ left: x, top: y, scale: 1 - 0.7 * ease, opacity: 1 - Math.max(0, ease - 0.55) / 0.45 })
      if (t < 1) {
        rafRef.current = requestAnimationFrame(tick)
      } else {
        onComplete()
      }
    }
    rafRef.current = requestAnimationFrame(tick)
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current)
    }
    // Deliberately keyed only on flyEvent - targetRef is a stable ref object
    // and onComplete is read fresh via closure each run; re-subscribing on
    // every render would restart the tween mid-flight.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [flyEvent])

  if (!flyEvent || !style) return null

  return (
    <div
      aria-hidden
      className="pointer-events-none fixed z-[1200] h-3 w-3 rounded-full bg-fuchsia-500"
      style={{
        left: style.left,
        top: style.top,
        transform: `translate(-50%, -50%) scale(${style.scale})`,
        opacity: style.opacity,
      }}
    />
  )
}
