import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from 'vitest'
import { AtlasView } from './AtlasView'
import type { AtlasEpic } from '../types'

interface FakeResponse {
  ok: boolean
  status: number
  json: () => Promise<unknown>
}

interface FetchCallInit {
  method?: string
  headers?: Record<string, string>
  body?: string
}

type FetchMock = Mock<(url: string, init?: FetchCallInit) => Promise<FakeResponse>>

function jsonResponse(body: unknown, status = 200): Promise<FakeResponse> {
  return Promise.resolve({ ok: status < 400, status, json: () => Promise.resolve(body) })
}

let listData: AtlasEpic[]
let fetchMock: FetchMock

function stubFetch(postHandler?: (init: FetchCallInit) => Promise<FakeResponse>): FetchMock {
  const mock: FetchMock = vi.fn((url, init) => {
    const href = String(url)
    const method = init?.method ?? 'GET'
    if (href.endsWith('/api/atlas/epics') && method === 'GET') {
      return jsonResponse(listData)
    }
    if (href.endsWith('/api/atlas/epics') && method === 'POST') {
      return postHandler ? postHandler(init!) : jsonResponse({ error: 'no handler' }, 500)
    }
    return jsonResponse([])
  })
  fetchMock = mock
  vi.stubGlobal('fetch', mock)
  return mock
}

describe('AtlasView', () => {
  beforeEach(() => {
    listData = []
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('shows the empty state and loads the (empty) tracked-epics list on mount', async () => {
    stubFetch()
    render(<AtlasView />)

    await waitFor(() => {
      expect(screen.getByText('No epics tracked yet')).toBeInTheDocument()
    })
    expect(fetchMock).toHaveBeenCalledWith(expect.stringContaining('/api/atlas/epics'))
  })

  it('submitting a valid epic key syncs it and renders the epic + its task/sub-task tree', async () => {
    stubFetch(async (init) => {
      const body = JSON.parse(init.body ?? '{}')
      expect(body.jiraKey).toBe('WOSMVP-8262')
      listData = [
        {
          _id: 'e1',
          jiraKey: 'WOSMVP-8262',
          title: 'The Epic',
          jiraUrl: 'https://wealthos.atlassian.net/browse/WOSMVP-8262',
          notes: '',
          archived: false,
          lastSyncedAt: '2026-08-19T00:00:00.000Z',
          tasks: [
            {
              _id: 't1',
              epicId: 'e1',
              parentTaskId: null,
              jiraKey: 'WOSMVP-100',
              title: 'Do the thing',
              jiraUrl: 'https://wealthos.atlassian.net/browse/WOSMVP-100',
              assigneeAccountId: null,
              status: 'To Do',
              startDate: null,
              endDate: null,
              atRisk: false,
              notes: '',
              blockedBy: [],
              archived: false,
              subtasks: [
                {
                  _id: 't2',
                  epicId: 'e1',
                  parentTaskId: 't1',
                  jiraKey: 'WOSMVP-101',
                  title: 'Do the sub-thing',
                  jiraUrl: 'https://wealthos.atlassian.net/browse/WOSMVP-101',
                  assigneeAccountId: null,
                  status: 'In Progress',
                  startDate: null,
                  endDate: null,
                  atRisk: false,
                  notes: '',
                  blockedBy: [],
                  archived: false,
                  subtasks: [],
                },
              ],
            },
          ],
        },
      ]
      return jsonResponse({ epic: { _id: 'e1', jiraKey: 'WOSMVP-8262' }, tasks: [] }, 201)
    })

    render(<AtlasView />)
    await waitFor(() => expect(screen.getByText('No epics tracked yet')).toBeInTheDocument())

    fireEvent.change(screen.getByLabelText('Jira epic key'), { target: { value: 'WOSMVP-8262' } })
    fireEvent.click(screen.getByRole('button', { name: 'Track' }))

    expect(screen.getByRole('button', { name: 'Syncing…' })).toBeDisabled()

    await waitFor(() => {
      expect(screen.getByText('The Epic')).toBeInTheDocument()
    })
    expect(screen.getByText('WOSMVP-100')).toBeInTheDocument()
    expect(screen.getByText('Do the thing')).toBeInTheDocument()
    expect(screen.getByText('WOSMVP-101')).toBeInTheDocument()
    expect(screen.getByText('Do the sub-thing')).toBeInTheDocument()
    expect(screen.queryByText('No epics tracked yet')).not.toBeInTheDocument()
    // Input cleared after a successful track.
    expect(screen.getByLabelText('Jira epic key')).toHaveValue('')
  })

  it('submitting an unresolvable key shows an inline error and adds nothing to the list', async () => {
    stubFetch(async () => jsonResponse({ error: 'Jira issue WOSMVP-9999 was not found' }, 404))

    render(<AtlasView />)
    await waitFor(() => expect(screen.getByText('No epics tracked yet')).toBeInTheDocument())

    fireEvent.change(screen.getByLabelText('Jira epic key'), { target: { value: 'WOSMVP-9999' } })
    fireEvent.click(screen.getByRole('button', { name: 'Track' }))

    await waitFor(() => {
      expect(screen.getByText('Error: Jira issue WOSMVP-9999 was not found')).toBeInTheDocument()
    })
    expect(screen.getByText('No epics tracked yet')).toBeInTheDocument()
    // Input is not cleared on failure, so the user can correct/resubmit.
    expect(screen.getByLabelText('Jira epic key')).toHaveValue('WOSMVP-9999')
  })

  it('submitting a non-Epic key shows an inline error and adds nothing to the list', async () => {
    stubFetch(async () => jsonResponse({ error: 'WOSMVP-100 is a Story issue, not an Epic' }, 422))

    render(<AtlasView />)
    await waitFor(() => expect(screen.getByText('No epics tracked yet')).toBeInTheDocument())

    fireEvent.change(screen.getByLabelText('Jira epic key'), { target: { value: 'WOSMVP-100' } })
    fireEvent.click(screen.getByRole('button', { name: 'Track' }))

    await waitFor(() => {
      expect(screen.getByText('Error: WOSMVP-100 is a Story issue, not an Epic')).toBeInTheDocument()
    })
    expect(screen.getByText('No epics tracked yet')).toBeInTheDocument()
  })

  it('disables the Track button while the input is blank', async () => {
    stubFetch()
    render(<AtlasView />)
    await waitFor(() => expect(screen.getByText('No epics tracked yet')).toBeInTheDocument())

    expect(screen.getByRole('button', { name: 'Track' })).toBeDisabled()
  })
})
