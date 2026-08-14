import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { AddFromBacklogPopover } from './AddFromBacklogPopover'
import type { BacklogTicket } from '../types'

const techOpsTickets: BacklogTicket[] = [
  {
    key: 'WOSMVP-100',
    title: 'Fix the deploy pipeline',
    type: 'Bug',
    labels: ['Odyssey'],
    dev: { name: 'Vinod Madubashan' },
    qa: null,
    assignee: null,
  },
  {
    key: 'WOSMVP-101',
    title: 'Rotate credentials',
    type: 'Task',
    labels: ['Odyssey'],
    dev: null,
    qa: null,
    assignee: { name: 'Jane Doe' },
  },
]

const productTickets: BacklogTicket[] = [
  {
    key: 'WOSMVP-200',
    title: 'New onboarding flow',
    type: 'Story',
    labels: ['Odyssey'],
    dev: null,
    qa: null,
    assignee: null,
  },
]

function stubFetchBacklog() {
  return vi.fn(async (category: string) => {
    if (category === 'tech-ops') return techOpsTickets
    if (category === 'product') return productTickets
    return []
  })
}

describe('AddFromBacklogPopover', () => {
  it('fetches nothing until opened, then fetches the default (Technical) category', async () => {
    const fetchBacklog = stubFetchBacklog()
    render(<AddFromBacklogPopover fetchBacklog={fetchBacklog} onPick={vi.fn()} />)

    expect(fetchBacklog).not.toHaveBeenCalled()

    fireEvent.click(screen.getByRole('button', { name: 'Add from backlog' }))

    await waitFor(() => expect(screen.getByText('WOSMVP-100')).toBeInTheDocument())
    expect(fetchBacklog).toHaveBeenCalledTimes(1)
    expect(fetchBacklog).toHaveBeenCalledWith('tech-ops')
  })

  it('re-fetches when the active category tab changes', async () => {
    const fetchBacklog = stubFetchBacklog()
    render(<AddFromBacklogPopover fetchBacklog={fetchBacklog} onPick={vi.fn()} />)

    fireEvent.click(screen.getByRole('button', { name: 'Add from backlog' }))
    await waitFor(() => expect(screen.getByText('WOSMVP-100')).toBeInTheDocument())

    fireEvent.click(screen.getByRole('button', { name: 'Product' }))

    await waitFor(() => expect(screen.getByText('WOSMVP-200')).toBeInTheDocument())
    expect(screen.queryByText('WOSMVP-100')).not.toBeInTheDocument()
    expect(fetchBacklog).toHaveBeenCalledTimes(2)
    expect(fetchBacklog).toHaveBeenLastCalledWith('product')
  })

  it('typing in search narrows the already-fetched list without an extra fetch', async () => {
    const fetchBacklog = stubFetchBacklog()
    render(<AddFromBacklogPopover fetchBacklog={fetchBacklog} onPick={vi.fn()} />)

    fireEvent.click(screen.getByRole('button', { name: 'Add from backlog' }))
    await waitFor(() => expect(screen.getByText('WOSMVP-100')).toBeInTheDocument())
    expect(screen.getByText('WOSMVP-101')).toBeInTheDocument()

    fireEvent.change(screen.getByLabelText('Search backlog'), { target: { value: 'deploy' } })

    expect(screen.getByText('WOSMVP-100')).toBeInTheDocument()
    expect(screen.queryByText('WOSMVP-101')).not.toBeInTheDocument()
    expect(fetchBacklog).toHaveBeenCalledTimes(1)
  })

  it('matches by ticket key too, not just title', async () => {
    const fetchBacklog = stubFetchBacklog()
    render(<AddFromBacklogPopover fetchBacklog={fetchBacklog} onPick={vi.fn()} />)

    fireEvent.click(screen.getByRole('button', { name: 'Add from backlog' }))
    await waitFor(() => expect(screen.getByText('WOSMVP-100')).toBeInTheDocument())

    fireEvent.change(screen.getByLabelText('Search backlog'), { target: { value: '101' } })

    expect(screen.queryByText('WOSMVP-100')).not.toBeInTheDocument()
    expect(screen.getByText('WOSMVP-101')).toBeInTheDocument()
  })

  it('shows a loading state while the category fetch is in flight', async () => {
    let resolveFetch: (tickets: BacklogTicket[]) => void = () => {}
    const fetchBacklog = vi.fn(
      () =>
        new Promise<BacklogTicket[]>((resolve) => {
          resolveFetch = resolve
        }),
    )
    render(<AddFromBacklogPopover fetchBacklog={fetchBacklog} onPick={vi.fn()} />)

    fireEvent.click(screen.getByRole('button', { name: 'Add from backlog' }))
    expect(screen.getByText('Loading backlog…')).toBeInTheDocument()

    resolveFetch(techOpsTickets)
    await waitFor(() => expect(screen.getByText('WOSMVP-100')).toBeInTheDocument())
    expect(screen.queryByText('Loading backlog…')).not.toBeInTheDocument()
  })

  it("surfaces the backend's error message", async () => {
    const fetchBacklog = vi.fn().mockRejectedValue(new Error('Could not resolve the Jira board'))
    render(<AddFromBacklogPopover fetchBacklog={fetchBacklog} onPick={vi.fn()} />)

    fireEvent.click(screen.getByRole('button', { name: 'Add from backlog' }))

    await waitFor(() => expect(screen.getByText('Error: Could not resolve the Jira board')).toBeInTheDocument())
  })

  it('clicking a result closes the popover and invokes onPick with that ticket key', async () => {
    const fetchBacklog = stubFetchBacklog()
    const onPick = vi.fn()
    render(<AddFromBacklogPopover fetchBacklog={fetchBacklog} onPick={onPick} />)

    fireEvent.click(screen.getByRole('button', { name: 'Add from backlog' }))
    await waitFor(() => expect(screen.getByText('WOSMVP-100')).toBeInTheDocument())

    fireEvent.click(screen.getByText('WOSMVP-100'))

    expect(onPick).toHaveBeenCalledWith('WOSMVP-100')
    expect(screen.queryByLabelText('Search backlog')).not.toBeInTheDocument()
  })

  it('closes on outside click without picking anything', async () => {
    const fetchBacklog = stubFetchBacklog()
    const onPick = vi.fn()
    render(
      <div>
        <AddFromBacklogPopover fetchBacklog={fetchBacklog} onPick={onPick} />
        <button type="button">Outside</button>
      </div>,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Add from backlog' }))
    await waitFor(() => expect(screen.getByText('WOSMVP-100')).toBeInTheDocument())

    fireEvent.mouseDown(screen.getByRole('button', { name: 'Outside' }))

    expect(screen.queryByLabelText('Search backlog')).not.toBeInTheDocument()
    expect(onPick).not.toHaveBeenCalled()
  })
})
