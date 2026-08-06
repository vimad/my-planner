// Buckets a profile's todos into completed / actioned / no-action per
// category for a resolved week, per the weekly-summary spec's "Bucket
// definitions". Pure function - no Mongoose, no I/O; the route layer is
// responsible for loading todos and shaping them into WeeklySummaryTodoInput
// (stringifying `_id`/categoryId) before calling this.
import { toLocalDateString } from './localDate.ts'
import type { TiptapNode } from './tiptapText.ts'
import { parseWeeklySummarySegments, type WeeklySummarySegment } from './weeklySummarySegments.ts'

export interface WeeklySummaryTodoInput {
  id: string
  title: string
  categoryId: string
  completedAt: Date | null
  body: TiptapNode | null
  createdAt: Date
}

export interface WeeklySummaryWeek {
  weekStart: string
  weekEnd: string
}

export interface WeeklySummaryCompletedEntry {
  id: string
  title: string
  completedAt: string
  lastSegmentBeforeCompletion: WeeklySummarySegment | null
}

export interface WeeklySummaryActionedEntry {
  id: string
  title: string
  segments: WeeklySummarySegment[]
}

export interface WeeklySummaryNoActionEntry {
  id: string
  title: string
}

export interface WeeklySummaryCategoryGroup {
  categoryId: string
  completed: WeeklySummaryCompletedEntry[]
  actioned: WeeklySummaryActionedEntry[]
  noAction: WeeklySummaryNoActionEntry[]
}

// Most-recent segment dated on or before `completedDate`, searched across
// all of the todo's segments (any week) - not just the ones dated in the
// currently selected week. Same-day segments count: logging a note and then
// completing the todo the same day is the common case, and a strictly-before
// cutoff was dropping exactly those notes.
function findLastSegmentBeforeCompletion(
  segments: WeeklySummarySegment[],
  completedDate: string,
): WeeklySummarySegment | null {
  let latest: WeeklySummarySegment | null = null
  for (const segment of segments) {
    if (segment.date > completedDate) continue
    if (!latest || segment.date >= latest.date) latest = segment
  }
  return latest
}

export function computeWeeklySummaryBuckets(
  todos: WeeklySummaryTodoInput[],
  week: WeeklySummaryWeek,
): WeeklySummaryCategoryGroup[] {
  const { weekStart, weekEnd } = week
  const categories: WeeklySummaryCategoryGroup[] = []
  const categoryIndex = new Map<string, WeeklySummaryCategoryGroup>()

  function bucketFor(categoryId: string): WeeklySummaryCategoryGroup {
    let bucket = categoryIndex.get(categoryId)
    if (!bucket) {
      bucket = { categoryId, completed: [], actioned: [], noAction: [] }
      categoryIndex.set(categoryId, bucket)
      categories.push(bucket)
    }
    return bucket
  }

  for (const todo of todos) {
    const createdOnOrBeforeWeek = toLocalDateString(todo.createdAt) <= weekEnd
    const allSegments = parseWeeklySummarySegments(todo.body)
    const segmentsThisWeek = allSegments
      .filter((segment) => segment.date >= weekStart && segment.date <= weekEnd)
      .sort((a, b) => a.date.localeCompare(b.date))

    // Wasn't created yet as of the selected week, and has no dated segment
    // there either - it can't have been open, completed, or acted on during
    // it, so it plays no part in that week's summary (this is what kept old
    // todos out of noAction for past weeks). A dated segment overrides this:
    // it's how a todo created later purely to track a past action - without
    // touching createdAt/completedAt - still logs that action in its real
    // week.
    if (!createdOnOrBeforeWeek && segmentsThisWeek.length === 0) continue

    const bucket = bucketFor(todo.categoryId)
    const completedDate = todo.completedAt ? toLocalDateString(todo.completedAt) : null
    const completedThisWeek =
      completedDate !== null && completedDate >= weekStart && completedDate <= weekEnd

    if (completedThisWeek && completedDate) {
      bucket.completed.push({
        id: todo.id,
        title: todo.title,
        completedAt: completedDate,
        lastSegmentBeforeCompletion: findLastSegmentBeforeCompletion(allSegments, completedDate),
      })
      continue
    }

    if (segmentsThisWeek.length > 0) {
      bucket.actioned.push({ id: todo.id, title: todo.title, segments: segmentsThisWeek })
    } else if (todo.completedAt === null) {
      // No in-week segment, so the guard above already confirmed this todo
      // existed by the selected week. Already completed (just not within
      // this week) and untouched this week is not a pending item, so it
      // doesn't belong in noAction; drop it from this week's summary
      // entirely rather than in any bucket.
      bucket.noAction.push({ id: todo.id, title: todo.title })
    }
  }

  return categories
}
