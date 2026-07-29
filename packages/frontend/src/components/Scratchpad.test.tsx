import { describe, expect, it } from 'vitest'
import { splitIntoLines } from './Scratchpad'

describe('splitIntoLines', () => {
  it('splits a multi-paragraph doc into one line per paragraph', () => {
    const doc = {
      type: 'doc',
      content: [
        { type: 'paragraph', content: [{ type: 'text', text: 'Call the dentist' }] },
        { type: 'paragraph', content: [{ type: 'text', text: 'Buy milk' }] },
      ],
    }

    expect(splitIntoLines(doc)).toEqual([
      {
        content: {
          type: 'doc',
          content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Call the dentist' }] }],
        },
      },
      {
        content: {
          type: 'doc',
          content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Buy milk' }] }],
        },
      },
    ])
  })

  it('returns a single line for a doc with one paragraph', () => {
    const doc = { type: 'doc', content: [{ type: 'paragraph' }] }

    expect(splitIntoLines(doc)).toEqual([{ content: { type: 'doc', content: [{ type: 'paragraph' }] } }])
  })

  it('falls back to a single line when the doc has no top-level blocks', () => {
    const doc = { type: 'doc', content: [] }

    expect(splitIntoLines(doc)).toEqual([{ content: doc }])
  })
})
