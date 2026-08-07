import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { TodoTagSearch } from './TodoTagSearch'

describe('TodoTagSearch', () => {
  it('reports free-text changes as the user types', () => {
    const onSearchQueryChange = vi.fn()
    render(
      <TodoTagSearch
        searchQuery=""
        onSearchQueryChange={onSearchQueryChange}
        availableTags={[]}
        selectedTags={[]}
        onToggleTag={vi.fn()}
        onClearTags={vi.fn()}
      />,
    )

    fireEvent.change(screen.getByLabelText('Search todos or filter by tag'), { target: { value: 'milk' } })

    expect(onSearchQueryChange).toHaveBeenCalledWith('milk')
  })

  it('suggests a matching tag while typing, but not one already selected', () => {
    render(
      <TodoTagSearch
        searchQuery="urg"
        onSearchQueryChange={vi.fn()}
        availableTags={['urgent', 'work']}
        selectedTags={['work']}
        onToggleTag={vi.fn()}
        onClearTags={vi.fn()}
      />,
    )

    expect(screen.getByRole('option', { name: /urgent/ })).toBeInTheDocument()
    expect(screen.queryByRole('option', { name: /work/ })).not.toBeInTheDocument()
  })

  it('graduates the typed text into a tag chip on Enter when it matches a suggestion', () => {
    const onToggleTag = vi.fn()
    const onSearchQueryChange = vi.fn()
    render(
      <TodoTagSearch
        searchQuery="urg"
        onSearchQueryChange={onSearchQueryChange}
        availableTags={['urgent']}
        selectedTags={[]}
        onToggleTag={onToggleTag}
        onClearTags={vi.fn()}
      />,
    )

    fireEvent.keyDown(screen.getByLabelText('Search todos or filter by tag'), { key: 'Enter' })

    expect(onToggleTag).toHaveBeenCalledWith('urgent')
    expect(onSearchQueryChange).toHaveBeenCalledWith('')
  })

  it('graduates a suggestion into a tag chip when clicked', () => {
    const onToggleTag = vi.fn()
    render(
      <TodoTagSearch
        searchQuery="urg"
        onSearchQueryChange={vi.fn()}
        availableTags={['urgent']}
        selectedTags={[]}
        onToggleTag={onToggleTag}
        onClearTags={vi.fn()}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: /urgent/ }))

    expect(onToggleTag).toHaveBeenCalledWith('urgent')
  })

  it('removes the last selected tag on Backspace when the input is empty', () => {
    const onToggleTag = vi.fn()
    render(
      <TodoTagSearch
        searchQuery=""
        onSearchQueryChange={vi.fn()}
        availableTags={[]}
        selectedTags={['work', 'urgent']}
        onToggleTag={onToggleTag}
        onClearTags={vi.fn()}
      />,
    )

    fireEvent.keyDown(screen.getByLabelText('Search todos or filter by tag'), { key: 'Backspace' })

    expect(onToggleTag).toHaveBeenCalledWith('urgent')
  })

  it('removes a selected tag via its own remove button', () => {
    const onToggleTag = vi.fn()
    render(
      <TodoTagSearch
        searchQuery=""
        onSearchQueryChange={vi.fn()}
        availableTags={[]}
        selectedTags={['work']}
        onToggleTag={onToggleTag}
        onClearTags={vi.fn()}
      />,
    )

    fireEvent.click(screen.getByLabelText('Remove tag filter work'))

    expect(onToggleTag).toHaveBeenCalledWith('work')
  })

  it('clears every selected tag via the Clear button', () => {
    const onClearTags = vi.fn()
    render(
      <TodoTagSearch
        searchQuery=""
        onSearchQueryChange={vi.fn()}
        availableTags={[]}
        selectedTags={['work', 'urgent']}
        onToggleTag={vi.fn()}
        onClearTags={onClearTags}
      />,
    )

    fireEvent.click(screen.getByText('Clear'))

    expect(onClearTags).toHaveBeenCalled()
  })
})
