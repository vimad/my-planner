import type { JSONContent } from '@tiptap/core'
import { createDocument } from '@tiptap/core'
import type { Node as ProseMirrorNode } from '@tiptap/pm/model'
import type { Editor } from '@tiptap/react'
import { EditorContent, useEditor, useEditorState } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import { TaskItem, TaskList } from '@tiptap/extension-list'
import Underline from '@tiptap/extension-underline'
import Link from '@tiptap/extension-link'
import type { RefObject } from 'react'
import { forwardRef, useEffect, useImperativeHandle, useRef } from 'react'
import { DATE_BADGE_EXTENSIONS } from './dateBadge'

// StarterKit's bundled Link extension makes the link mark `inclusive` when
// autolink is on, so text typed right after a URL keeps extending the same
// link instead of starting fresh. Disable the bundled copy and configure our
// own with `inclusive: false` so typing past a linkified URL (e.g. after a
// space) drops out of the mark.
const LinkExtension = Link.extend({ inclusive: false })

// StarterKit already registers BulletList/OrderedList/ListItem (it pulls them
// from @tiptap/extension-list internally) and Bold/Italic marks - Underline
// is the only common formatting mark StarterKit doesn't include, so it's
// added on top alongside checklist support.
const EXTENSIONS = [
  StarterKit.configure({ link: false }),
  TaskList,
  TaskItem.configure({ nested: true }),
  Underline,
  LinkExtension,
  ...DATE_BADGE_EXTENSIONS,
]

// Baseline content styling every editor instance gets for free, regardless
// of call site - list/underline/strike marks and link highlighting were
// previously copy-pasted per call site via `contentClassName`, and silently
// missing from several of them (Scratchpad, NotesView, BoardsView), which is
// exactly the kind of drift a shared component is supposed to prevent.
// `contentClassName` is still how a caller adds its own layout concerns
// (sizing, scrolling, min-height) on top of this.
const DEFAULT_CONTENT_CLASSES =
  'flex flex-col [&_.tiptap]:outline-none [&_.tiptap]:flex-1 [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:list-decimal [&_ol]:pl-5 [&_u]:underline [&_s]:line-through [&_a]:text-fuchsia-600 [&_a]:no-underline [&_a]:cursor-pointer [&_a:hover]:text-fuchsia-700 [&_a:hover]:underline dark:[&_a]:text-fuchsia-300 dark:[&_a:hover]:text-fuchsia-200'

// Marks toggleable from the toolbar - a subset of ToolbarState's keys, kept
// as its own union so TOOLBAR_BUTTONS entries and `state[mark]` lookups both
// stay type-safe.
type ToggleableMark = 'bold' | 'italic' | 'underline' | 'strike'

interface ToolbarButtonConfig {
  mark: ToggleableMark
  label: string
  title: string
  className: string
}

const TOOLBAR_BUTTONS: ToolbarButtonConfig[] = [
  { mark: 'bold', label: 'B', title: 'Bold', className: 'font-bold' },
  { mark: 'italic', label: 'I', title: 'Italic', className: 'italic' },
  { mark: 'underline', label: 'U', title: 'Underline', className: 'underline' },
  { mark: 'strike', label: 'S', title: 'Strikethrough', className: 'line-through' },
]

interface ToolbarState {
  bold: boolean
  italic: boolean
  underline: boolean
  strike: boolean
  bulletList: boolean
  orderedList: boolean
}

function Toolbar({ editor }: { editor: Editor }) {
  const state = useEditorState({
    editor,
    selector: ({ editor: e }): ToolbarState => ({
      bold: e.isActive('bold'),
      italic: e.isActive('italic'),
      underline: e.isActive('underline'),
      strike: e.isActive('strike'),
      bulletList: e.isActive('bulletList'),
      orderedList: e.isActive('orderedList'),
    }),
  })

  function buttonClass(active: boolean) {
    return `rounded px-2 py-1 text-xs font-semibold transition ${
      active
        ? 'bg-fuchsia-100 text-fuchsia-700 dark:bg-fuchsia-500/30 dark:text-fuchsia-200'
        : 'text-slate-500 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-white/10'
    }`
  }

  return (
    <div className="mb-1 flex flex-wrap gap-1 border-b border-slate-200 pb-1 dark:border-white/10">
      {TOOLBAR_BUTTONS.map(({ mark, label, title, className }) => (
        <button
          key={mark}
          type="button"
          title={title}
          aria-label={title}
          aria-pressed={state[mark]}
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => editor.chain().focus().toggleMark(mark).run()}
          className={buttonClass(state[mark])}
        >
          <span className={className}>{label}</span>
        </button>
      ))}
      <span className="mx-1 w-px bg-slate-200 dark:bg-white/10" aria-hidden="true" />
      <button
        type="button"
        title="Bullet list"
        aria-label="Bullet list"
        aria-pressed={state.bulletList}
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => editor.chain().focus().toggleBulletList().run()}
        className={buttonClass(state.bulletList)}
      >
        •—
      </button>
      <button
        type="button"
        title="Numbered list"
        aria-label="Numbered list"
        aria-pressed={state.orderedList}
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => editor.chain().focus().toggleOrderedList().run()}
        className={buttonClass(state.orderedList)}
      >
        1.—
      </button>
    </div>
  )
}

// Recomputes the dirty comparison (live doc vs. `baselineRef`) on every
// transaction, firing `onDirtyChange` only at clean<->dirty boundary
// crossings. Split into its own component - mounted only once `editor`
// exists, mirroring how Toolbar above is only rendered once `editor` is
// truthy - rather than calling useEditorState unconditionally from
// RichTextEditor itself. That matters because useEditorState's snapshot is
// only refreshed by a subsequent transaction/update event on whatever
// editor it was subscribed to; calling it from the very first render (while
// `editor` is still null, since RichTextEditor uses `immediatelyRender:
// false`) would leave it permanently subscribed to that initial null editor
// until some later transaction happened to fire - which, for content that's
// already dirty at mount with no further edits, never happens. Mounting
// fresh once `editor` is real sidesteps that entirely.
function DirtyTracker({
  editor,
  baselineRef,
  onDirtyChange,
}: {
  editor: Editor
  baselineRef: RefObject<ProseMirrorNode | null>
  onDirtyChange?: (dirty: boolean) => void
}) {
  const dirty = useEditorState({
    editor,
    selector: ({ editor: e }) => (baselineRef.current ? !e.state.doc.eq(baselineRef.current) : false),
  })

  useEffect(() => {
    onDirtyChange?.(dirty)
  }, [dirty, onDirtyChange])

  return null
}

// Imperative handle exposed via ref - lets a parent (Scratchpad,
// ScratchNoteCard, TodoDetail) pull the live document out of an editable
// instance right before it unmounts/collapses, without lifting the whole
// document into controlled state on every keystroke.
export interface RichTextEditorHandle {
  getJSON: () => JSONContent | null
  // Resets the internal dirty-tracking baseline to the current document,
  // immediately flipping dirty back to false (firing onDirtyChange(false)
  // if it was previously true). Does not alter the document itself.
  markSaved: () => void
}

interface RichTextEditorProps {
  content?: JSONContent | JSONContent[] | null
  // Last-known-saved-to-database document, used as the baseline for dirty
  // tracking - distinct from `content`, which only seeds the editor's
  // initial document and may be an in-memory, not-yet-persisted override.
  // Defaults to `content` when omitted, so callers that don't care about
  // dirty tracking (Scratchpad, ScratchNoteCard) are unaffected.
  savedContent?: JSONContent | JSONContent[] | null
  editable: boolean
  className?: string
  toolbar?: boolean
  contentClassName?: string
  // Invoked only at the two boundary crossings (clean->dirty, dirty->clean),
  // not on every transaction/keystroke.
  onDirtyChange?: (dirty: boolean) => void
}

// Shared rich-text editor for todo bodies and scratch notes. The same Tiptap
// Editor instance and JSON document render both edit mode and a read-only
// view mode via the `editable` prop - there is intentionally no separate
// read-only renderer, so the two can never drift apart. `toolbar` opts a
// call site into a formatting toolbar (shown only while editable).
// `contentClassName`, if given, wraps just the editable content (not the
// toolbar) so a call site can cap long documents to a max height with its
// own scrollbar while the toolbar stays pinned above it.
//
// `EditorContent` (from @tiptap/react) renders its own unstyled wrapper div
// directly around the ProseMirror root (`.tiptap`) - one more layer than a
// call site's `contentClassName` div can see. That matters because a
// percentage height on `.tiptap` (e.g. `[&_.tiptap]:min-h-full`, used by
// callers that want the editor to fill a flex-sized pane) resolves against
// that immediate wrapper, not against `contentClassName`'s own flex-sized
// box - and since the wrapper is a plain auto-height block, the percentage
// silently collapses to content height instead. Giving that wrapper a fixed
// `flex flex-col` of its own and making `.tiptap` a `flex-1` child of it
// (below) threads a real flex-grow chain through that extra layer instead,
// which - unlike a percentage - degrades gracefully to ordinary
// content-based sizing when no flex ancestor provides extra space, so it's
// safe to apply unconditionally for every call site (including the ones
// using a fixed-pixel `[&_.tiptap]:min-h-[Npx]` instead).
export const RichTextEditor = forwardRef<RichTextEditorHandle, RichTextEditorProps>(function RichTextEditor(
  { content, savedContent, editable, className, toolbar = false, contentClassName, onDirtyChange },
  ref,
) {
  const editor = useEditor(
    {
      extensions: EXTENSIONS,
      content: content ?? '',
      editable,
      immediatelyRender: false,
    },
    [],
  )

  useEffect(() => {
    if (editor && editor.isEditable !== editable) {
      editor.setEditable(editable)
    }
  }, [editor, editable])

  // Dirty-tracking baseline: the last-known-saved ProseMirror document,
  // seeded once from `savedContent` (falling back to `content`) as soon as
  // the editor (and its schema) exists, then only ever updated by
  // markSaved(). Built from `editor.schema` specifically (not a separately
  // constructed Schema, even from the same extensions config) - ProseMirror
  // node/mark equality is partly by schema-object identity, so a baseline
  // built from a different Schema instance would never compare equal to the
  // live doc no matter its content. Deliberately a ref, not state - it's
  // compared against on every transaction via DirtyTracker's useEditorState
  // selector, and mutating a ref doesn't itself trigger the re-render that
  // comparison would need to be redone for.
  const baselineRef = useRef<ProseMirrorNode | null>(null)
  if (editor && baselineRef.current === null) {
    baselineRef.current = createDocument(savedContent ?? content ?? '', editor.schema)
  }

  useImperativeHandle(
    ref,
    () => ({
      getJSON: () => editor?.getJSON() ?? null,
      markSaved: () => {
        if (!editor) return
        baselineRef.current = editor.state.doc
        // Mutating the ref alone wouldn't cause the useEditorState selector
        // above to recompute (nothing subscribed to it changed) - dispatching
        // a no-op transaction re-notifies its subscribers so the dirty
        // comparison (now against the just-updated baseline) reruns and the
        // boundary-crossing effect fires synchronously.
        editor.view.dispatch(editor.state.tr.setMeta('addToHistory', false))
      },
    }),
    [editor],
  )

  return (
    <div className={className}>
      {editor && <DirtyTracker editor={editor} baselineRef={baselineRef} onDirtyChange={onDirtyChange} />}
      {toolbar && editable && editor && <Toolbar editor={editor} />}
      <div className={[DEFAULT_CONTENT_CLASSES, contentClassName].filter(Boolean).join(' ')}>
        <EditorContent editor={editor} className="flex min-h-0 flex-1 flex-col" />
      </div>
    </div>
  )
})
