import { describe, expect, it } from 'vitest'
import { linkify } from './linkify'

describe('linkify', () => {
  it('returns a single plain-text segment when there is no URL', () => {
    expect(linkify('Buy milk')).toEqual([{ text: 'Buy milk' }])
  })

  it('detects a bare URL as its own segment', () => {
    expect(linkify('https://example.com')).toEqual([
      { text: 'https://example.com', href: 'https://example.com' },
    ])
  })

  it('splits surrounding text from an embedded URL', () => {
    expect(linkify('see https://example.com for details')).toEqual([
      { text: 'see ' },
      { text: 'https://example.com', href: 'https://example.com' },
      { text: ' for details' },
    ])
  })

  it('strips trailing sentence punctuation from the URL', () => {
    expect(linkify('check https://example.com/path.')).toEqual([
      { text: 'check ' },
      { text: 'https://example.com/path', href: 'https://example.com/path' },
      { text: '.' },
    ])
  })

  it('strips a wrapping closing paren from the URL', () => {
    expect(linkify('(https://example.com)')).toEqual([
      { text: '(' },
      { text: 'https://example.com', href: 'https://example.com' },
      { text: ')' },
    ])
  })

  it('handles multiple URLs in one string', () => {
    expect(linkify('https://a.com and https://b.com')).toEqual([
      { text: 'https://a.com', href: 'https://a.com' },
      { text: ' and ' },
      { text: 'https://b.com', href: 'https://b.com' },
    ])
  })

  it('handles empty/nullish input', () => {
    expect(linkify('')).toEqual([{ text: '' }])
    expect(linkify(undefined)).toEqual([{ text: '' }])
  })
})
