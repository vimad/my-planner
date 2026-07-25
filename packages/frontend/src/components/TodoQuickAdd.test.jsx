import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { TodoQuickAdd } from './TodoQuickAdd'

describe('TodoQuickAdd', () => {
  it('submits the trimmed title and clears the input on success', async () => {
    const onAdd = vi.fn().mockResolvedValue()
    render(<TodoQuickAdd onAdd={onAdd} />)

    fireEvent.change(screen.getByLabelText('New todo title'), {
      target: { value: '  Buy milk  ' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Add' }))

    expect(onAdd).toHaveBeenCalledWith('Buy milk')
    await waitFor(() => {
      expect(screen.getByLabelText('New todo title')).toHaveValue('')
    })
  })

  it('submits on Enter within the form', async () => {
    const onAdd = vi.fn().mockResolvedValue()
    render(<TodoQuickAdd onAdd={onAdd} />)

    const input = screen.getByLabelText('New todo title')
    fireEvent.change(input, { target: { value: 'Ship it' } })
    fireEvent.submit(input.closest('form'))

    expect(onAdd).toHaveBeenCalledWith('Ship it')
  })

  it('does not submit a blank title', () => {
    const onAdd = vi.fn()
    render(<TodoQuickAdd onAdd={onAdd} />)

    fireEvent.click(screen.getByRole('button', { name: 'Add' }))

    expect(onAdd).not.toHaveBeenCalled()
  })
})
