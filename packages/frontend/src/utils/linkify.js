const URL_PATTERN = /https?:\/\/[^\s]+/g

// Trailing characters that are almost always sentence punctuation or a
// wrapping bracket/quote rather than part of the URL itself, e.g. the
// period in "see https://example.com." or the paren in "(https://x.com)".
const TRAILING_PUNCTUATION = /[.,!?;:)\]}'"]+$/

// Splits free text into plain-text and link segments so callers can render
// URLs as clickable anchors while leaving the rest untouched. Returns
// { text, href? } parts in order; segments without `href` are plain text.
export function linkify(text) {
  if (!text) return [{ text: text ?? '' }]

  const segments = []
  let lastIndex = 0
  let match

  URL_PATTERN.lastIndex = 0
  while ((match = URL_PATTERN.exec(text))) {
    let url = match[0]
    let end = match.index + url.length

    const trailing = url.match(TRAILING_PUNCTUATION)
    if (trailing) {
      url = url.slice(0, -trailing[0].length)
      end -= trailing[0].length
    }
    if (!url) continue

    if (match.index > lastIndex) {
      segments.push({ text: text.slice(lastIndex, match.index) })
    }
    segments.push({ text: url, href: url })
    lastIndex = end
  }

  if (lastIndex < text.length) {
    segments.push({ text: text.slice(lastIndex) })
  }

  return segments.length ? segments : [{ text }]
}
