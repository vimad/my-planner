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
  it('returns empty row lists for both tabs when there are no todos', () => {
    const sheets = buildTodosExportSheets([])
    expect(sheets.inProgress).toEqual([])
    expect(sheets.completed).toEqual([])
  })

  it('routes a completed todo to the completed sheet and a not-completed todo to the in-progress sheet', () => {
    const todos = [
      todo({ title: 'Finish report', completed: true }),
      todo({ title: 'Write spec', completed: false }),
    ]
    const sheets = buildTodosExportSheets(todos)
    expect(sheets.completed).toEqual([{ description: 'Finish report', notes: '' }])
    expect(sheets.inProgress).toEqual([{ description: 'Write spec', notes: '' }])
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
    expect(sheets.inProgress).toEqual([{ description: 'Ship feature', notes: 'Aug 15, 2026: did the thing' }])
  })

  it('leaves the Notes cell empty for a todo with no notes body', () => {
    const sheets = buildTodosExportSheets([todo({ title: 'Bare todo' })])
    expect(sheets.inProgress).toEqual([{ description: 'Bare todo', notes: '' }])
  })
})
