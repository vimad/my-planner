import type { Types } from 'mongoose'
import { AtlasPlanningEntry } from '../models/AtlasPlanningEntry.ts'
import { AtlasRosterMember } from '../models/AtlasRosterMember.ts'
import { AtlasTask, type AtlasTaskDoc } from '../models/AtlasTask.ts'
import type { PersonDoc } from '../models/Person.ts'

type PopulatedPerson = PersonDoc & { _id: Types.ObjectId }
type SyncedTask = AtlasTaskDoc & { _id: Types.ObjectId }

// Reconciles the Planning tab's board-derived entries (models/
// AtlasPlanningEntry.ts) against the current state of AtlasTask + the Atlas
// roster. Manual attach/reassign/remove are gone (the Planning tab is now a
// pure projection of the board, per person) - this function is the only
// writer of rosterMemberId/taskId/jiraKey/order, called from two places:
//   - routes/atlasEpics.ts, after every Board/Summary sync (track, per-epic
//     "Sync now", and "Sync all") - so a ticket reaching Done there drops off
//     Planning in the same request, and a newly-synced To Do/In Progress
//     ticket appears immediately.
//   - routes/atlasPlanningEntries.ts's POST /sync, called once by the
//     frontend when the Planning tab loads and finds zero entries - the
//     one-time "initial load" seed from whatever's already tracked.
// Both call sites share this one implementation so "initial load" and
// "ongoing sync" behave identically rather than needing two parallel rules.
export async function reconcilePlanningEntries(): Promise<void> {
  const roster = await AtlasRosterMember.find().populate<{ personId: PopulatedPerson }>('personId')
  const rosterMemberIdByAccountId = new Map<string, Types.ObjectId>()
  for (const member of roster) {
    if (member.personId.jiraAccountId) {
      rosterMemberIdByAccountId.set(member.personId.jiraAccountId, member._id as Types.ObjectId)
    }
  }

  const tasks = (await AtlasTask.find({ archived: false })) as SyncedTask[]
  const taskById = new Map(tasks.map((t) => [String(t._id), t]))

  const existingEntries = await AtlasPlanningEntry.find()

  const toDelete: Types.ObjectId[] = []
  const maxOrderByPerson = new Map<string, number>()
  const stationaryTaskIds = new Set<string>()
  const toAppend: { task: SyncedTask; rosterMemberId: Types.ObjectId; entryId?: Types.ObjectId }[] = []

  // Pass 1: every existing entry either survives untouched (still an active,
  // non-Done task, still mapped to the same roster member), gets queued to
  // move to a new person (a Jira-side reassignment), or gets queued for
  // deletion (task gone/archived/Done, or its assignee no longer maps to
  // anyone on the roster).
  for (const entry of existingEntries) {
    const task = taskById.get(String(entry.taskId))
    const rosterMemberId = task?.assigneeAccountId ? rosterMemberIdByAccountId.get(task.assigneeAccountId) : undefined

    if (!task || task.status === 'Done' || !rosterMemberId) {
      toDelete.push(entry._id as Types.ObjectId)
      continue
    }

    if (String(rosterMemberId) === String(entry.rosterMemberId)) {
      stationaryTaskIds.add(String(entry.taskId))
      const key = String(rosterMemberId)
      maxOrderByPerson.set(key, Math.max(maxOrderByPerson.get(key) ?? -1, entry.order))
    } else {
      toAppend.push({ task, rosterMemberId, entryId: entry._id as Types.ObjectId })
    }
  }

  // Pass 2: any active, non-Done, roster-mapped task with no surviving entry
  // yet (never synced into Planning before) also gets appended.
  const movedTaskIds = new Set(toAppend.map((a) => String(a.task._id)))
  for (const task of tasks) {
    if (task.status === 'Done') continue
    if (stationaryTaskIds.has(String(task._id)) || movedTaskIds.has(String(task._id))) continue
    if (!task.assigneeAccountId) continue
    const rosterMemberId = rosterMemberIdByAccountId.get(task.assigneeAccountId)
    if (!rosterMemberId) continue
    toAppend.push({ task, rosterMemberId })
  }

  // In Progress before To Do within each person's newly-appended batch -
  // this is what makes the very first seed land "In Progress ordered first,
  // then the To Do ones" per person, and is applied the same way to every
  // later sync's freshly-appended tickets too (there's no case where a
  // just-appeared To Do ticket should outrank a just-appeared In Progress
  // one). A stable sort, so within the same status a person's tickets keep
  // whatever relative order `tasks` came back in.
  const statusRank = (status: AtlasTaskDoc['status']) => (status === 'In Progress' ? 0 : 1)
  toAppend.sort((a, b) => statusRank(a.task.status) - statusRank(b.task.status))

  if (toDelete.length > 0) {
    await AtlasPlanningEntry.deleteMany({ _id: { $in: toDelete } })
  }

  for (const { task, rosterMemberId, entryId } of toAppend) {
    const key = String(rosterMemberId)
    const nextOrder = (maxOrderByPerson.get(key) ?? -1) + 1
    maxOrderByPerson.set(key, nextOrder)

    if (entryId) {
      await AtlasPlanningEntry.updateOne({ _id: entryId }, { $set: { rosterMemberId, jiraKey: task.jiraKey, order: nextOrder } })
    } else {
      await AtlasPlanningEntry.create({
        rosterMemberId,
        taskId: task._id,
        jiraKey: task.jiraKey,
        order: nextOrder,
        startDate: null,
        endDate: null,
      })
    }
  }
}
