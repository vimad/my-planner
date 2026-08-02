import { describe, expect, it } from 'vitest'
import { computeWeeklySummaryBuckets, type WeeklySummaryTodoInput } from '../src/utils/weeklySummaryBuckets.ts'
import type { TiptapNode } from '../src/utils/tiptapText.ts'

const week = { weekStart: '2026-07-27', weekEnd: '2026-08-02' }

function badgeOnly(date: string): TiptapNode {
  return {
    type: 'paragraph',
    content: [{ type: 'dateBadge', attrs: { date } }],
  }
}

function textBlock(text: string): TiptapNode {
  return { type: 'paragraph', content: [{ type: 'text', text }] }
}

function docWithSegments(...pairs: [string, string][]): TiptapNode {
  const content: TiptapNode[] = []
  for (const [date, text] of pairs) {
    content.push(badgeOnly(date))
    content.push(textBlock(text))
  }
  return { type: 'doc', content }
}

function todo(overrides: Partial<WeeklySummaryTodoInput>): WeeklySummaryTodoInput {
  return {
    id: 'todo-1',
    title: 'Untitled',
    categoryId: 'cat-1',
    completedAt: null,
    body: null,
    // Well before `week` by default, so existing todos in tests that don't
    // care about creation timing are treated as having existed all along.
    createdAt: new Date(2020, 0, 1),
    ...overrides,
  }
}

describe('computeWeeklySummaryBuckets', () => {
  it('buckets a todo completed within the selected week into completed, with no prior segment', () => {
    const result = computeWeeklySummaryBuckets(
      [todo({ id: 't1', title: 'Renew passport', completedAt: new Date(2026, 6, 30) })],
      week,
    )
    expect(result).toEqual([
      {
        categoryId: 'cat-1',
        completed: [
          {
            id: 't1',
            title: 'Renew passport',
            completedAt: '2026-07-30',
            lastSegmentBeforeCompletion: null,
          },
        ],
        actioned: [],
        noAction: [],
      },
    ])
  })

  it('picks the correct lastSegmentBeforeCompletion when a prior segment exists', () => {
    const result = computeWeeklySummaryBuckets(
      [
        todo({
          id: 't1',
          completedAt: new Date(2026, 6, 30),
          body: docWithSegments(['2026-07-18', 'Booked the appointment for next week.']),
        }),
      ],
      week,
    )
    expect(result[0].completed[0].lastSegmentBeforeCompletion).toEqual({
      date: '2026-07-18',
      text: 'Booked the appointment for next week.',
    })
  })

  it('keeps a todo completed this week (with a same-week segment too) only in completed, not actioned', () => {
    const result = computeWeeklySummaryBuckets(
      [
        todo({
          id: 't1',
          completedAt: new Date(2026, 6, 30),
          body: docWithSegments(['2026-07-28', 'Made progress before finishing.']),
        }),
      ],
      week,
    )
    expect(result[0].completed).toHaveLength(1)
    expect(result[0].actioned).toHaveLength(0)
    // 2026-07-28 is before the 2026-07-30 completion date, so it surfaces as
    // the carry-over hint rather than being dropped.
    expect(result[0].completed[0].lastSegmentBeforeCompletion).toEqual({
      date: '2026-07-28',
      text: 'Made progress before finishing.',
    })
  })

  it('buckets a todo not completed this week, with a segment in the week, into actioned', () => {
    const result = computeWeeklySummaryBuckets(
      [
        todo({
          id: 't1',
          title: '1:1 notes follow-up with Sam',
          body: docWithSegments(['2026-07-27', 'Sam wants a written proposal before the next 1:1.']),
        }),
      ],
      week,
    )
    expect(result[0].actioned).toEqual([
      {
        id: 't1',
        title: '1:1 notes follow-up with Sam',
        segments: [{ date: '2026-07-27', text: 'Sam wants a written proposal before the next 1:1.' }],
      },
    ])
    expect(result[0].completed).toEqual([])
    expect(result[0].noAction).toEqual([])
  })

  it('includes every segment dated in the week, sorted ascending, not just the latest', () => {
    const result = computeWeeklySummaryBuckets(
      [
        todo({
          id: 't1',
          body: docWithSegments(
            ['2026-07-30', 'Drafted proposal, waiting on his read-through.'],
            ['2026-07-27', 'Sam wants a written proposal before the next 1:1.'],
          ),
        }),
      ],
      week,
    )
    expect(result[0].actioned[0].segments).toEqual([
      { date: '2026-07-27', text: 'Sam wants a written proposal before the next 1:1.' },
      { date: '2026-07-30', text: 'Drafted proposal, waiting on his read-through.' },
    ])
  })

  it('buckets a todo with a segment outside the week (and not completed this week) into noAction', () => {
    const result = computeWeeklySummaryBuckets(
      [todo({ id: 't1', body: docWithSegments(['2026-07-10', 'Old update, out of range.']) })],
      week,
    )
    expect(result[0].noAction).toEqual([{ id: 't1', title: 'Untitled' }])
    expect(result[0].actioned).toEqual([])
    expect(result[0].completed).toEqual([])
  })

  it('buckets a todo with no body/no segments and not completed into noAction', () => {
    const result = computeWeeklySummaryBuckets([todo({ id: 't1', body: null })], week)
    expect(result[0].noAction).toEqual([{ id: 't1', title: 'Untitled' }])
  })

  it('gives a brand-new todo with no activity at all noAction with no special treatment', () => {
    const result = computeWeeklySummaryBuckets([todo({ id: 't1' })], week)
    expect(result[0].noAction).toEqual([{ id: 't1', title: 'Untitled' }])
    expect(result[0].completed).toEqual([])
    expect(result[0].actioned).toEqual([])
  })

  it('does not bucket a todo completed outside the selected week as completed', () => {
    const result = computeWeeklySummaryBuckets(
      [
        todo({
          id: 't1',
          completedAt: new Date(2026, 6, 20),
          body: docWithSegments(['2026-07-28', 'Worked on it this week too.']),
        }),
      ],
      week,
    )
    expect(result[0].completed).toEqual([])
    expect(result[0].actioned).toEqual([
      {
        id: 't1',
        title: 'Untitled',
        segments: [{ date: '2026-07-28', text: 'Worked on it this week too.' }],
      },
    ])
  })

  it('drops a todo entirely when completed outside the week and no in-week segments', () => {
    const result = computeWeeklySummaryBuckets(
      [todo({ id: 't1', completedAt: new Date(2026, 6, 20) })],
      week,
    )
    expect(result).toEqual([{ categoryId: 'cat-1', completed: [], actioned: [], noAction: [] }])
  })

  it('drops a todo entirely when created after the selected week, even though it would otherwise read as noAction', () => {
    // Viewing a past week (weekEnd 2026-08-02) for a todo created later -
    // it didn't exist yet during that week, so it must not show up as if it
    // had simply sat untouched.
    const result = computeWeeklySummaryBuckets(
      [todo({ id: 't1', createdAt: new Date(2026, 7, 5) })],
      week,
    )
    expect(result).toEqual([])
  })

  it('keeps a todo created on the last day of the selected week in noAction', () => {
    const result = computeWeeklySummaryBuckets(
      [todo({ id: 't1', createdAt: new Date(2026, 7, 2) })],
      week,
    )
    expect(result[0].noAction).toEqual([{ id: 't1', title: 'Untitled' }])
  })

  it('represents multiple categories separately, each correctly bucketed', () => {
    const result = computeWeeklySummaryBuckets(
      [
        todo({ id: 't1', categoryId: 'cat-a', completedAt: new Date(2026, 6, 28) }),
        todo({
          id: 't2',
          categoryId: 'cat-b',
          body: docWithSegments(['2026-07-29', 'work happened']),
        }),
        todo({ id: 't3', categoryId: 'cat-a' }),
      ],
      week,
    )
    expect(result).toHaveLength(2)
    const catA = result.find((c) => c.categoryId === 'cat-a')!
    const catB = result.find((c) => c.categoryId === 'cat-b')!
    expect(catA.completed.map((e) => e.id)).toEqual(['t1'])
    expect(catA.noAction.map((e) => e.id)).toEqual(['t3'])
    expect(catB.actioned.map((e) => e.id)).toEqual(['t2'])
  })

  it('picks the most recent prior segment out of several before the completion date', () => {
    const result = computeWeeklySummaryBuckets(
      [
        todo({
          id: 't1',
          completedAt: new Date(2026, 6, 30),
          body: docWithSegments(
            ['2026-07-10', 'first update'],
            ['2026-07-20', 'second update'],
            ['2026-07-15', 'out of order update'],
          ),
        }),
      ],
      week,
    )
    expect(result[0].completed[0].lastSegmentBeforeCompletion).toEqual({
      date: '2026-07-20',
      text: 'second update',
    })
  })
})
