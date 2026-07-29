import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { RichTextEditor } from './RichTextEditor'

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
})
