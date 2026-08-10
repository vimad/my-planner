import { fireEvent, render, screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { EpicPillStrip } from './EpicPillStrip'
import type { Epic } from '../types'

const epicA: Epic = {
  _id: 'epic-1',
  jiraKey: 'WOSMVP-1',
  title: 'Onboarding revamp',
  status: 'In Progress',
  lastSyncedAt: new Date().toISOString(),
  childCount: 5,
  doneCount: 3,
}

const epicB: Epic = {
  _id: 'epic-2',
  jiraKey: 'WOSMVP-2',
  title: 'Billing v2',
  status: 'To Do',
  lastSyncedAt: new Date().toISOString(),
  childCount: 4,
  doneCount: 0,
}

describe('EpicPillStrip', () => {
  it('renders one pill per epic with the right done/total rollup', () => {
    render(<EpicPillStrip epics={[epicA, epicB]} loading={false} error={null} />)

    const strip = screen.getByLabelText('Active epics')
    expect(within(strip).getByText('Onboarding revamp')).toBeInTheDocument()
    expect(within(strip).getByText('(3/5)')).toBeInTheDocument()
    expect(within(strip).getByText('Billing v2')).toBeInTheDocument()
    expect(within(strip).getByText('(0/4)')).toBeInTheDocument()
  })

  it('shows a loading state while epics are being fetched', () => {
    render(<EpicPillStrip epics={[]} loading={true} error={null} />)
    expect(screen.getByText('Loading epics…')).toBeInTheDocument()
  })

  it('shows an error message when the fetch fails', () => {
    render(<EpicPillStrip epics={[]} loading={false} error="Request failed with status 500" />)
    expect(screen.getByText('Error loading epics: Request failed with status 500')).toBeInTheDocument()
  })

  it('shows an empty state when the sprint has no active epics', () => {
    render(<EpicPillStrip epics={[]} loading={false} error={null} />)
    expect(screen.getByText('No active epics for this sprint.')).toBeInTheDocument()
  })

  it("opens a modal with the clicked epic's data, and closes it again", () => {
    render(<EpicPillStrip epics={[epicA, epicB]} loading={false} error={null} />)

    fireEvent.click(screen.getByText('Billing v2'))

    const modal = screen.getByRole('dialog', { name: 'Billing v2' })
    expect(within(modal).getByText('WOSMVP-2')).toBeInTheDocument()
    expect(within(modal).getByText('To Do · 0/4 child tickets done')).toBeInTheDocument()
    // Not epicA's data - confirms the modal reflects whichever pill was clicked.
    expect(within(modal).queryByText('WOSMVP-1')).not.toBeInTheDocument()

    const jiraLink = within(modal).getByRole('link', { name: /Open in Jira/ })
    expect(jiraLink).toHaveAttribute('href', 'https://wealthos.atlassian.net/browse/WOSMVP-2')
    expect(jiraLink).toHaveAttribute('target', '_blank')

    fireEvent.click(within(modal).getByRole('button', { name: 'Close' }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })
})
