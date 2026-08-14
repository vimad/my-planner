// "1d 4h" style formatting for an hours duration - an 8h workday, matching
// Jira's own default timetracking format. `compact: true` (utils/
// sprintExport.ts's per-person ticket-summary cell) joins with no space
// instead ("1d4h") to match the source sheet's own tighter "KEY(1d4h)" style.
export function formatDaysHours(hours: number, options?: { compact?: boolean }): string {
  const totalMinutes = Math.round(hours * 60)
  const days = Math.floor(totalMinutes / (8 * 60))
  const hrs = Math.floor((totalMinutes % (8 * 60)) / 60)
  const mins = totalMinutes % 60
  const parts: string[] = []
  if (days > 0) parts.push(`${days}d`)
  if (hrs > 0) parts.push(`${hrs}h`)
  if (mins > 0 && days === 0) parts.push(`${mins}m`)
  return parts.length > 0 ? parts.join(options?.compact ? '' : ' ') : '0h'
}
