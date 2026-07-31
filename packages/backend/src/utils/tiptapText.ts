// Recursively walks a Tiptap JSON document and concatenates the text of every
// `text` node into a single plain-text string, for use as a denormalized
// search extract (see the "Search" section of the spec). Node boundaries
// (paragraphs, list items, headings, etc.) are joined with a space so words
// across separate blocks don't get jammed together.

// Minimal shape of a Tiptap/ProseMirror JSON document node — only the parts
// this module (and the Mongoose `Mixed` fields that store these documents:
// Todo.body, ScratchNote's per-line `content`) actually care about. Real
// Tiptap docs carry many more node-specific fields (marks, attrs, etc.),
// hence the index signature rather than an exhaustive shape.
export interface TiptapNode {
  type?: string
  text?: string
  content?: TiptapNode[]
  [key: string]: unknown
}

export function tiptapToPlainText(doc: unknown): string {
  if (!doc || typeof doc !== 'object') return ''

  const parts: string[] = []

  function walk(node: unknown): void {
    if (!node || typeof node !== 'object') return
    const n = node as TiptapNode
    if (typeof n.text === 'string') {
      parts.push(n.text)
    }
    // dateBadge is an atom node (no `text`/`content`) - pull its date attr
    // out directly so a date inserted via "@today"/"@date" stays findable
    // through search, same as any other content.
    if (n.type === 'dateBadge') {
      const attrs = n.attrs as { date?: unknown } | undefined
      if (typeof attrs?.date === 'string') parts.push(attrs.date)
    }
    if (Array.isArray(n.content)) {
      for (const child of n.content) walk(child)
    }
  }

  walk(doc)

  return parts.join(' ').trim()
}
