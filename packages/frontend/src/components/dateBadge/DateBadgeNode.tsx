import { mergeAttributes, Node } from '@tiptap/core'
import { NodeViewWrapper, ReactNodeViewRenderer, type NodeViewProps } from '@tiptap/react'
import type { MouseEvent } from 'react'
import { formatBadgeLabel } from './dateMath'
import { DatePickerPopup } from './DatePickerPopup'
import { mountFloatingPanel } from './FloatingPanel'

function DateBadgeView({ node, updateAttributes, deleteNode, editor }: NodeViewProps) {
  const date = node.attrs.date as string
  const label = formatBadgeLabel(date)
  const editable = editor.isEditable

  function handleClick(e: MouseEvent<HTMLSpanElement>) {
    if (!editable) return
    const rect = e.currentTarget.getBoundingClientRect()
    mountFloatingPanel(rect, (close) => (
      <DatePickerPopup
        value={date}
        onPick={(iso) => {
          updateAttributes({ date: iso })
          close()
        }}
        onRemove={() => {
          deleteNode()
          close()
        }}
      />
    ))
  }

  return (
    <NodeViewWrapper as="span" className="inline-block align-baseline">
      <span
        contentEditable={false}
        onClick={handleClick}
        role={editable ? 'button' : undefined}
        tabIndex={editable ? 0 : undefined}
        title={date}
        className={`inline-flex items-center gap-1 rounded-full bg-violet-100 px-2 py-0.5 text-xs font-medium text-violet-700 dark:bg-violet-500/20 dark:text-violet-200 ${
          editable ? 'cursor-pointer hover:bg-violet-200 dark:hover:bg-violet-500/30' : ''
        }`}
      >
        <span aria-hidden="true">📅</span>
        {label}
      </span>
    </NodeViewWrapper>
  )
}

// Inline atomic node rendering a date as a pill/chip - the same node renders
// both edit and read-only view (RichTextEditor never swaps renderers), and
// is clickable to change/remove the date only while the editor is editable.
export const DateBadge = Node.create({
  name: 'dateBadge',
  group: 'inline',
  inline: true,
  atom: true,
  selectable: true,

  addAttributes() {
    return {
      date: {
        default: null,
        parseHTML: (el) => el.getAttribute('data-date'),
        renderHTML: (attrs) => ({ 'data-date': attrs.date }),
      },
    }
  },

  parseHTML() {
    return [{ tag: 'span[data-date-badge]' }]
  },

  renderHTML({ HTMLAttributes }) {
    return ['span', mergeAttributes(HTMLAttributes, { 'data-date-badge': '' })]
  },

  addNodeView() {
    return ReactNodeViewRenderer(DateBadgeView)
  },
})
