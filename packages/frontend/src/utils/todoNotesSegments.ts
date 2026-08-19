// Reshapes a todo's raw Tiptap `body` JSON into export-ready notes text.
// Mirrors the backend's dateBadge-segment walk (packages/backend/src/utils/
// weeklySummarySegments.ts + tiptapText.ts's tiptapToPlainText) - there's no
// shared package between the two workspaces, so the walk is duplicated here
// rather than imported, same tradeoff the rest of this file's siblings
// (sprintExport.ts etc.) already accept for frontend-only export logic. Kept
// separate from todosExport.ts so the Tiptap-walking logic has its own
// focused test file, distinct from the sheet-building tests.
import type { JSONContent } from '@tiptap/core'
import { parseLocalDate } from './dateAgenda'

export interface DateSegment {
  date: string
  text: string
}

function dateBadgeAttr(node: JSONContent): string | undefined {
  if (node.type !== 'dateBadge') return undefined
  const attrs = node.attrs as { date?: unknown } | undefined
  return typeof attrs?.date === 'string' ? attrs.date : undefined
}

// "Aug 19, 2026" - the one date format used everywhere in the export output,
// whether a date badge opens a segment (formatNotesForExport's own line
// prefix) or shows up inline mid-sentence (parseDateSegments/
// tiptapToPlainText below). Without this, an inline badge's raw ISO
// attribute value ("2026-08-19") would land in the exported text next to
// other segments' human-formatted dates, reading as a copy-paste artifact
// rather than deliberate content.
function formatBadgeDate(iso: string): string {
  return parseLocalDate(iso).toLocaleDateString('default', { month: 'short', day: 'numeric', year: 'numeric' })
}

// A block node is "badge-only" when its content is exactly one child and
// that child is a dateBadge - see weeklySummarySegments.ts's identical rule
// for why a badge alongside other content doesn't open a new segment.
function badgeOnlyDate(node: JSONContent): string | undefined {
  if (node.content?.length !== 1) return undefined
  return dateBadgeAttr(node.content[0])
}

// Splits a todo's notes body into ordered per-date segments, one per
// badge-only block encountered. Text appearing before the first date badge
// has no segment to attach to and is dropped here - callers needing that
// text (a todo with no date badges at all) should fall back to
// tiptapToPlainText instead, see formatNotesForExport below.
export function parseDateSegments(body: JSONContent | null | undefined): DateSegment[] {
  if (!body) return []

  const segments: { date: string; parts: string[] }[] = []

  function walk(node: JSONContent): void {
    const date = badgeOnlyDate(node)
    if (date !== undefined) {
      segments.push({ date, parts: [] })
      return
    }

    if (Array.isArray(node.content)) {
      for (const child of node.content) walk(child)
      return
    }

    const inlineDate = dateBadgeAttr(node)
    if (inlineDate !== undefined && segments.length > 0) {
      segments[segments.length - 1].parts.push(formatBadgeDate(inlineDate))
      return
    }

    if (typeof node.text === 'string' && segments.length > 0) {
      segments[segments.length - 1].parts.push(node.text)
    }
  }

  walk(body)

  return segments.map(({ date, parts }) => ({ date, text: parts.join(' ').trim() }))
}

// Flattens every text node (plus any dateBadge's own date, formatted inline)
// into a single space-joined string - the fallback used when a body has no
// date-segment structure to walk at all.
export function tiptapToPlainText(body: JSONContent | null | undefined): string {
  if (!body) return ''

  const parts: string[] = []

  function walk(node: JSONContent): void {
    if (typeof node.text === 'string') parts.push(node.text)
    const badgeDate = dateBadgeAttr(node)
    if (badgeDate !== undefined) parts.push(formatBadgeDate(badgeDate))
    if (Array.isArray(node.content)) {
      for (const child of node.content) walk(child)
    }
  }

  walk(body)

  return parts.join(' ').trim()
}

// Renders a todo's notes as a single multi-line string for the Excel export
// (one cell, wrapped across lines): one compact "<date>: <text>" line per
// dated segment, with a blank line inserted whenever the date changes from
// the previous segment - a day-by-day log rather than one dense paragraph.
// Empty segments (a date badge with nothing logged under it yet) are
// skipped. A body with no date-badge structure at all (the common case for
// a short one-off note) falls back to its flattened plain text instead of
// exporting nothing.
export function formatNotesForExport(body: JSONContent | null | undefined): string {
  const segments = parseDateSegments(body).filter((segment) => segment.text)
  if (segments.length === 0) return tiptapToPlainText(body)

  const lines: string[] = []
  let previousDate: string | null = null
  for (const segment of segments) {
    if (previousDate !== null && segment.date !== previousDate) lines.push('')
    lines.push(`${formatBadgeDate(segment.date)}: ${segment.text}`)
    previousDate = segment.date
  }
  return lines.join('\n')
}
