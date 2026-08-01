// Buckets a profile's todos into completed / actioned / no-action per
// category for a resolved week, per the weekly-summary spec's "Bucket
// definitions". Pure function - no Mongoose, no I/O; the route layer is
// responsible for loading todos and shaping them into WeeklySummaryTodoInput
// (stringifying `_id`/categoryId) before calling this.
import type { TiptapNode } from './tiptapText.ts'
import { parseWeeklySummarySegments, type WeeklySummarySegment } from './weeklySummarySegments.ts'

export interface WeeklySummaryTodoInput {
  id: string
  title: string
  categoryId: string
  completedAt: Date | null
  body: TiptapNode | null
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

export interface WeeklySummaryCategoryBucket {
  categoryId: string
  completed: WeeklySummaryCompletedEntry[]
  actioned: WeeklySummaryActionedEntry[]
  noAction: WeeklySummaryNoActionEntry[]
}

// completedAt is a real Date (an exact instant), but weekStart/weekEnd and
// every segment's date are local calendar-day strings - converting via
// getFullYear/getMonth/getDate (never toISOString, which is UTC and can
// shift the day) mirrors the day-shift-bug precedent around advanceDueDate
// in routes/todos.ts.
function toLocalDateString(date: Date): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

// Most-recent segment dated strictly before `completedDate`, searched across
// all of the todo's segments (any week) - not just the ones dated in the
// currently selected week.
function findLastSegmentBeforeCompletion(
  segments: WeeklySummarySegment[],
  completedDate: string,
): WeeklySummarySegment | null {
  let latest: WeeklySummarySegment | null = null
  for (const segment of segments) {
    if (segment.date >= completedDate) continue
    if (!latest || segment.date >= latest.date) latest = segment
  }
  return latest
}

export function computeWeeklySummaryBuckets(
  todos: WeeklySummaryTodoInput[],
  week: WeeklySummaryWeek,
): WeeklySummaryCategoryBucket[] {
  const { weekStart, weekEnd } = week
  const categories: WeeklySummaryCategoryBucket[] = []
  const categoryIndex = new Map<string, WeeklySummaryCategoryBucket>()

  function bucketFor(categoryId: string): WeeklySummaryCategoryBucket {
    let bucket = categoryIndex.get(categoryId)
    if (!bucket) {
      bucket = { categoryId, completed: [], actioned: [], noAction: [] }
      categoryIndex.set(categoryId, bucket)
      categories.push(bucket)
    }
    return bucket
  }

  for (const todo of todos) {
    const bucket = bucketFor(todo.categoryId)
    const completedDate = todo.completedAt ? toLocalDateString(todo.completedAt) : null
    const completedThisWeek =
      completedDate !== null && completedDate >= weekStart && completedDate <= weekEnd

    if (completedThisWeek && completedDate) {
      const segments = parseWeeklySummarySegments(todo.body)
      bucket.completed.push({
        id: todo.id,
        title: todo.title,
        completedAt: completedDate,
        lastSegmentBeforeCompletion: findLastSegmentBeforeCompletion(segments, completedDate),
      })
      continue
    }

    const segmentsThisWeek = parseWeeklySummarySegments(todo.body)
      .filter((segment) => segment.date >= weekStart && segment.date <= weekEnd)
      .sort((a, b) => a.date.localeCompare(b.date))

    if (segmentsThisWeek.length > 0) {
      bucket.actioned.push({ id: todo.id, title: todo.title, segments: segmentsThisWeek })
    } else {
      bucket.noAction.push({ id: todo.id, title: todo.title })
    }
  }

  return categories
}
