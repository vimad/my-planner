// Profile names double as their URL segment (App.tsx routes as
// /:profileSlug/:tab) since profile ids aren't meaningful to read in a URL
// and this app assumes profile names are unique (single-user, no accounts).
// Whitespace becomes a hyphen so multi-word names still read as one path
// segment; nothing else is stripped, so callers building a URL from this
// still need encodeURIComponent for characters that aren't otherwise
// URL-safe (react-router decodes the param back for comparison).
export function profileSlug(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, '-')
}
