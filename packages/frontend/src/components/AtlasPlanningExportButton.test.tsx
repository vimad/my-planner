import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { AtlasPlanningExportButton } from './AtlasPlanningExportButton'
import * as atlasPlanningExport from '../utils/atlasPlanningExport'
import type { AtlasPlanningEntry, AtlasPlanningLeaveMark, AtlasRosterMember } from '../types'

function member(id: string, name: string): AtlasRosterMember {
  return {
    _id: id,
    personId: { _id: `p-${id}`, name, email: `${name.toLowerCase()}@example.com`, jiraAccountId: `acc-${id}` },
    createdAt: '2026-08-01T00:00:00.000Z',
  }
}

const WINDOW_DATES = ['2026-08-22', '2026-08-23']

describe('AtlasPlanningExportButton', () => {
  it('is disabled with an explanatory title when the roster is empty', () => {
    render(<AtlasPlanningExportButton roster={[]} entries={[]} leaveMarks={[]} windowDates={WINDOW_DATES} />)
    const button = screen.getByRole('button', { name: 'Export' })
    expect(button).toBeDisabled()
    expect(button).toHaveAttribute('title', 'No one on the Atlas roster yet.')
  })

  it('is disabled with an explanatory title when the roster has no attached tickets or leave', () => {
    render(<AtlasPlanningExportButton roster={[member('m1', 'Alice')]} entries={[]} leaveMarks={[]} windowDates={WINDOW_DATES} />)
    const button = screen.getByRole('button', { name: 'Export' })
    expect(button).toBeDisabled()
    expect(button).toHaveAttribute('title', 'Attach a ticket or mark leave before exporting.')
  })

  it('is enabled when at least one ticket is attached', () => {
    const entries: AtlasPlanningEntry[] = [{ _id: 'e1', rosterMemberId: 'm1', jiraKey: 'WOSMVP-100', startDate: null, endDate: null }]
    render(<AtlasPlanningExportButton roster={[member('m1', 'Alice')]} entries={entries} leaveMarks={[]} windowDates={WINDOW_DATES} />)
    expect(screen.getByRole('button', { name: 'Export' })).not.toBeDisabled()
  })

  it('is enabled when at least one leave mark exists, even with no attached tickets', () => {
    const leaveMarks: AtlasPlanningLeaveMark[] = [{ _id: 'l1', rosterMemberId: 'm1', date: '2026-08-22', portion: 'full' }]
    render(<AtlasPlanningExportButton roster={[member('m1', 'Alice')]} entries={[]} leaveMarks={leaveMarks} windowDates={WINDOW_DATES} />)
    expect(screen.getByRole('button', { name: 'Export' })).not.toBeDisabled()
  })

  it('calls the export function with the current roster/entries/leave/window data when clicked', () => {
    const spy = vi.spyOn(atlasPlanningExport, 'downloadAtlasPlanningExcel').mockResolvedValue(undefined)
    const roster = [member('m1', 'Alice')]
    const entries: AtlasPlanningEntry[] = [{ _id: 'e1', rosterMemberId: 'm1', jiraKey: 'WOSMVP-100', startDate: null, endDate: null }]
    const leaveMarks: AtlasPlanningLeaveMark[] = []
    render(<AtlasPlanningExportButton roster={roster} entries={entries} leaveMarks={leaveMarks} windowDates={WINDOW_DATES} />)

    fireEvent.click(screen.getByRole('button', { name: 'Export' }))

    expect(spy).toHaveBeenCalledWith(roster, entries, leaveMarks, WINDOW_DATES)
    spy.mockRestore()
  })

  it('does not call the export function while disabled', () => {
    const spy = vi.spyOn(atlasPlanningExport, 'downloadAtlasPlanningExcel').mockResolvedValue(undefined)
    render(<AtlasPlanningExportButton roster={[]} entries={[]} leaveMarks={[]} windowDates={WINDOW_DATES} />)

    fireEvent.click(screen.getByRole('button', { name: 'Export' }))

    expect(spy).not.toHaveBeenCalled()
    spy.mockRestore()
  })
})
