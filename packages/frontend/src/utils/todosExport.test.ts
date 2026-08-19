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

  it('sorts each tab by priority, High first then Medium then Low', () => {
    const todos = [
      todo({ title: 'Low task', priority: 'Low' }),
      todo({ title: 'High task', priority: 'High' }),
      todo({ title: 'Medium task', priority: 'Medium' }),
    ]
    const sheets = buildTodosExportSheets(todos)
    expect(sheets.inProgress.map((row) => row.description)).toEqual(['High task', 'Medium task', 'Low task'])
  })

  it('treats an unset priority as Medium for sorting, and keeps same-priority todos in their original relative order', () => {
    const todos = [
      todo({ title: 'No priority set' }),
      todo({ title: 'High one', priority: 'High' }),
      todo({ title: 'High two', priority: 'High' }),
      todo({ title: 'Low one', priority: 'Low' }),
    ]
    const sheets = buildTodosExportSheets(todos)
    expect(sheets.inProgress.map((row) => row.description)).toEqual([
      'High one',
      'High two',
      'No priority set',
      'Low one',
    ])
  })

  it('sorts the completed tab by priority independently of the in-progress tab', () => {
    const todos = [
      todo({ title: 'Done low', completed: true, priority: 'Low' }),
      todo({ title: 'Done high', completed: true, priority: 'High' }),
    ]
    const sheets = buildTodosExportSheets(todos)
    expect(sheets.completed.map((row) => row.description)).toEqual(['Done high', 'Done low'])
  })
})
