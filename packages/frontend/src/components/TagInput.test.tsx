import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { TagInput } from './TagInput'

describe('TagInput', () => {
  it('adds a tag on Enter and clears the input', () => {
    const onChange = vi.fn()
    render(<TagInput tags={[]} onChange={onChange} />)

    const input = screen.getByLabelText('Add tag')
    fireEvent.change(input, { target: { value: 'urgent' } })
    fireEvent.keyDown(input, { key: 'Enter' })

    expect(onChange).toHaveBeenCalledWith(['urgent'])
  })

  it('adds a tag on comma', () => {
    const onChange = vi.fn()
    render(<TagInput tags={['home']} onChange={onChange} />)

    const input = screen.getByLabelText('Add tag')
    fireEvent.change(input, { target: { value: 'errand' } })
    fireEvent.keyDown(input, { key: ',' })

    expect(onChange).toHaveBeenCalledWith(['home', 'errand'])
  })

  it('does not add a duplicate tag', () => {
    const onChange = vi.fn()
    render(<TagInput tags={['home']} onChange={onChange} />)

    const input = screen.getByLabelText('Add tag')
    fireEvent.change(input, { target: { value: 'home' } })
    fireEvent.keyDown(input, { key: 'Enter' })

    expect(onChange).not.toHaveBeenCalled()
  })

  it('removes the last tag on Backspace when the input is empty', () => {
    const onChange = vi.fn()
    render(<TagInput tags={['home', 'urgent']} onChange={onChange} />)

    fireEvent.keyDown(screen.getByLabelText('Add tag'), { key: 'Backspace' })

    expect(onChange).toHaveBeenCalledWith(['home'])
  })

  it('removes a tag via its remove button', () => {
    const onChange = vi.fn()
    render(<TagInput tags={['home', 'urgent']} onChange={onChange} />)

    fireEvent.click(screen.getByLabelText('Remove tag home'))

    expect(onChange).toHaveBeenCalledWith(['urgent'])
  })

  it('offers autocomplete suggestions filtered by what has been typed and already added', () => {
    const onChange = vi.fn()
    render(
      <TagInput tags={['home']} onChange={onChange} suggestions={['home', 'work', 'waiting']} />,
    )

    fireEvent.change(screen.getByLabelText('Add tag'), { target: { value: 'wa' } })

    expect(screen.getByText('waiting')).toBeInTheDocument()
    expect(screen.queryByText('work')).not.toBeInTheDocument()
  })

  it('adds a tag by clicking a suggestion', () => {
    const onChange = vi.fn()
    render(<TagInput tags={[]} onChange={onChange} suggestions={['urgent', 'home']} />)

    fireEvent.change(screen.getByLabelText('Add tag'), { target: { value: 'urg' } })
    fireEvent.click(screen.getByText('urgent'))

    expect(onChange).toHaveBeenCalledWith(['urgent'])
  })
})
