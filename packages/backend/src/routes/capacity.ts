import { Router, type NextFunction, type Request, type Response } from 'express'
import type { Types } from 'mongoose'
import { TeamMembership } from '../models/TeamMembership.ts'
import { TeamSprintPlan } from '../models/TeamSprintPlan.ts'
import { CapacityEntry } from '../models/CapacityEntry.ts'
import { CapacityLookup } from '../models/CapacityLookup.ts'
import { SprintPlanEntry } from '../models/SprintPlanEntry.ts'
import type { TicketDoc } from '../models/Ticket.ts'
import type { PersonDoc } from '../models/Person.ts'
import { ROLE_DEFAULT_CAPACITY_PERCENT } from '../models/Role.ts'
import { computeEffortHours } from '../services/ticketSync.ts'
import { computeCapacity } from '../services/capacityFormula.ts'
import { plannedHours } from '../services/planSpill.ts'
import { isSplitTicket, resolveDevQa, roleSubtaskEstimateHours, type MembershipForResolution } from '../services/devQaResolution.ts'
import { loadAssigneeOverrides, resolveAssignee } from '../services/assigneeResolution.ts'
import { computeWorkingDates } from '../services/sprintWorkingDays.ts'
import { reconcileWithWorkingDates, totalLeaveDays } from '../services/leaveEntries.ts'

export const capacityRouter = Router()

type PopulatedPerson = PersonDoc & { _id: Types.ObjectId }
type PopulatedTicket = TicketDoc & { _id: Types.ObjectId }

// GET /api/teams/:teamId/sprints/:sprintId/capacity -> per-person
// Total/Available/Planned/Remaining for every current TeamMembership on the
// team, per the spec's "Domain model — Capacity" formula. Read-only: this
// endpoint (and every route in this ticket) never talks to Jira, only the
// already-cached Ticket/SprintPlanEntry data.
capacityRouter.get(
  '/:teamId/sprints/:sprintId/capacity',
  async (req: Request<{ teamId: string; sprintId: string }>, res: Response, next: NextFunction) => {
    try {
      const { teamId, sprintId } = req.params

      const teamSprintPlan = await TeamSprintPlan.findOne({ teamId, sprintId })
      if (!teamSprintPlan) {
        return res.status(404).json({ error: 'No team sprint plan (working days) configured for this sprint' })
      }

      // Read-time reconciliation (spec ".scratch/sprint-leave-picker/
      // spec.md"): a membership's stored leaveEntries are always filtered
      // against the sprint's *current* working dates before being totaled,
      // rather than swept/mutated when the TeamSprintPlan's period changes.
      // A legacy plan with no stored startDate/endDate (pre-period-picker)
      // has no working-date calendar to reconcile against - treated as no
      // working dates, so any stored leave simply doesn't count until a
      // period is set.
      const workingDates =
        teamSprintPlan.startDate && teamSprintPlan.endDate
          ? computeWorkingDates(teamSprintPlan.startDate, teamSprintPlan.endDate, teamSprintPlan.holidays)
          : []

      const memberships = await TeamMembership.find({ teamId }).populate<{ personId: PopulatedPerson }>('personId')
      const lookupRows = await CapacityLookup.find()
      const planEntries = await SprintPlanEntry.find({ teamId, sprintId }).populate<{ ticketId: PopulatedTicket }>(
        'ticketId',
      )

      const membershipsForResolution: MembershipForResolution[] = memberships.map((membership) => ({
        personId: membership.personId._id,
        jiraAccountId: membership.personId.jiraAccountId,
      }))

      // Split tickets (Story/Bug) never attribute Planned via the parent's
      // own assigneeAccountId/computeEffortHours rollup (ticket 23) — each
      // role's Sub-task estimate is summed onto whichever person that role
      // resolves to (override wins per ADR 0004, else a mapped Sub-task
      // assignee). Resolved once per ticket here (not once per person
      // below) since the resolution/estimate don't depend on which person
      // is currently being totaled.
      const splitPlannedByPersonId = new Map<string, number>()
      for (const entry of planEntries) {
        const ticket = entry.ticketId
        if (!isSplitTicket(ticket.type)) continue

        const resolution = await resolveDevQa(ticket, membershipsForResolution)
        if (resolution.dev.status === 'resolved') {
          const original = await roleSubtaskEstimateHours(ticket.jiraKey, 'Dev')
          const hours = plannedHours(original, { planHours: entry.devPlanHours, spillHours: entry.devSpillHours })
          const key = String(resolution.dev.personId)
          splitPlannedByPersonId.set(key, (splitPlannedByPersonId.get(key) ?? 0) + hours)
        }
        if (resolution.qa.status === 'resolved') {
          const original = await roleSubtaskEstimateHours(ticket.jiraKey, 'Test')
          const hours = plannedHours(original, { planHours: entry.qaPlanHours, spillHours: entry.qaSpillHours })
          const key = String(resolution.qa.personId)
          splitPlannedByPersonId.set(key, (splitPlannedByPersonId.get(key) ?? 0) + hours)
        }
      }

      // Non-split tickets' Planned (docs/adr/0005): an Assignee Override, if
      // set, wins over the ticket's own assigneeAccountId — resolved once
      // per ticket here (not once per person below), same batched-upfront
      // shape as splitPlannedByPersonId above, so the Planning table's
      // placement and this sum can never disagree about who owns a ticket. A
      // ticket that resolves to nobody currently on the team (no Override
      // and an unmapped/absent assigneeAccountId) contributes to no one's
      // Planned, same as before this Override existed.
      const personIdByAccountId = new Map(membershipsForResolution.map((m) => [m.jiraAccountId, m.personId]))
      const nonSplitEntries = planEntries.filter((entry) => !isSplitTicket(entry.ticketId.type))
      const assigneeOverrideByTicketId = await loadAssigneeOverrides(nonSplitEntries.map((entry) => entry.ticketId._id))

      const nonSplitPlannedByPersonId = new Map<string, number>()
      for (const entry of nonSplitEntries) {
        const ticket = entry.ticketId
        const resolvedPersonId = resolveAssignee(ticket, assigneeOverrideByTicketId, personIdByAccountId)
        if (!resolvedPersonId) continue

        const original = (await computeEffortHours(ticket)) ?? 0
        const hours = plannedHours(original, { planHours: entry.planHours, spillHours: entry.spillHours })
        const key = String(resolvedPersonId)
        nonSplitPlannedByPersonId.set(key, (nonSplitPlannedByPersonId.get(key) ?? 0) + hours)
      }

      const capacities = await Promise.all(
        memberships.map(async (membership) => {
          const capacityEntry = await CapacityEntry.findOne({ teamMembershipId: membership._id, sprintId })
          const reconciledLeaveEntries = reconcileWithWorkingDates(capacityEntry?.leaveEntries ?? [], workingDates)
          const leaveDays = totalLeaveDays(reconciledLeaveEntries)
          const extraHours = capacityEntry?.extraHours ?? 0
          const effectivePercentage =
            membership.capacityPercentOverride ?? ROLE_DEFAULT_CAPACITY_PERCENT[membership.role]

          const person = membership.personId
          const nonSplitPlanned = nonSplitPlannedByPersonId.get(String(person._id)) ?? 0
          const planned = nonSplitPlanned + (splitPlannedByPersonId.get(String(person._id)) ?? 0)

          const { total, available, remaining } = computeCapacity({
            workingDays: teamSprintPlan.workingDays,
            leaveDays,
            extraHours,
            effectivePercentage,
            planned,
            lookupRows,
          })

          return {
            teamMembershipId: membership._id,
            personId: person._id,
            personName: person.name,
            role: membership.role,
            capacityPercentOverride: membership.capacityPercentOverride,
            effectivePercentage,
            leaveDays,
            extraHours,
            capacityEntryId: capacityEntry?._id ?? null,
            leaveEntries: reconciledLeaveEntries,
            total,
            available,
            planned,
            remaining,
          }
        }),
      )

      res.json(capacities)
    } catch (err) {
      next(err)
    }
  },
)
