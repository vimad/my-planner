import { describe, expect, it } from 'vitest'
import { formatNotesForExport, parseDateSegments, tiptapToPlainText } from './todoNotesSegments'

describe('parseDateSegments', () => {
  it('returns an empty list for a null body', () => {
    expect(parseDateSegments(null)).toEqual([])
  })

  it('excludes text before the first badge-only block', () => {
    const doc = {
      type: 'doc',
      content: [
        { type: 'paragraph', content: [{ type: 'text', text: 'pre-log rambling' }] },
        { type: 'paragraph', content: [{ type: 'dateBadge', attrs: { date: '2026-08-03' } }] },
        { type: 'paragraph', content: [{ type: 'text', text: 'did the thing' }] },
      ],
    }
    expect(parseDateSegments(doc)).toEqual([{ date: '2026-08-03', text: 'did the thing' }])
  })

  it('joins multiple text blocks following a badge-only block into one segment, and returns segments in document order', () => {
    const doc = {
      type: 'doc',
      content: [
        { type: 'paragraph', content: [{ type: 'dateBadge', attrs: { date: '2026-08-03' } }] },
        { type: 'paragraph', content: [{ type: 'text', text: 'first line' }] },
        { type: 'paragraph', content: [{ type: 'text', text: 'second line' }] },
        { type: 'paragraph', content: [{ type: 'dateBadge', attrs: { date: '2026-08-05' } }] },
        { type: 'paragraph', content: [{ type: 'text', text: 'wednesday work' }] },
      ],
    }
    expect(parseDateSegments(doc)).toEqual([
      { date: '2026-08-03', text: 'first line second line' },
      { date: '2026-08-05', text: 'wednesday work' },
    ])
  })

  it('yields an empty-text segment for a badge-only block with nothing logged under it', () => {
    const doc = {
      type: 'doc',
      content: [
        { type: 'paragraph', content: [{ type: 'dateBadge', attrs: { date: '2026-08-03' } }] },
        { type: 'paragraph', content: [{ type: 'dateBadge', attrs: { date: '2026-08-04' } }] },
        { type: 'paragraph', content: [{ type: 'text', text: 'did the thing' }] },
      ],
    }
    expect(parseDateSegments(doc)).toEqual([
      { date: '2026-08-03', text: '' },
      { date: '2026-08-04', text: 'did the thing' },
    ])
  })
})

describe('tiptapToPlainText', () => {
  it('returns an empty string for a null body', () => {
    expect(tiptapToPlainText(null)).toBe('')
  })

  it('flattens every text node across blocks into one space-joined string', () => {
    const doc = {
      type: 'doc',
      content: [
        { type: 'paragraph', content: [{ type: 'text', text: 'Just some notes' }] },
        { type: 'paragraph', content: [{ type: 'text', text: 'more notes' }] },
      ],
    }
    expect(tiptapToPlainText(doc)).toBe('Just some notes more notes')
  })

  it('includes a dateBadge\'s own date inline, in document order', () => {
    const doc = {
      type: 'doc',
      content: [
        { type: 'paragraph', content: [{ type: 'text', text: 'Deadline is' }, { type: 'dateBadge', attrs: { date: '2026-08-14' } }] },
      ],
    }
    expect(tiptapToPlainText(doc)).toBe('Deadline is 2026-08-14')
  })
})

describe('formatNotesForExport', () => {
  it('returns an empty string for a null body', () => {
    expect(formatNotesForExport(null)).toBe('')
  })

  it('falls back to flattened plain text when the body has no date badges at all', () => {
    const doc = {
      type: 'doc',
      content: [{ type: 'paragraph', content: [{ type: 'text', text: 'a quick one-off note' }] }],
    }
    expect(formatNotesForExport(doc)).toBe('a quick one-off note')
  })

  it('renders one compact "date: text" line per segment, with no blank line between same-date segments', () => {
    const doc = {
      type: 'doc',
      content: [
        { type: 'paragraph', content: [{ type: 'dateBadge', attrs: { date: '2026-08-15' } }] },
        { type: 'paragraph', content: [{ type: 'text', text: 'did the thing' }] },
      ],
    }
    expect(formatNotesForExport(doc)).toBe('Aug 15, 2026: did the thing')
  })

  it('inserts a blank line between segments that land on different dates, but not within the same date', () => {
    const doc = {
      type: 'doc',
      content: [
        { type: 'paragraph', content: [{ type: 'dateBadge', attrs: { date: '2026-08-03' } }] },
        { type: 'paragraph', content: [{ type: 'text', text: 'monday work' }] },
        { type: 'paragraph', content: [{ type: 'dateBadge', attrs: { date: '2026-08-05' } }] },
        { type: 'paragraph', content: [{ type: 'text', text: 'wednesday work' }] },
      ],
    }
    expect(formatNotesForExport(doc)).toBe(
      'Aug 3, 2026: monday work\n\nAug 5, 2026: wednesday work',
    )
  })

  it('skips a badge-only segment with nothing logged under it, rather than emitting a stray blank date line', () => {
    const doc = {
      type: 'doc',
      content: [
        { type: 'paragraph', content: [{ type: 'dateBadge', attrs: { date: '2026-08-03' } }] },
        { type: 'paragraph', content: [{ type: 'dateBadge', attrs: { date: '2026-08-04' } }] },
        { type: 'paragraph', content: [{ type: 'text', text: 'did the thing' }] },
      ],
    }
    expect(formatNotesForExport(doc)).toBe('Aug 4, 2026: did the thing')
  })
})
