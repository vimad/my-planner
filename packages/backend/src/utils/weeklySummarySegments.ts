// Walks a todo's raw Tiptap `body` JSON and splits it into an ordered list
// of dated segments, the raw material the weekly summary's bucketing reads
// from. This is a structurally different walk from tiptapText.ts's
// tiptapToPlainText: that one flattens everything into a single space-joined
// string and discards block boundaries, but the "is this block's content
// *only* a dateBadge" rule below depends on knowing exactly where each block
// starts and ends, so this walk operates block-by-block instead.
import type { TiptapNode } from './tiptapText.ts'

export interface WeeklySummarySegment {
  date: string
  text: string
}

function dateBadgeAttr(node: TiptapNode): string | undefined {
  if (node.type !== 'dateBadge') return undefined
  const attrs = node.attrs as { date?: unknown } | undefined
  return typeof attrs?.date === 'string' ? attrs.date : undefined
}

// A block node is "badge-only" when its content is exactly one child and
// that child is a dateBadge - a badge sitting alongside any other node
// (including a stray empty/whitespace text node left over from editor
// churn) makes the badge incidental, not a segment boundary. It's still
// surfaced as text below (see walk's dateBadgeAttr branch) rather than
// silently dropped - "incidental" only means it doesn't open a new row.
function badgeOnlyDate(node: TiptapNode): string | undefined {
  if (node.content?.length !== 1) return undefined
  return dateBadgeAttr(node.content[0])
}

export function parseWeeklySummarySegments(body: TiptapNode | null): WeeklySummarySegment[] {
  if (!body) return []

  const segments: { date: string; parts: string[] }[] = []

  function walk(node: TiptapNode): void {
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
      segments[segments.length - 1].parts.push(inlineDate)
      return
    }

    if (typeof node.text === 'string' && segments.length > 0) {
      segments[segments.length - 1].parts.push(node.text)
    }
  }

  walk(body)

  return segments.map(({ date, parts }) => ({ date, text: parts.join(' ').trim() }))
}
