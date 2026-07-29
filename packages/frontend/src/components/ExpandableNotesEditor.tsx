import type { JSONContent } from '@tiptap/core'
import { forwardRef, useEffect, useImperativeHandle, useLayoutEffect, useRef, useState } from 'react'
import { RichTextEditor, type RichTextEditorHandle } from './RichTextEditor'

// Duration of the FLIP grow/shrink transform transition - kept in one place
// so the enlarge and collapse animations (and the collapse fallback timeout
// below) always agree.
const FLIP_DURATION_MS = 200

type Phase = 'inline' | 'enlarged' | 'collapsing'

interface ExpandableNotesEditorProps {
  content?: JSONContent | JSONContent[] | null
  editable: boolean
  className?: string
  toolbar?: boolean
  contentClassName?: string
}

// Large centered panel, sized to occupy most of the viewport without going
// edge-to-edge - visually consistent with TodoDetail's own rounded-2xl/
// shadow-xl dark-glass popup, but stacked above it (TodoDetail is z-50).
const ENLARGED_PANEL_CLASSES =
  'fixed inset-0 z-[61] m-auto flex h-fit min-h-[50vh] max-h-[85vh] w-[min(92vw,64rem)] flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white p-4 text-slate-900 shadow-xl dark:border-white/10 dark:bg-[#160f24] dark:text-slate-100'

const ICON_BUTTON_CLASSES =
  'inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-slate-200 bg-white/80 text-slate-500 shadow-sm transition hover:bg-slate-100 dark:border-white/10 dark:bg-white/10 dark:text-slate-300 dark:hover:bg-white/20'

function EnlargeIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-3.5 w-3.5">
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 4H4v5M15 4h5v5M9 20H4v-5M15 20h5v-5" />
    </svg>
  )
}

function ShrinkIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-3.5 w-3.5">
      <path strokeLinecap="round" strokeLinejoin="round" d="M4 9h5V4M20 9h-5V4M4 15h5v5M20 15h-5v5" />
    </svg>
  )
}

// Wraps a single RichTextEditor instance with an enlarge/shrink affordance.
// RichTextEditor itself is never told about enlarge state and is rendered
// exactly once, in one JSX position, for the lifetime of this component -
// only the wrapping panel's classes/transform change between inline and
// enlarged. That's what guarantees the same Tiptap editor instance (and its
// document, cursor, and scroll position) survives both transitions: nothing
// here ever conditionally mounts/unmounts RichTextEditor or changes its key.
//
// Enlarging plays a FLIP-style animation: the panel's on-screen rect is
// measured right before flipping to the enlarged (fixed, centered) layout,
// then an inverse transform is applied instantly so the panel still *looks*
// like it's in its original inline spot, and that transform is animated back
// to identity so it visibly grows into place. Collapsing plays the same
// transform in reverse, and only tears the overlay down (returns to the
// inline layout) once the transition finishes - via `transitionend`, or a
// matched-duration timeout as a fallback in case that event doesn't fire.
// A hidden placeholder (same className) fills the panel's original spot for
// as long as it's popped out, so pulling it into `fixed` positioning never
// collapses/reflows whatever sits below it in the caller's layout.
export const ExpandableNotesEditor = forwardRef<RichTextEditorHandle, ExpandableNotesEditorProps>(
  function ExpandableNotesEditor({ content, editable, className, toolbar, contentClassName }, ref) {
    const [phase, setPhase] = useState<Phase>('inline')
    const panelRef = useRef<HTMLDivElement>(null)
    // Last-measured inline rect - captured once at enlarge time and reused
    // as-is for the collapse target too (no live resize/scroll tracking, per
    // spec: it's fine for the shrink animation to target this as a
    // last-known position rather than a continuously-updated one).
    const originalRectRef = useRef<DOMRect | null>(null)
    const editorRef = useRef<RichTextEditorHandle>(null)

    useImperativeHandle(ref, () => ({ getJSON: () => editorRef.current?.getJSON() ?? null }), [])

    const overlayActive = phase !== 'inline'

    function handleEnlarge() {
      if (phase !== 'inline') return
      originalRectRef.current = panelRef.current?.getBoundingClientRect() ?? null
      setPhase('enlarged')
    }

    function handleShrink() {
      if (phase !== 'enlarged') return
      setPhase('collapsing')
    }

    // Escape only dismisses while fully enlarged - once collapsing starts
    // this listener is already detached (effect below re-runs on `phase`),
    // so a second Escape press mid-animation is a no-op rather than
    // re-triggering the collapse.
    useEffect(() => {
      if (phase !== 'enlarged') return
      // Already known to be 'enlarged' here, so collapsing can be triggered
      // directly rather than through handleShrink's (redundant, in this
      // context) phase guard.
      function onKeyDown(e: KeyboardEvent) {
        if (e.key === 'Escape') setPhase('collapsing')
      }
      window.addEventListener('keydown', onKeyDown)
      return () => window.removeEventListener('keydown', onKeyDown)
    }, [phase])

    // Drives the FLIP transform itself - runs whenever `phase` changes to
    // 'enlarged' (play the enter animation: instantly jump to an inverted
    // transform, then animate to identity) or 'collapsing' (animate from
    // identity to the inverted transform, then hand off to 'inline').
    useLayoutEffect(() => {
      const el = panelRef.current
      const target = originalRectRef.current
      if (!el || !target) return

      function invertedTransform(): string {
        const current = el!.getBoundingClientRect()
        const dx = target!.left - current.left
        const dy = target!.top - current.top
        const scaleX = current.width ? target!.width / current.width : 1
        const scaleY = current.height ? target!.height / current.height : 1
        return `translate(${dx}px, ${dy}px) scale(${scaleX}, ${scaleY})`
      }

      if (phase === 'enlarged') {
        el.style.transformOrigin = 'top left'
        el.style.transition = 'none'
        el.style.transform = invertedTransform()
        let raf2 = 0
        const raf1 = requestAnimationFrame(() => {
          raf2 = requestAnimationFrame(() => {
            el.style.transition = `transform ${FLIP_DURATION_MS}ms ease`
            el.style.transform = 'translate(0px, 0px) scale(1, 1)'
          })
        })
        return () => {
          cancelAnimationFrame(raf1)
          cancelAnimationFrame(raf2)
        }
      }

      if (phase === 'inline') {
        // Clears any transform left over from a prior collapse. This must
        // happen in a *layout* effect (synchronous, pre-paint) rather than
        // inside the transitionend handler below - clearing it there would
        // run before React has committed the DOM's className back to the
        // plain inline one (still `fixed`, full-size ENLARGED_PANEL_CLASSES
        // at that point), so the browser could paint a full-size flash of
        // the panel with no transform holding it small before the next
        // commit swaps the class. Doing it here instead means the class
        // swap and the style cleanup land in the same pre-paint pass.
        el.style.transition = ''
        el.style.transform = ''
        el.style.transformOrigin = ''
        return
      }

      // Only 'collapsing' plays a transform below.
      if (phase !== 'collapsing') return

      el.style.transformOrigin = 'top left'
      el.style.transition = `transform ${FLIP_DURATION_MS}ms ease`
      el.style.transform = invertedTransform()

      // Only flips the phase - see the 'inline' branch above for why the
      // actual style cleanup is deferred rather than done here.
      let done = false
      const finish = () => {
        if (done) return
        done = true
        window.clearTimeout(timeoutId)
        el.removeEventListener('transitionend', onEnd)
        setPhase('inline')
      }
      function onEnd(e: TransitionEvent) {
        if (e.target === el && e.propertyName === 'transform') finish()
      }
      el.addEventListener('transitionend', onEnd)
      const timeoutId = window.setTimeout(finish, FLIP_DURATION_MS + 60)

      return () => {
        el.removeEventListener('transitionend', onEnd)
        window.clearTimeout(timeoutId)
      }
    }, [phase])

    return (
      <>
        {overlayActive && (
          <button
            type="button"
            title="Close enlarged notes editor"
            aria-label="Close enlarged notes editor"
            onClick={handleShrink}
            className="fixed inset-0 z-[60] cursor-default bg-black/60"
          />
        )}
        {overlayActive && (
          // Reserves the panel's original spot in the flow for as long as
          // it's popped out as a `fixed` overlay (which removes it from
          // flow and would otherwise collapse this space, reflowing
          // whatever sits below it in TodoDetail - then reflowing again,
          // right as the collapse transform lands, producing a visible
          // jump). An invisible placeholder keeps that space held the whole
          // time so returning to inline is a no-op for layout, not a
          // reflow. It's given the originally-measured height explicitly
          // (rather than relying on `className` alone) because the real
          // panel's height includes the icon-row header rendered inside
          // it, which this empty placeholder has no other way to imply.
          <div
            aria-hidden="true"
            className={className}
            style={{ visibility: 'hidden', height: originalRectRef.current?.height }}
          />
        )}
        <div
          ref={panelRef}
          role={overlayActive ? 'dialog' : undefined}
          aria-modal={overlayActive ? true : undefined}
          aria-label={overlayActive ? 'Enlarged notes editor' : undefined}
          className={overlayActive ? ENLARGED_PANEL_CLASSES : className}
        >
          <div className="mb-1 flex justify-end">
            <button
              type="button"
              title={overlayActive ? 'Shrink notes editor' : 'Enlarge notes editor'}
              aria-label={overlayActive ? 'Shrink notes editor' : 'Enlarge notes editor'}
              onMouseDown={(e) => e.preventDefault()}
              onClick={overlayActive ? handleShrink : handleEnlarge}
              className={ICON_BUTTON_CLASSES}
            >
              {overlayActive ? <ShrinkIcon /> : <EnlargeIcon />}
            </button>
          </div>
          <div className={overlayActive ? 'min-h-0 flex-1 overflow-hidden' : undefined}>
            <RichTextEditor
              ref={editorRef}
              content={content}
              editable={editable}
              toolbar={toolbar}
              contentClassName={contentClassName}
            />
          </div>
        </div>
      </>
    )
  },
)
