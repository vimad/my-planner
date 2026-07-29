import { act, fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { RichTextEditor, type RichTextEditorHandle } from './RichTextEditor'

const docWithList = {
  type: 'doc',
  content: [
    { type: 'paragraph', content: [{ type: 'text', text: 'Hello world' }] },
    {
      type: 'bulletList',
      content: [
        {
          type: 'listItem',
          content: [{ type: 'paragraph', content: [{ type: 'text', text: 'item one' }] }],
        },
      ],
    },
  ],
}

const simpleDoc = {
  type: 'doc',
  content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Hello world' }] }],
}

const otherDoc = {
  type: 'doc',
  content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Something else' }] }],
}

// Simulates pasting text into a Tiptap/ProseMirror editor. jsdom doesn't
// implement real contenteditable text insertion, so `fireEvent.paste` (which
// ProseMirror's paste handler reads `clipboardData` from directly, applying a
// transaction rather than relying on a DOM mutation to appear) is the
// reliable way to actually change the live document in these tests.
function pasteText(node: Element, text: string) {
  fireEvent.paste(node, {
    clipboardData: { getData: (type: string) => (type === 'text/plain' ? text : '') },
  })
}

function getEditorNode(container: HTMLElement): Element {
  const node = container.querySelector('[contenteditable]')
  if (!node) throw new Error('editor node not found')
  return node
}

describe('RichTextEditor', () => {
  it('renders the same JSON document in read-only view mode, with formatting intact', () => {
    const { container } = render(<RichTextEditor content={docWithList} editable={false} />)

    expect(screen.getByText('Hello world')).toBeInTheDocument()
    expect(screen.getByText('item one')).toBeInTheDocument()
    expect(container.querySelector('ul')).toBeInTheDocument()
    expect(container.querySelector('[contenteditable]')).toHaveAttribute('contenteditable', 'false')
  })

  it('flips into an editable state when `editable` becomes true, without re-rendering content separately', () => {
    const { container, rerender } = render(<RichTextEditor content={docWithList} editable={false} />)
    const editorNode = container.querySelector('[contenteditable]')
    expect(editorNode).toHaveAttribute('contenteditable', 'false')

    rerender(<RichTextEditor content={docWithList} editable={true} />)

    expect(editorNode).toHaveAttribute('contenteditable', 'true')
    // Same underlying document is still rendered - no separate renderer.
    expect(screen.getByText('Hello world')).toBeInTheDocument()
    expect(screen.getByText('item one')).toBeInTheDocument()
  })

  describe('dirty tracking', () => {
    it('reports clean at mount when content and savedContent match', () => {
      const onDirtyChange = vi.fn()
      render(
        <RichTextEditor content={simpleDoc} savedContent={simpleDoc} editable onDirtyChange={onDirtyChange} />,
      )

      expect(onDirtyChange).not.toHaveBeenCalledWith(true)
    })

    it('fires onDirtyChange(true) exactly once at the edit transition, not on every subsequent keystroke', () => {
      const onDirtyChange = vi.fn()
      const { container } = render(
        <RichTextEditor content={simpleDoc} savedContent={simpleDoc} editable onDirtyChange={onDirtyChange} />,
      )

      const editorNode = getEditorNode(container)
      pasteText(editorNode, 'X')
      pasteText(editorNode, 'Y')
      pasteText(editorNode, 'Z')

      expect(onDirtyChange.mock.calls.filter(([dirty]) => dirty === true)).toHaveLength(1)
    })

    it('fires onDirtyChange(false) when content is edited back to exactly match savedContent', () => {
      const onDirtyChange = vi.fn()
      const { container } = render(
        <RichTextEditor content={simpleDoc} savedContent={simpleDoc} editable onDirtyChange={onDirtyChange} />,
      )

      const editorNode = getEditorNode(container)
      pasteText(editorNode, 'X')
      expect(onDirtyChange).toHaveBeenLastCalledWith(true)

      fireEvent.keyDown(editorNode, { key: 'z', ctrlKey: true })

      expect(onDirtyChange).toHaveBeenLastCalledWith(false)
    })

    it('resets to clean via the markSaved() handle method, without changing the document content', () => {
      const onDirtyChange = vi.fn()
      const ref = { current: null as RichTextEditorHandle | null }
      const { container } = render(
        <RichTextEditor ref={ref} content={simpleDoc} savedContent={simpleDoc} editable onDirtyChange={onDirtyChange} />,
      )

      const editorNode = getEditorNode(container)
      pasteText(editorNode, 'X')
      expect(onDirtyChange).toHaveBeenLastCalledWith(true)

      const jsonBeforeMarkSaved = ref.current?.getJSON()
      act(() => {
        ref.current?.markSaved()
      })

      expect(onDirtyChange).toHaveBeenLastCalledWith(false)
      expect(ref.current?.getJSON()).toEqual(jsonBeforeMarkSaved)
    })

    it('reports dirty immediately at mount when content and savedContent mismatch, with no edits required', () => {
      const onDirtyChange = vi.fn()
      render(
        <RichTextEditor content={simpleDoc} savedContent={otherDoc} editable onDirtyChange={onDirtyChange} />,
      )

      expect(onDirtyChange).toHaveBeenCalledWith(true)
    })
  })
})
