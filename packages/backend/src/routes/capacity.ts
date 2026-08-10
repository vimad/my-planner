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
import { isSplitTicket, resolveDevQa, roleSubtaskEstimateHours, type MembershipForResolution } from '../services/devQaResolution.ts'

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
          const hours = await roleSubtaskEstimateHours(ticket.jiraKey, 'Dev')
          const key = String(resolution.dev.personId)
          splitPlannedByPersonId.set(key, (splitPlannedByPersonId.get(key) ?? 0) + hours)
        }
        if (resolution.qa.status === 'resolved') {
          const hours = await roleSubtaskEstimateHours(ticket.jiraKey, 'Test')
          const key = String(resolution.qa.personId)
          splitPlannedByPersonId.set(key, (splitPlannedByPersonId.get(key) ?? 0) + hours)
        }
      }

      const capacities = await Promise.all(
        memberships.map(async (membership) => {
          const capacityEntry = await CapacityEntry.findOne({ teamMembershipId: membership._id, sprintId })
          const leaveDays = capacityEntry?.leaveDays ?? 0
          const effectivePercentage =
            membership.capacityPercentOverride ?? ROLE_DEFAULT_CAPACITY_PERCENT[membership.role]

          const person = membership.personId
          // Non-split tickets only — a Split ticket's own assigneeAccountId
          // (if Jira even sets one) is irrelevant to Planning-view
          // placement; see the splitPlannedByPersonId loop above.
          const assignedTickets = planEntries
            .filter((entry) => !isSplitTicket(entry.ticketId.type) && entry.ticketId.assigneeAccountId === person.jiraAccountId)
            .map((entry) => entry.ticketId)
          const effortValues = await Promise.all(assignedTickets.map((ticket) => computeEffortHours(ticket)))
          const nonSplitPlanned = effortValues.reduce<number>((sum, hours) => sum + (hours ?? 0), 0)
          const planned = nonSplitPlanned + (splitPlannedByPersonId.get(String(person._id)) ?? 0)

          const { total, available, remaining } = computeCapacity({
            workingDays: teamSprintPlan.workingDays,
            leaveDays,
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
