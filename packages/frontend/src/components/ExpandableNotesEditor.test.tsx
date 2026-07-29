import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { ExpandableNotesEditor } from './ExpandableNotesEditor'

const doc = {
  type: 'doc',
  content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Hello world' }] }],
}

describe('ExpandableNotesEditor', () => {
  it('renders the child editor inline by default, with an enlarge icon visible', () => {
    render(<ExpandableNotesEditor content={doc} editable={false} />)

    expect(screen.getByText('Hello world')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Enlarge notes editor' })).toBeInTheDocument()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('transitions to an enlarged overlay state when the enlarge icon is clicked, with the editor still rendered and interactive', () => {
    render(<ExpandableNotesEditor content={doc} editable />)

    fireEvent.click(screen.getByRole('button', { name: 'Enlarge notes editor' }))

    expect(screen.getByRole('dialog', { name: 'Enlarged notes editor' })).toBeInTheDocument()
    expect(screen.getByText('Hello world')).toBeInTheDocument()
    expect(document.querySelector('[contenteditable]')).toHaveAttribute('contenteditable', 'true')
  })

  it('collapses back to inline via the shrink icon', async () => {
    render(<ExpandableNotesEditor content={doc} editable={false} />)
    fireEvent.click(screen.getByRole('button', { name: 'Enlarge notes editor' }))
    expect(screen.getByRole('dialog')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Shrink notes editor' }))

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(screen.getByRole('button', { name: 'Enlarge notes editor' })).toBeInTheDocument()
  })

  it('collapses back to inline via the Escape key', async () => {
    render(<ExpandableNotesEditor content={doc} editable={false} />)
    fireEvent.click(screen.getByRole('button', { name: 'Enlarge notes editor' }))

    fireEvent.keyDown(window, { key: 'Escape' })

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
  })

  it('collapses back to inline via a backdrop click', async () => {
    render(<ExpandableNotesEditor content={doc} editable={false} />)
    fireEvent.click(screen.getByRole('button', { name: 'Enlarge notes editor' }))

    fireEvent.click(screen.getByRole('button', { name: 'Close enlarged notes editor' }))

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
  })

  it('does not collapse when clicking inside the enlarged panel', () => {
    render(<ExpandableNotesEditor content={doc} editable={false} />)
    fireEvent.click(screen.getByRole('button', { name: 'Enlarge notes editor' }))

    fireEvent.click(screen.getByText('Hello world'))

    expect(screen.getByRole('dialog')).toBeInTheDocument()
  })

  it('preserves the same editor instance (not remounted) and its document across enlarge and collapse', async () => {
    render(<ExpandableNotesEditor content={doc} editable />)
    const before = document.querySelector('[contenteditable]')
    expect(before).not.toBeNull()

    fireEvent.click(screen.getByRole('button', { name: 'Enlarge notes editor' }))

    expect(document.querySelector('[contenteditable]')).toBe(before)
    expect(screen.getByText('Hello world')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Shrink notes editor' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())

    expect(document.querySelector('[contenteditable]')).toBe(before)
    expect(screen.getByText('Hello world')).toBeInTheDocument()
  })

  it('keeps a view-mode (non-editable) editor read-only both inline and enlarged', () => {
    render(<ExpandableNotesEditor content={doc} editable={false} />)
    expect(document.querySelector('[contenteditable]')).toHaveAttribute('contenteditable', 'false')

    fireEvent.click(screen.getByRole('button', { name: 'Enlarge notes editor' }))

    expect(document.querySelector('[contenteditable]')).toHaveAttribute('contenteditable', 'false')
  })
})
