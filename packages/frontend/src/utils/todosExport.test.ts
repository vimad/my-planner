import { describe, expect, it } from 'vitest'
import { buildTodosExportSheets } from './todosExport'
import type { Todo } from '../types'

function todo(overrides: Partial<Todo> & { title: string }): Todo {
  return {
    _id: overrides.title,
    completed: false,
    body: null,
    ...overrides,
  }
}

describe('buildTodosExportSheets', () => {
  it('includes the Description/Notes header row in both tabs', () => {
    const sheets = buildTodosExportSheets([])
    expect(sheets.inProgress[0]).toEqual(['Description', 'Notes'])
    expect(sheets.completed[0]).toEqual(['Description', 'Notes'])
  })

  it('routes a completed todo to the completed sheet and a not-completed todo to the in-progress sheet', () => {
    const todos = [
      todo({ title: 'Finish report', completed: true }),
      todo({ title: 'Write spec', completed: false }),
    ]
    const sheets = buildTodosExportSheets(todos)
    expect(sheets.completed.slice(1)).toEqual([['Finish report', '']])
    expect(sheets.inProgress.slice(1)).toEqual([['Write spec', '']])
  })

  it('formats a dated notes body into the Notes column via formatNotesForExport', () => {
    const body = {
      type: 'doc',
      content: [
        { type: 'paragraph', content: [{ type: 'dateBadge', attrs: { date: '2026-08-15' } }] },
        { type: 'paragraph', content: [{ type: 'text', text: 'did the thing' }] },
      ],
    }
    const sheets = buildTodosExportSheets([todo({ title: 'Ship feature', body })])
    expect(sheets.inProgress[1]).toEqual(['Ship feature', 'Aug 15, 2026: did the thing'])
  })

  it('leaves the Notes cell empty for a todo with no notes body', () => {
    const sheets = buildTodosExportSheets([todo({ title: 'Bare todo' })])
    expect(sheets.inProgress[1]).toEqual(['Bare todo', ''])
  })
})
