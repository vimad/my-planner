// Team names double as their URL segment (App.tsx routes /sprint/:teamSlug/...)
// since team ids aren't meaningful to read in a URL and this app assumes
// team names are unique. Mirrors profileSlug.ts exactly - see that file's
// header comment for the full rationale.
export function teamSlug(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, '-')
}
