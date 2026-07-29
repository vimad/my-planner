import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { Category } from '../types'
import { ScratchNoteCard } from './ScratchNoteCard'

const categories: Category[] = [
  { _id: 'uncategorized-id', name: 'Uncategorized', color: '#94a3b8' },
  { _id: 'work-id', name: 'Work', color: '#f472b6' },
]

const lineContent = {
  type: 'doc',
  content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Call the dentist' }] }],
}

const note = {
  _id: 'note-1',
  createdAt: '2026-07-25T10:00:00.000Z',
  body: [
    { id: 'line-1', content: lineContent, promotedTodoId: null },
    { id: 'line-2', content: { type: 'doc', content: [] }, promotedTodoId: 'todo-9' },
  ],
}

describe('ScratchNoteCard', () => {
  it('renders each line read-only, marking promoted lines with a linked indicator', () => {
    render(
      <ScratchNoteCard
        note={note}
        categories={categories}
        onUpdateLines={vi.fn()}
        onPromote={vi.fn()}
        onArchive={vi.fn()}
        onDelete={vi.fn()}
      />,
    )

    expect(screen.getByText('Call the dentist')).toBeInTheDocument()
    expect(screen.getByText('✓ linked to todo')).toBeInTheDocument()
    // Only the not-yet-promoted line gets a promote checkbox.
    expect(screen.getByLabelText('Promote line-1')).toBeInTheDocument()
    expect(screen.queryByLabelText('Promote line-2')).not.toBeInTheDocument()
  })

  it('calls onArchive and onDelete', () => {
    const onArchive = vi.fn()
    const onDelete = vi.fn()
    render(
      <ScratchNoteCard
        note={note}
        categories={categories}
        onUpdateLines={vi.fn()}
        onPromote={vi.fn()}
        onArchive={onArchive}
        onDelete={onDelete}
      />,
    )

    fireEvent.click(screen.getByLabelText('Archive note'))
    fireEvent.click(screen.getByLabelText('Delete note'))

    expect(onArchive).toHaveBeenCalled()
    expect(onDelete).toHaveBeenCalled()
  })

  it('appends a new empty line and puts it into edit mode', () => {
    const onUpdateLines = vi.fn()
    render(
      <ScratchNoteCard
        note={note}
        categories={categories}
        onUpdateLines={onUpdateLines}
        onPromote={vi.fn()}
        onArchive={vi.fn()}
        onDelete={vi.fn()}
      />,
    )

    fireEvent.click(screen.getByText('+ Add line'))

    expect(onUpdateLines).toHaveBeenCalledTimes(1)
    const newLines = onUpdateLines.mock.calls[0][0]
    expect(newLines).toHaveLength(3)
    expect(newLines[2]).toMatchObject({ content: null, promotedTodoId: null })
    expect(newLines[2].id).toEqual(expect.any(String))
  })

  it('selects a line and promotes it with the chosen category, priority, and due date', async () => {
    const onPromote = vi.fn().mockResolvedValue(undefined)
    render(
      <ScratchNoteCard
        note={note}
        categories={categories}
        onUpdateLines={vi.fn()}
        onPromote={onPromote}
        onArchive={vi.fn()}
        onDelete={vi.fn()}
      />,
    )

    fireEvent.click(screen.getByLabelText('Promote line-1'))
    fireEvent.click(screen.getByText('Promote 1 line'))

    fireEvent.change(screen.getByLabelText('Promote category'), { target: { value: 'work-id' } })
    fireEvent.click(screen.getByRole('button', { name: 'High' }))
    fireEvent.change(screen.getByLabelText('Promote due date'), {
      target: { value: '2026-08-01' },
    })

    fireEvent.click(screen.getByRole('button', { name: 'Confirm promote' }))

    expect(onPromote).toHaveBeenCalledWith('line-1', {
      categoryId: 'work-id',
      priority: 'High',
      dueDate: '2026-08-01',
    })
  })

  it('selects all not-yet-promoted lines at once and can clear the selection', () => {
    const manyLinesNote = {
      ...note,
      body: [
        ...note.body,
        { id: 'line-3', content: lineContent, promotedTodoId: null },
      ],
    }
    render(
      <ScratchNoteCard
        note={manyLinesNote}
        categories={categories}
        onUpdateLines={vi.fn()}
        onPromote={vi.fn()}
        onArchive={vi.fn()}
        onDelete={vi.fn()}
      />,
    )

    fireEvent.click(screen.getByText('Select all'))

    expect(screen.getByLabelText('Promote line-1')).toBeChecked()
    expect(screen.getByLabelText('Promote line-3')).toBeChecked()
    expect(screen.getByText('Promote 2 lines')).toBeInTheDocument()

    fireEvent.click(screen.getByText('Clear selection'))

    expect(screen.getByLabelText('Promote line-1')).not.toBeChecked()
    expect(screen.getByLabelText('Promote line-3')).not.toBeChecked()
  })
})
