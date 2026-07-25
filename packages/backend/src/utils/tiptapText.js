// Recursively walks a Tiptap JSON document and concatenates the text of every
// `text` node into a single plain-text string, for use as a denormalized
// search extract (see the "Search" section of the spec). Node boundaries
// (paragraphs, list items, headings, etc.) are joined with a space so words
// across separate blocks don't get jammed together.
export function tiptapToPlainText(doc) {
  if (!doc || typeof doc !== 'object') return ''

  const parts = []

  function walk(node) {
    if (!node || typeof node !== 'object') return
    if (typeof node.text === 'string') {
      parts.push(node.text)
    }
    if (Array.isArray(node.content)) {
      for (const child of node.content) walk(child)
    }
  }

  walk(doc)

  return parts.join(' ').trim()
}
