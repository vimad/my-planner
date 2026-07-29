import { describe, expect, it } from 'vitest'
import { tiptapToPlainText } from '../src/utils/tiptapText.ts'

describe('tiptapToPlainText', () => {
  it('returns an empty string for null/undefined bodies', () => {
    expect(tiptapToPlainText(null)).toBe('')
    expect(tiptapToPlainText(undefined)).toBe('')
  })

  it('extracts text from a simple paragraph doc', () => {
    const doc = {
      type: 'doc',
      content: [
        { type: 'paragraph', content: [{ type: 'text', text: 'Buy milk' }] },
      ],
    }
    expect(tiptapToPlainText(doc)).toBe('Buy milk')
  })

  it('concatenates text across multiple nested blocks', () => {
    const doc = {
      type: 'doc',
      content: [
        { type: 'paragraph', content: [{ type: 'text', text: 'Remember to' }] },
        {
          type: 'bulletList',
          content: [
            {
              type: 'listItem',
              content: [
                { type: 'paragraph', content: [{ type: 'text', text: 'buy oat milk' }] },
              ],
            },
          ],
        },
      ],
    }
    expect(tiptapToPlainText(doc)).toBe('Remember to buy oat milk')
  })

  it('handles a doc with no content nodes', () => {
    expect(tiptapToPlainText({ type: 'doc', content: [] })).toBe('')
  })
})
