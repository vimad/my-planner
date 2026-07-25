import { EditorContent, useEditor } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import { TaskItem, TaskList } from '@tiptap/extension-list'
import { forwardRef, useEffect, useImperativeHandle } from 'react'

// StarterKit already registers BulletList/OrderedList/ListItem (it pulls them
// from @tiptap/extension-list internally) - only checklist support needs to
// be added on top. `nested: true` is the documented flag for nested
// checklists on @tiptap/extension-list's TaskItem (same API shape as the
// older standalone @tiptap/extension-task-item package).
const EXTENSIONS = [StarterKit, TaskList, TaskItem.configure({ nested: true })]

// Shared rich-text editor for todo bodies (and, later, scratch notes). The
// same Tiptap Editor instance and JSON document render both edit mode and a
// read-only view mode via the `editable` prop - there is intentionally no
// separate read-only renderer, so the two can never drift apart.
export const RichTextEditor = forwardRef(function RichTextEditor(
  { content, editable, className },
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

  return <EditorContent editor={editor} className={className} />
})
