import { BacklogCacheSync } from '../models/BacklogCacheSync.ts'
import { BacklogTicketCache, type BacklogTicketCacheDoc } from '../models/BacklogTicketCache.ts'
import { searchBacklog, type BacklogCategory, type BacklogTicket } from './backlogSearch.ts'

function toBacklogTicket(doc: BacklogTicketCacheDoc): BacklogTicket {
  return {
    key: doc.jiraKey,
    title: doc.title,
    type: doc.type,
    labels: doc.labels,
    dev: doc.dev,
    qa: doc.qa,
    assignee: doc.assignee,
  }
}

async function readCache(teamId: string, category: BacklogCategory): Promise<BacklogTicket[]> {
  const docs = await BacklogTicketCache.find({ teamId, category }).sort({ rank: 1 })
  return docs.map(toBacklogTicket)
}

// Replaces the (teamId, category) cache wholesale with `tickets`, preserving
// their Jira board-rank order (searchBacklog's own ORDER BY Rank ASC) via
// the `rank` field, since Mongo's natural read order can't be trusted to
// match insertion order. Only called after a successful Jira fetch — never
// leaves the cache in a half-replaced state on failure, since the delete and
// insert both happen only once `tickets` is already in hand.
async function replaceCache(teamId: string, category: BacklogCategory, tickets: BacklogTicket[]): Promise<void> {
  await BacklogTicketCache.deleteMany({ teamId, category })
  if (tickets.length > 0) {
    await BacklogTicketCache.insertMany(
      tickets.map((ticket, rank) => ({
        teamId,
        category,
        jiraKey: ticket.key,
        title: ticket.title,
        type: ticket.type,
        labels: ticket.labels,
        dev: ticket.dev,
        qa: ticket.qa,
        assignee: ticket.assignee,
        rank,
      })),
    )
  }
  await BacklogCacheSync.findOneAndUpdate(
    { teamId, category },
    { teamId, category, lastSyncedAt: new Date() },
    { upsert: true },
  )
}

// Cache-first backlog browse: serves the locally-mirrored BacklogTicketCache
// set once a (teamId, category) pair has been synced at all (BacklogCacheSync),
// never re-hitting Jira after that — unlike sprintSync.ts's getSprints, there
// is no TTL here, since a backlog sprint's contents only change when someone
// deliberately re-plans it, not on a schedule. The only way to see fresh
// Jira data after the first fetch is the explicit refreshBacklog below (the
// UI's refresh icon). Returns null when the cache is cold and the Jira fetch
// itself fails to resolve the board/sprint (mirrors searchBacklog's own null
// convention).
export async function getBacklog(
  teamId: string,
  category: BacklogCategory,
  jiraLabels: string[],
): Promise<BacklogTicket[] | null> {
  const synced = await BacklogCacheSync.findOne({ teamId, category })
  if (synced) return readCache(teamId, category)

  return refreshBacklog(teamId, category, jiraLabels)
}

// Forces a live Jira re-fetch and replaces the (teamId, category) cache with
// the result, regardless of whether it was already synced — this is what
// the UI's refresh icon calls. On failure (board/sprint unresolved), the
// existing cache is left untouched rather than wiped, so a transient Jira
// hiccup never turns a working cache into an empty one.
export async function refreshBacklog(
  teamId: string,
  category: BacklogCategory,
  jiraLabels: string[],
): Promise<BacklogTicket[] | null> {
  const tickets = await searchBacklog(category, jiraLabels)
  if (tickets === null) return null

  await replaceCache(teamId, category, tickets)
  return tickets
}
