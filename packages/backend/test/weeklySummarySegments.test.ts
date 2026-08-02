import { describe, expect, it } from 'vitest'
import { parseWeeklySummarySegments } from '../src/utils/weeklySummarySegments.ts'

describe('parseWeeklySummarySegments', () => {
  it('returns an empty list for a null body', () => {
    expect(parseWeeklySummarySegments(null)).toEqual([])
  })

  it('returns an empty list for a doc with no badges at all', () => {
    const doc = {
      type: 'doc',
      content: [
        { type: 'paragraph', content: [{ type: 'text', text: 'Just some notes' }] },
        { type: 'paragraph', content: [{ type: 'text', text: 'more notes' }] },
      ],
    }
    expect(parseWeeklySummarySegments(doc)).toEqual([])
  })

  it('excludes text before the first badge-only block', () => {
    const doc = {
      type: 'doc',
      content: [
        { type: 'paragraph', content: [{ type: 'text', text: 'pre-log rambling' }] },
        {
          type: 'paragraph',
          content: [{ type: 'dateBadge', attrs: { date: '2026-08-03' } }],
        },
        { type: 'paragraph', content: [{ type: 'text', text: 'did the thing' }] },
      ],
    }
    expect(parseWeeklySummarySegments(doc)).toEqual([
      { date: '2026-08-03', text: 'did the thing' },
    ])
  })

  it('joins multiple text blocks following a badge-only block into one segment', () => {
    const doc = {
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: [{ type: 'dateBadge', attrs: { date: '2026-08-03' } }],
        },
        { type: 'paragraph', content: [{ type: 'text', text: 'first line' }] },
        { type: 'paragraph', content: [{ type: 'text', text: 'second line' }] },
      ],
    }
    expect(parseWeeklySummarySegments(doc)).toEqual([
      { date: '2026-08-03', text: 'first line second line' },
    ])
  })

  it('yields an empty-text segment for two badge-only blocks back to back', () => {
    const doc = {
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: [{ type: 'dateBadge', attrs: { date: '2026-08-03' } }],
        },
        {
          type: 'paragraph',
          content: [{ type: 'dateBadge', attrs: { date: '2026-08-04' } }],
        },
        { type: 'paragraph', content: [{ type: 'text', text: 'did the thing' }] },
      ],
    }
    expect(parseWeeklySummarySegments(doc)).toEqual([
      { date: '2026-08-03', text: '' },
      { date: '2026-08-04', text: 'did the thing' },
    ])
  })

  it('folds a badge alongside other content into the open segment\'s text instead of starting a new one', () => {
    const doc = {
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: [{ type: 'dateBadge', attrs: { date: '2026-08-03' } }],
        },
        {
          type: 'paragraph',
          content: [
            { type: 'dateBadge', attrs: { date: '2026-08-04' } },
            { type: 'text', text: 'incidental badge alongside text' },
          ],
        },
      ],
    }
    expect(parseWeeklySummarySegments(doc)).toEqual([
      { date: '2026-08-03', text: '2026-08-04 incidental badge alongside text' },
    ])
  })

  it('surfaces an inline badge typed after other text in the same block, in document order', () => {
    // Mirrors the real "Setup deadlines for tool deployments" todo body: a
    // badge-only paragraph opens the segment, then a bullet list item mixes
    // text and a second badge in one paragraph.
    const doc = {
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: [{ type: 'dateBadge', attrs: { date: '2026-07-31' } }],
        },
        {
          type: 'bulletList',
          content: [
            {
              type: 'listItem',
              content: [
                {
                  type: 'paragraph',
                  content: [
                    { type: 'text', text: 'Engineering team -' },
                    { type: 'dateBadge', attrs: { date: '2026-08-14' } },
                  ],
                },
              ],
            },
          ],
        },
      ],
    }
    expect(parseWeeklySummarySegments(doc)).toEqual([
      { date: '2026-07-31', text: 'Engineering team - 2026-08-14' },
    ])
  })

  it('treats a badge alongside a whitespace-only text node as NOT badge-only', () => {
    const doc = {
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: [
            { type: 'dateBadge', attrs: { date: '2026-08-03' } },
            { type: 'text', text: ' ' },
          ],
        },
        { type: 'paragraph', content: [{ type: 'text', text: 'after' }] },
      ],
    }
    // The exactly-one-child test means a badge + whitespace text node does not
    // qualify as badge-only, so no segment ever opens here - the whole doc is
    // pre-log text and gets excluded entirely.
    expect(parseWeeklySummarySegments(doc)).toEqual([])
  })

  it('starts a segment for a badge-only list item nested inside a bullet list', () => {
    const doc = {
      type: 'doc',
      content: [
        {
          type: 'bulletList',
          content: [
            {
              type: 'listItem',
              content: [
                {
                  type: 'paragraph',
                  content: [{ type: 'dateBadge', attrs: { date: '2026-08-05' } }],
                },
              ],
            },
          ],
        },
        { type: 'paragraph', content: [{ type: 'text', text: 'nested badge worked' }] },
      ],
    }
    expect(parseWeeklySummarySegments(doc)).toEqual([
      { date: '2026-08-05', text: 'nested badge worked' },
    ])
  })

  it('starts a segment for a badge-only heading nested inside a blockquote', () => {
    const doc = {
      type: 'doc',
      content: [
        {
          type: 'blockquote',
          content: [
            {
              type: 'heading',
              content: [{ type: 'dateBadge', attrs: { date: '2026-08-06' } }],
            },
          ],
        },
        { type: 'paragraph', content: [{ type: 'text', text: 'quoted badge worked' }] },
      ],
    }
    expect(parseWeeklySummarySegments(doc)).toEqual([
      { date: '2026-08-06', text: 'quoted badge worked' },
    ])
  })

  it('returns segments in document order with correct dates', () => {
    const doc = {
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: [{ type: 'dateBadge', attrs: { date: '2026-08-03' } }],
        },
        { type: 'paragraph', content: [{ type: 'text', text: 'monday work' }] },
        {
          type: 'paragraph',
          content: [{ type: 'dateBadge', attrs: { date: '2026-08-05' } }],
        },
        { type: 'paragraph', content: [{ type: 'text', text: 'wednesday work' }] },
      ],
    }
    expect(parseWeeklySummarySegments(doc)).toEqual([
      { date: '2026-08-03', text: 'monday work' },
      { date: '2026-08-05', text: 'wednesday work' },
    ])
  })
})
