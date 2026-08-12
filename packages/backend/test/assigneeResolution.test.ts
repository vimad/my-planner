import { describe, expect, it } from 'vitest'
import type { Types } from 'mongoose'
import { resolveAssignee } from '../src/services/assigneeResolution.ts'

function id(raw: string): Types.ObjectId {
  return raw as unknown as Types.ObjectId
}

describe('resolveAssignee', () => {
  it('resolves to the Override personId, full stop, even when the raw assigneeAccountId maps to someone else', () => {
    const ticket = { _id: id('tk-1'), assigneeAccountId: 'acct-ada' }
    const overrideByTicketId = new Map([['tk-1', id('person-bob')]])
    const personIdByAccountId = new Map([['acct-ada', id('person-ada')]])

    expect(resolveAssignee(ticket, overrideByTicketId, personIdByAccountId)).toEqual(id('person-bob'))
  })

  it('falls back to the raw assigneeAccountId mapped to a current TeamMembership when no Override is set', () => {
    const ticket = { _id: id('tk-1'), assigneeAccountId: 'acct-ada' }
    const overrideByTicketId = new Map<string, Types.ObjectId | null>()
    const personIdByAccountId = new Map([['acct-ada', id('person-ada')]])

    expect(resolveAssignee(ticket, overrideByTicketId, personIdByAccountId)).toEqual(id('person-ada'))
  })

  it('resolves to null when there is no Override and no assigneeAccountId at all', () => {
    const ticket = { _id: id('tk-1'), assigneeAccountId: null }
    expect(resolveAssignee(ticket, new Map(), new Map())).toBeNull()
  })

  it('resolves to null when there is no Override and the assigneeAccountId matches no current TeamMembership', () => {
    const ticket = { _id: id('tk-1'), assigneeAccountId: 'acct-x' }
    expect(resolveAssignee(ticket, new Map(), new Map())).toBeNull()
  })

  it('treats an Override explicitly cleared to null the same as no Override at all', () => {
    const ticket = { _id: id('tk-1'), assigneeAccountId: 'acct-ada' }
    const overrideByTicketId = new Map<string, Types.ObjectId | null>([['tk-1', null]])
    const personIdByAccountId = new Map([['acct-ada', id('person-ada')]])

    expect(resolveAssignee(ticket, overrideByTicketId, personIdByAccountId)).toEqual(id('person-ada'))
  })
})
