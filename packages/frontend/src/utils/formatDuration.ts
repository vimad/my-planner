// "1d 4h" style formatting for an hours duration - an 8h workday, matching
// Jira's own default timetracking format.
export function formatDaysHours(hours: number): string {
  const totalMinutes = Math.round(hours * 60)
  const days = Math.floor(totalMinutes / (8 * 60))
  const hrs = Math.floor((totalMinutes % (8 * 60)) / 60)
  const mins = totalMinutes % 60
  const parts: string[] = []
  if (days > 0) parts.push(`${days}d`)
  if (hrs > 0) parts.push(`${hrs}h`)
  if (mins > 0 && days === 0) parts.push(`${mins}m`)
  return parts.length > 0 ? parts.join(' ') : '0h'
}
