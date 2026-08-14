import { act, renderHook, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from 'vitest'
import { useSprintPlan } from './useSprintPlan'
import type { BacklogTicket, Sprint, SprintPlanEntry, Ticket } from '../types'

// Scoped to this ticket's two new actions only (fetchBacklog, addFromBacklog)
// - this file didn't exist before ticket 02 of .scratch/add-from-backlog, so
// there's no pre-existing whole-hook coverage to extend. The "always open
// the popup" behavior itself is exercised at the PlanningView.tsx level
// instead (see PlanningView.test.tsx's "Add from backlog" describe block),
// since `popupTicketId` is UI state PlanningView owns, not this hook - see
// addFromBacklog's own comment in useSprintPlan.ts for why.

interface FakeResponse {
  ok: boolean
  status: number
  json: () => Promise<unknown>
}

function jsonResponse(body: unknown, status = 200): Promise<FakeResponse> {
  return Promise.resolve({ ok: status < 400, status, json: () => Promise.resolve(body) })
}

const sprint: Sprint = { _id: 'sprint-1', jiraSprintId: '132', name: 'WOSMVP Sprint 132', state: 'active' }

const ticket: Ticket = {
  _id: 't1',
  jiraKey: 'WOSMVP-500',
  type: 'Story',
  title: 'A ticket',
  status: 'To Do',
  assigneeAccountId: null,
  assigneeDisplayName: null,
  assigneeEmail: null,
  estimateHours: 4,
  labels: [],
  stream: null,
  epicKey: null,
  parentKey: null,
  subtaskKind: null,
  currentSprintKey: null,
  lastSyncedAt: new Date().toISOString(),
}

const backlogTicket: BacklogTicket = {
  key: 'WOSMVP-500',
  title: 'A ticket',
  type: 'Story',
  labels: [],
  dev: { name: 'Ada Lovelace' },
  qa: null,
  assignee: null,
}

let fetchMock: Mock

function stubFetch(): Mock {
  const mock = vi.fn((url: string, init?: { method?: string; body?: string }) => {
    const href = String(url)
    const method = init?.method ?? 'GET'

    if (href.includes('/api/sprints')) return jsonResponse([sprint])
    if (href.includes('/api/team-memberships')) return jsonResponse([])
    if (href.includes('/api/tickets/backlog')) return jsonResponse([backlogTicket])

    if (href.includes('/api/sprint-plan-entries') && method === 'POST') {
      const created: SprintPlanEntry = { _id: 'e1', teamId: 'team-a', sprintId: 'sprint-1', ticketId: ticket, order: 0, devOrder: null, qaOrder: null }
      return jsonResponse(created, 201)
    }
    if (href.includes('/api/sprint-plan-entries')) return jsonResponse([])
    if (href.includes('/capacity')) return jsonResponse({ error: 'not found' }, 404)
    if (href.includes('/api/placeholder-tickets')) return jsonResponse([])

    return jsonResponse([])
  })
  fetchMock = mock
  vi.stubGlobal('fetch', mock)
  return mock
}

async function renderReady() {
  const result = renderHook(() => useSprintPlan('team-a'))
  await waitFor(() => expect(result.result.current.selectedSprintId).toBe('sprint-1'))
  return result
}

describe('useSprintPlan - fetchBacklog/addFromBacklog (ticket 02 of .scratch/add-from-backlog)', () => {
  beforeEach(() => {
    stubFetch()
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('fetchBacklog wraps GET /api/tickets/backlog with the team and category', async () => {
    const { result } = await renderReady()

    let tickets: BacklogTicket[] = []
    await act(async () => {
      tickets = await result.current.fetchBacklog('tech-ops')
    })

    expect(tickets).toEqual([backlogTicket])
    expect(fetchMock).toHaveBeenCalledWith(
      'http://localhost:4100/api/tickets/backlog?teamId=team-a&category=tech-ops',
    )
  })

  it('fetchBacklog never sends a q param - the caller filters client-side', async () => {
    const { result } = await renderReady()

    await act(async () => {
      await result.current.fetchBacklog('product')
    })

    const backlogCall = fetchMock.mock.calls.find((call: unknown[]) => String(call[0]).includes('/api/tickets/backlog'))
    expect(backlogCall?.[0]).not.toContain('q=')
  })

  it('fetchBacklog throws with the parsed error message on failure', async () => {
    const { result } = await renderReady()
    fetchMock.mockImplementationOnce(() => jsonResponse({ error: 'Could not resolve the Jira board' }, 502))

    await expect(result.current.fetchBacklog('bug')).rejects.toThrow('Could not resolve the Jira board')
  })

  it('addFromBacklog posts the same way addTicket does and returns the created entry', async () => {
    const { result } = await renderReady()

    let created: SprintPlanEntry | null = null
    await act(async () => {
      created = await result.current.addFromBacklog('WOSMVP-500')
    })

    expect(created).not.toBeNull()
    expect(created!.ticketId.jiraKey).toBe('WOSMVP-500')
    expect(fetchMock).toHaveBeenCalledWith(
      'http://localhost:4100/api/sprint-plan-entries',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ teamId: 'team-a', sprintId: 'sprint-1', jiraKey: 'WOSMVP-500' }),
      }),
    )
  })
})
