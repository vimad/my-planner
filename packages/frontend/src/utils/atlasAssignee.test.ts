import { describe, expect, it } from 'vitest'
import { resolveAssignee } from './atlasAssignee'
import type { Person } from '../types'

function person(overrides: Partial<Person> = {}): Person {
  return { _id: 'p1', name: 'Ada Lovelace', email: 'ada@example.com', jiraAccountId: 'acc-1', ...overrides }
}

describe('resolveAssignee', () => {
  it('resolves a matching accountId to the Person directory name', () => {
    const map = new Map([['acc-1', person()]])
    expect(resolveAssignee('acc-1', map)).toEqual({ key: 'acc-1', label: 'Ada Lovelace', kind: 'named' })
  })

  it('falls back to an Unmapped badge for a real accountId not in the directory', () => {
    const map = new Map<string, Person>()
    expect(resolveAssignee('acc-unknown', map)).toEqual({ key: 'acc-unknown', label: 'Unmapped assignee', kind: 'unmapped' })
  })

  it('treats a null accountId as Unassigned, distinct from Unmapped', () => {
    const map = new Map<string, Person>()
    expect(resolveAssignee(null, map)).toEqual({ key: 'unassigned', label: 'Unassigned', kind: 'unassigned' })
  })
})
