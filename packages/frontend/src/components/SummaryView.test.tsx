import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from 'vitest'
import { localTodayISO } from '../utils/dateAgenda'
import { addDays, formatSegmentDate, mondayOf } from '../utils/weekDates'
import type { Category, Todo, WeeklySummaryResponse } from '../types'
import { SummaryView } from './SummaryView'

interface FakeResponse {
  ok: boolean
  status: number
  json: () => Promise<unknown>
}

type FetchMock = Mock<(url: string, init?: unknown) => Promise<FakeResponse>>

function jsonResponse(body: unknown, ok = true): Promise<FakeResponse> {
  return Promise.resolve({
    ok,
    status: ok ? 200 : 500,
    json: () => Promise.resolve(body),
  })
}

function stubFetch(handler: (url: string) => Promise<FakeResponse>): FetchMock {
  const mock: FetchMock = vi.fn((url) => handler(String(url)))
  vi.stubGlobal('fetch', mock)
  return mock
}

const workCategory: Category = { _id: 'cat-work', name: 'Work', color: '#8b5cf6' }
const personalCategory: Category = { _id: 'cat-personal', name: 'Personal', color: '#ec4899' }
// Present in the `categories` prop but never returned by the response -
// proves an unmatched category in the prop is harmless (see the ticket's
// last acceptance criterion).
const unusedCategory: Category = { _id: 'cat-unused', name: 'Unused', color: '#22c55e' }

// Matches the ids referenced by thisWeekResponse/lastWeekResponse below, so
// row clicks can be resolved to a real Todo for the onOpenTodo assertions.
const todos: Todo[] = [
  { _id: 'todo-completed', title: 'Ship Q3 roadmap deck' },
  { _id: 'todo-actioned', title: '1:1 notes follow-up with Sam' },
  { _id: 'todo-noaction-1', title: 'Renew AWS cert' },
  { _id: 'todo-noaction-2', title: 'Write incident postmortem' },
  { _id: 'todo-completed-2', title: 'Renew passport' },
  { _id: 'todo-old', title: 'Old carryover item' },
]

// All dates below are derived from the real "today" (never hardcoded/faked)
// so this suite passes regardless of which day it actually runs on - the
// hook's initial fetch is keyed off localTodayISO(), and formatSegmentDate's
// Today/Yesterday/Tomorrow special-casing means a hardcoded date could
// silently land on one of those depending on the run date.
const today = localTodayISO()
const weekStart = mondayOf(today)
const weekEnd = addDays(weekStart, 6)
const yesterday = addDays(today, -1)
const tomorrow = addDays(today, 1)
// A day within the current week guaranteed not to render as
// Today/Yesterday/Tomorrow, and distinct from the actioned entry's own
// segment dates below (weekStart/weekEnd) to avoid two rows sharing one
// formatted badge string.
const safeDay = [0, 1, 2, 3, 4, 5, 6]
  .map((offset) => addDays(weekStart, offset))
  .find((d) => d !== today && d !== yesterday && d !== tomorrow && d !== weekStart && d !== weekEnd)!
const safeDayLabel = formatSegmentDate(safeDay, today)

const prevWeekDate = addDays(today, -7)
const prevWeekStart = addDays(weekStart, -7)
const prevWeekEnd = addDays(prevWeekStart, 6)

const thisWeekResponse: WeeklySummaryResponse = {
  weekStart,
  weekEnd,
  categories: [
    {
      categoryId: 'cat-work',
      completed: [
        {
          id: 'todo-completed',
          title: 'Ship Q3 roadmap deck',
          completedAt: safeDay,
          lastSegmentBeforeCompletion: { date: '2020-01-01', text: 'Outlined sections, blocked on numbers.' },
        },
      ],
      actioned: [
        {
          id: 'todo-actioned',
          title: '1:1 notes follow-up with Sam',
          segments: [
            { date: weekStart, text: 'Sam wants a written proposal.' },
            { date: weekEnd, text: 'Drafted proposal, waiting on his read-through.' },
          ],
        },
      ],
      noAction: [
        { id: 'todo-noaction-1', title: 'Renew AWS cert' },
        { id: 'todo-noaction-2', title: 'Write incident postmortem' },
      ],
    },
    {
      categoryId: 'cat-personal',
      completed: [
        {
          id: 'todo-completed-2',
          title: 'Renew passport',
          completedAt: safeDay,
          lastSegmentBeforeCompletion: null,
        },
      ],
      actioned: [],
      noAction: [],
    },
  ],
}

const lastWeekResponse: WeeklySummaryResponse = {
  weekStart: prevWeekStart,
  weekEnd: prevWeekEnd,
  categories: [
    {
      categoryId: 'cat-work',
      completed: [],
      actioned: [],
      noAction: [{ id: 'todo-old', title: 'Old carryover item' }],
    },
  ],
}

let fetchMock: FetchMock

function stubWeeklySummaryFetch() {
  fetchMock = stubFetch((href) => {
    if (href.includes(`date=${prevWeekDate}`)) return jsonResponse(lastWeekResponse)
    return jsonResponse(thisWeekResponse)
  })
}

describe('SummaryView', () => {
  beforeEach(() => {
    stubWeeklySummaryFetch()
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('fetches on mount with the active profile and renders category cards from the response', async () => {
    render(
      <SummaryView
        activeProfileId="profile-1"
        categories={[workCategory, personalCategory, unusedCategory]}
        todos={todos}
        onOpenTodo={vi.fn()}
      />,
    )

    await waitFor(() => expect(fetchMock).toHaveBeenCalled())
    const [url] = fetchMock.mock.calls[0]
    expect(String(url)).toContain('/api/todos/weekly-summary')
    expect(String(url)).toContain('profileId=profile-1')

    expect(await screen.findByText('Work')).toBeInTheDocument()
    expect(screen.getByText('Personal')).toBeInTheDocument()
    expect(screen.queryByText('Unused')).not.toBeInTheDocument()
  })

  it('shows a rollup line with counts derived from array lengths', async () => {
    render(
      <SummaryView
        activeProfileId="profile-1"
        categories={[workCategory, personalCategory]}
        todos={todos}
        onOpenTodo={vi.fn()}
      />,
    )

    expect(await screen.findByText('1 actioned · 2 no-action · 1 completed')).toBeInTheDocument()
    expect(screen.getByText('0 actioned · 0 no-action · 1 completed')).toBeInTheDocument()
  })

  it('expands a category card to reveal its three bucket sections', async () => {
    render(
      <SummaryView
        activeProfileId="profile-1"
        categories={[workCategory, personalCategory]}
        todos={todos}
        onOpenTodo={vi.fn()}
      />,
    )

    await screen.findByText('Work')
    expect(screen.queryByText('Action taken this week')).not.toBeInTheDocument()

    fireEvent.click(screen.getByText('Work'))

    expect(screen.getByText('Action taken this week')).toBeInTheDocument()
    expect(screen.getByText('Completed this week')).toBeInTheDocument()
    expect(screen.getByText('No action taken this week')).toBeInTheDocument()
  })

  it('renders every segment of an actioned todo as its own row, not just the latest', async () => {
    render(
      <SummaryView
        activeProfileId="profile-1"
        categories={[workCategory, personalCategory]}
        todos={todos}
        onOpenTodo={vi.fn()}
      />,
    )

    await screen.findByText('Work')
    fireEvent.click(screen.getByText('Work'))

    expect(screen.getByText('Sam wants a written proposal.')).toBeInTheDocument()
    expect(screen.getByText('Drafted proposal, waiting on his read-through.')).toBeInTheDocument()
  })

  it('shows the completion badge and Last update line when lastSegmentBeforeCompletion is present', async () => {
    render(
      <SummaryView
        activeProfileId="profile-1"
        categories={[workCategory, personalCategory]}
        todos={todos}
        onOpenTodo={vi.fn()}
      />,
    )

    await screen.findByText('Work')
    fireEvent.click(screen.getByText('Work'))

    expect(screen.getByText('Ship Q3 roadmap deck')).toBeInTheDocument()
    expect(screen.getByText(safeDayLabel)).toBeInTheDocument()
    expect(screen.getByText('Last update: "Outlined sections, blocked on numbers."')).toBeInTheDocument()
  })

  it('renders no Last update line when lastSegmentBeforeCompletion is null', async () => {
    render(
      <SummaryView
        activeProfileId="profile-1"
        categories={[workCategory, personalCategory]}
        todos={todos}
        onOpenTodo={vi.fn()}
      />,
    )

    await screen.findByText('Personal')
    fireEvent.click(screen.getByText('Personal'))

    expect(screen.getByText('Renew passport')).toBeInTheDocument()
    expect(screen.queryByText(/Last update:/)).not.toBeInTheDocument()
  })

  it('renders no-action todos as plain pills', async () => {
    render(
      <SummaryView
        activeProfileId="profile-1"
        categories={[workCategory, personalCategory]}
        todos={todos}
        onOpenTodo={vi.fn()}
      />,
    )

    await screen.findByText('Work')
    fireEvent.click(screen.getByText('Work'))

    const pill = screen.getByText('Renew AWS cert')
    expect(pill.tagName).toBe('LI')
    expect(screen.getByText('Write incident postmortem')).toBeInTheDocument()
  })

  it('opens the matching todo from onOpenTodo when a row in any bucket is clicked', async () => {
    const onOpenTodo = vi.fn()
    render(
      <SummaryView
        activeProfileId="profile-1"
        categories={[workCategory, personalCategory]}
        todos={todos}
        onOpenTodo={onOpenTodo}
      />,
    )

    await screen.findByText('Work')
    fireEvent.click(screen.getByText('Work'))

    fireEvent.click(screen.getByText('1:1 notes follow-up with Sam'))
    expect(onOpenTodo).toHaveBeenCalledWith(todos.find((t) => t._id === 'todo-actioned'))

    fireEvent.click(screen.getByText('Ship Q3 roadmap deck'))
    expect(onOpenTodo).toHaveBeenCalledWith(todos.find((t) => t._id === 'todo-completed'))

    fireEvent.click(screen.getByText('Renew AWS cert'))
    expect(onOpenTodo).toHaveBeenCalledWith(todos.find((t) => t._id === 'todo-noaction-1'))

    expect(onOpenTodo).toHaveBeenCalledTimes(3)
  })

  it('does nothing when a row is clicked whose id has no match in the todos prop', async () => {
    const onOpenTodo = vi.fn()
    render(
      <SummaryView
        activeProfileId="profile-1"
        categories={[workCategory, personalCategory]}
        todos={[]}
        onOpenTodo={onOpenTodo}
      />,
    )

    await screen.findByText('Work')
    fireEvent.click(screen.getByText('Work'))
    fireEvent.click(screen.getByText('Renew AWS cert'))

    expect(onOpenTodo).not.toHaveBeenCalled()
  })

  it('re-fetches with an updated date on prev/next, and "This week" only appears on a non-current week', async () => {
    render(
      <SummaryView
        activeProfileId="profile-1"
        categories={[workCategory, personalCategory]}
        todos={todos}
        onOpenTodo={vi.fn()}
      />,
    )

    await screen.findByText('Work')
    expect(screen.queryByText('This week')).not.toBeInTheDocument()
    // Expand before navigating - expand/collapse state is keyed by category
    // id and lives in SummaryView itself, so it should survive a re-fetch.
    fireEvent.click(screen.getByText('Work'))
    expect(await screen.findByText('Ship Q3 roadmap deck')).toBeInTheDocument()

    fireEvent.click(screen.getByLabelText('Previous week'))

    await waitFor(() => expect(fetchMock.mock.calls.length).toBeGreaterThan(1))
    const lastCallUrl = String(fetchMock.mock.calls[fetchMock.mock.calls.length - 1][0])
    expect(lastCallUrl).toContain(`date=${prevWeekDate}`)

    expect(await screen.findByText('Old carryover item')).toBeInTheDocument()
    const thisWeekButton = await screen.findByText('This week')
    expect(thisWeekButton).toBeInTheDocument()

    fireEvent.click(thisWeekButton)

    await waitFor(() => expect(screen.queryByText('This week')).not.toBeInTheDocument())
    expect(await screen.findByText('Ship Q3 roadmap deck')).toBeInTheDocument()
    expect(screen.queryByText('Old carryover item')).not.toBeInTheDocument()
  })
})
