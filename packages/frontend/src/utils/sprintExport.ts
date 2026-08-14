// Sprint Planning "Export" button (sits before the Gantt chart button,
// PlanningView.tsx's "Tickets by person" header) - builds a spreadsheet
// snapshot of the planning table (Person/Role/Leave/Total/Available/Planned/
// Remaining, plus each person's current-sprint ticket list) and the Sprint
// Breakdown card's Features/Technical items/Bugs percentages, similar in
// spirit to the team's existing hand-maintained Google Sheet. Split into a
// pure data-building half (this file's exported functions, unit-tested) and
// a thin XLSX-writing wrapper (downloadSprintPlanExcel) that isn't - it just
// hands the built AOA to the `xlsx` package.
import * as XLSX from 'xlsx'
import { DEV_ROLES, QA_ROLES } from '../constants/roles'
import { parseLocalDate } from './dateAgenda'
import { formatDaysHours } from './formatDuration'
import { getId } from './getId'
import { computeSprintBreakdown } from './sprintBreakdown'
import { buildMembershipIdByPersonId, groupPlacementsByMembership, rolePlannedHours } from './ticketPlacements'
import type { PlaceholderTicket, Role, SprintCapacity, SprintPlanEntry, TeamMembership } from '../types'
import type { SprintPeriod } from '../hooks/useSprintPlan'

function formatCompactDuration(hours: number): string {
  return formatDaysHours(hours, { compact: true })
}

export interface SprintExportRow {
  role: Role
  name: string
  leaveDays: number
  total: number
  available: number
  planned: number
  remaining: number
  // This sprint's planned tickets/placeholders for this person, "KEY(1d4h)"
  // per item, comma-separated - the clarified scope for the image's
  // "Remaining tickets and future tickets" column: this app only tracks one
  // sprint's plan at a time, so "future tickets" isn't derivable data, and
  // this is the closest available substitute.
  ticketSummary: string
}

// One row per current (non-PO) TeamMembership, in roster order - mirrors
// PlanningView's own planningMemberships.map(...) row order, so the export
// reads as the same list the screen shows.
export function buildSprintExportRows(
  memberships: TeamMembership[],
  capacity: SprintCapacity[],
  entries: SprintPlanEntry[],
  placeholders: PlaceholderTicket[],
): SprintExportRow[] {
  const { ticketsByMembershipId } = groupPlacementsByMembership(entries, memberships)
  const capacityByMembershipId = new Map(capacity.map((c) => [c.teamMembershipId, c]))
  const membershipIdByPersonId = buildMembershipIdByPersonId(memberships)

  const placeholdersByMembershipId = new Map<string, PlaceholderTicket[]>()
  for (const placeholder of placeholders) {
    const membershipId = membershipIdByPersonId.get(placeholder.personId)
    if (!membershipId) continue
    if (!placeholdersByMembershipId.has(membershipId)) placeholdersByMembershipId.set(membershipId, [])
    placeholdersByMembershipId.get(membershipId)!.push(placeholder)
  }

  return memberships.map((membership) => {
    const membershipId = getId(membership) ?? ''
    const c = capacityByMembershipId.get(membershipId)
    const placements = ticketsByMembershipId.get(membershipId) ?? []
    const personPlaceholders = placeholdersByMembershipId.get(membershipId) ?? []

    const ticketParts = [
      ...placements.map((p) => `${p.entry.ticketId.jiraKey}(${formatCompactDuration(rolePlannedHours(p.entry, p.role) ?? 0)})`),
      ...personPlaceholders.map((p) => `${p.text}(${formatCompactDuration(p.estimateHours)})`),
    ]

    return {
      role: membership.role,
      name: membership.personId.name,
      leaveDays: c?.leaveDays ?? 0,
      total: c?.total ?? 0,
      available: c?.available ?? 0,
      planned: c?.planned ?? 0,
      remaining: c?.remaining ?? 0,
      ticketSummary: ticketParts.join(', '),
    }
  })
}

export interface RoleGroupTotal {
  label: string
  available: number
  remaining: number
}

// "Total Dev"/"Total QA" summary rows (image's own two rows) - Available/
// Remaining summed across each row-group's own roles (constants/roles.ts's
// DEV_ROLES/QA_ROLES), Total/Planned deliberately left out (the image itself
// only fills Available/Remaining on these two rows).
export function computeRoleGroupTotals(rows: SprintExportRow[]): RoleGroupTotal[] {
  function sum(roles: Role[], key: 'available' | 'remaining'): number {
    return rows.filter((r) => roles.includes(r.role)).reduce((total, r) => total + r[key], 0)
  }
  return [
    { label: 'Total Dev', available: sum(DEV_ROLES, 'available'), remaining: sum(DEV_ROLES, 'remaining') },
    { label: 'Total QA', available: sum(QA_ROLES, 'available'), remaining: sum(QA_ROLES, 'remaining') },
  ]
}

// Inclusive calendar-day count of the sprint's picked date range - "Total
// No. of days" (image's own row), distinct from workingDays (which already
// excludes weekends/holidays - "Total No. of Sprint days" below).
function countCalendarDays(period: SprintPeriod): number {
  const start = parseLocalDate(period.startDate)
  const end = parseLocalDate(period.endDate)
  return Math.round((end.getTime() - start.getTime()) / (24 * 60 * 60 * 1000)) + 1
}

const round2 = (n: number): number => Math.round(n * 100) / 100

// Assembles the full export as a sheet-ready array-of-arrays (one entry per
// output row, each a fixed-width array of cell values) - kept pure/testable,
// separate from the actual XLSX-writing side effect below. Column order:
// Role, Name, Leave, Total, Available, Planned, Remaining, ticket summary.
export function buildSprintExportSheetData(
  memberships: TeamMembership[],
  capacity: SprintCapacity[],
  entries: SprintPlanEntry[],
  placeholders: PlaceholderTicket[],
  period: SprintPeriod | null,
): (string | number)[][] {
  const rows = buildSprintExportRows(memberships, capacity, entries, placeholders)
  const groupTotals = computeRoleGroupTotals(rows)
  const breakdown = computeSprintBreakdown(entries, memberships)

  const sheet: (string | number)[][] = [
    ['Role', 'Name', 'Leave', 'Total', 'Available', 'Planned', 'Remaining', 'Remaining tickets (this sprint)'],
    ...rows.map((r) => [r.role, r.name, r.leaveDays, round2(r.total), round2(r.available), round2(r.planned), round2(r.remaining), r.ticketSummary]),
    [],
    ...groupTotals.map((t) => [t.label, '', '', '', round2(t.available), '', round2(t.remaining), '']),
    [],
  ]

  if (period) {
    sheet.push(
      ['Total No. of days', countCalendarDays(period)],
      ['Total No. of holidays', period.holidays.length],
      ['Total No. of Sprint days', period.workingDays],
      [],
    )
  }

  sheet.push(
    ['Sprint Breakdown'],
    ['Type', 'Hours', 'Percent'],
    ...breakdown.slices.map((s) => [s.bucket, round2(s.hours), `${s.percent}%`]),
    ['Total', round2(breakdown.totalHours), '100%'],
  )

  return sheet
}

// Sanitizes free text into an Excel sheet-name-safe string - sheet names
// can't contain []:*?/\ and are capped at 31 chars (XLSX.utils.book_append_sheet
// throws otherwise).
function sanitizeSheetName(name: string): string {
  const cleaned = name.replace(/[[\]:*?/\\]/g, ' ').trim()
  return (cleaned || 'Sprint Plan').slice(0, 31)
}

// The actual file-producing side effect - builds the workbook from
// buildSprintExportSheetData's AOA and hands off to XLSX.writeFile, which
// triggers the browser's normal download flow. Not unit-tested (would just
// be re-testing the `xlsx` library); buildSprintExportSheetData above is
// where the actual formatting/aggregation logic lives and is covered.
export function downloadSprintPlanExcel(
  teamName: string,
  sprintName: string,
  memberships: TeamMembership[],
  capacity: SprintCapacity[],
  entries: SprintPlanEntry[],
  placeholders: PlaceholderTicket[],
  period: SprintPeriod | null,
): void {
  const data = buildSprintExportSheetData(memberships, capacity, entries, placeholders, period)
  const worksheet = XLSX.utils.aoa_to_sheet(data)
  worksheet['!cols'] = [
    { wch: 10 },
    { wch: 16 },
    { wch: 8 },
    { wch: 8 },
    { wch: 10 },
    { wch: 8 },
    { wch: 10 },
    { wch: 50 },
  ]
  const workbook = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(workbook, worksheet, sanitizeSheetName(sprintName))
  XLSX.writeFile(workbook, `${sanitizeSheetName(`${teamName} ${sprintName} plan`)}.xlsx`)
}
