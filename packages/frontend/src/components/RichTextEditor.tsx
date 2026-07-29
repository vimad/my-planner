import type { JSONContent } from '@tiptap/core'
import type { Editor } from '@tiptap/react'
import { EditorContent, useEditor, useEditorState } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import { TaskItem, TaskList } from '@tiptap/extension-list'
import Underline from '@tiptap/extension-underline'
import Link from '@tiptap/extension-link'
import { forwardRef, useEffect, useImperativeHandle } from 'react'

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
]

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

// Imperative handle exposed via ref - lets a parent (Scratchpad,
// ScratchNoteCard, TodoDetail) pull the live document out of an editable
// instance right before it unmounts/collapses, without lifting the whole
// document into controlled state on every keystroke.
export interface RichTextEditorHandle {
  getJSON: () => JSONContent | null
}

interface RichTextEditorProps {
  content?: JSONContent | JSONContent[] | null
  editable: boolean
  className?: string
  toolbar?: boolean
  contentClassName?: string
}

// Shared rich-text editor for todo bodies and scratch notes. The same Tiptap
// Editor instance and JSON document render both edit mode and a read-only
// view mode via the `editable` prop - there is intentionally no separate
// read-only renderer, so the two can never drift apart. `toolbar` opts a
// call site into a formatting toolbar (shown only while editable).
// `contentClassName`, if given, wraps just the editable content (not the
// toolbar) so a call site can cap long documents to a max height with its
// own scrollbar while the toolbar stays pinned above it.
export const RichTextEditor = forwardRef<RichTextEditorHandle, RichTextEditorProps>(function RichTextEditor(
  { content, editable, className, toolbar = false, contentClassName },
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

  useImperativeHandle(
    ref,
    () => ({
      getJSON: () => editor?.getJSON() ?? null,
    }),
    [editor],
  )

  return (
    <div className={className}>
      {toolbar && editable && editor && <Toolbar editor={editor} />}
      <div className={contentClassName}>
        <EditorContent editor={editor} />
      </div>
    </div>
  )
})
