import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { Avatar } from './Avatar'

describe('Avatar', () => {
  it('renders two initials from a two-word name', () => {
    render(<Avatar name="Vinod Madubashan" />)
    expect(screen.getByText('VM')).toBeInTheDocument()
  })

  it('renders the first two characters of a one-word name', () => {
    render(<Avatar name="Cher" />)
    expect(screen.getByText('CH')).toBeInTheDocument()
  })

  it('renders "UN" for a null name', () => {
    render(<Avatar name={null} />)
    expect(screen.getByText('UN')).toBeInTheDocument()
  })

  it('always renders the neutral slate treatment for a null name, never a palette color', () => {
    render(<Avatar name={null} />)
    expect(screen.getByText('UN')).toHaveStyle({ backgroundColor: '#64748b' })
  })

  it('assigns the same color to the same name deterministically', () => {
    const { unmount } = render(<Avatar name="Jane Doe" />)
    const firstColor = screen.getByText('JD').style.backgroundColor
    unmount()

    render(<Avatar name="Jane Doe" />)
    const secondColor = screen.getByText('JD').style.backgroundColor

    expect(firstColor).toBe(secondColor)
    expect(firstColor).not.toBe('')
  })

  it("gives an assigned name a palette color, distinct from the unassigned neutral", () => {
    render(<Avatar name="Jane Doe" />)
    const color = screen.getByText('JD').style.backgroundColor
    // '#64748b' == rgb(100, 116, 139), how jsdom normalizes an inline hex
    // style value read back via .style - the neutral-only color, per the
    // spec's "never a palette color" rule for a real name.
    expect(color).not.toBe('rgb(100, 116, 139)')
  })
})
