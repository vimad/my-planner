import { createRoot, type Root } from 'react-dom/client'
import { useEffect, useRef, type ReactNode } from 'react'

// Minimal shape this needs to anchor a popup - satisfied by both a real
// DOMRect (badge click's getBoundingClientRect()) and the plain
// {left,top,right,bottom} object ProseMirror's coordsAtPos() returns (used
// when reopening the picker after the "@date" suggestion already exited).
export interface AnchorRect {
  left: number
  top: number
  bottom: number
}

// Fixed-position wrapper for the date picker popup - needs to escape the
// editor's (and, for the enlarged notes editor, an animating panel's)
// overflow/scroll containers, which TagInput's `absolute` +
// `relative`-ancestor pattern can't do.
function FloatingPanel({
  rect,
  onClose,
  children,
}: {
  rect: AnchorRect
  onClose: () => void
  children: ReactNode
}) {
  const panelRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function handlePointerDown(e: PointerEvent) {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        onClose()
      }
    }
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('pointerdown', handlePointerDown, true)
    document.addEventListener('keydown', handleKeyDown, true)
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown, true)
      document.removeEventListener('keydown', handleKeyDown, true)
    }
  }, [onClose])

  // Flip above the anchor when there isn't room below - the notes editor
  // (especially the enlarged panel) can put the trigger near the bottom of
  // the viewport.
  const spaceBelow = window.innerHeight - rect.bottom
  const openUpward = spaceBelow < 320 && rect.top > spaceBelow

  const style = openUpward
    ? { left: rect.left, bottom: window.innerHeight - rect.top + 6 }
    : { left: rect.left, top: rect.bottom + 6 }

  return (
    <div
      ref={panelRef}
      style={{ position: 'fixed', zIndex: 80, ...style }}
      className="rounded-lg border border-slate-200 bg-white shadow-lg dark:border-white/10 dark:bg-[#1a1229]"
    >
      {children}
    </div>
  )
}

// Mounts a FloatingPanel into document.body outside the React tree it was
// called from - the suggestion plugin and the badge NodeView both live
// inside imperative Tiptap/ProseMirror code, not a component with state to
// hang a portal off of. Returns a destroy() that unmounts and removes the
// container; render(close) lets the caller wire its own actions (picking a
// date, removing a badge) to also tear the panel down.
export function mountFloatingPanel(rect: AnchorRect, render: (close: () => void) => ReactNode): () => void {
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root: Root = createRoot(container)

  function destroy() {
    root.unmount()
    container.remove()
  }

  root.render(
    <FloatingPanel rect={rect} onClose={destroy}>
      {render(destroy)}
    </FloatingPanel>,
  )

  return destroy
}
