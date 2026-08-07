// PROTOTYPE — floating variant switcher. Not for production.
import type { ComponentType } from 'react'

export interface SwitcherVariant {
  key: string
  name: string
  Component: ComponentType
}

interface PrototypeSwitcherProps {
  variants: SwitcherVariant[]
  current: string
  onChange: (key: string) => void
}

export function PrototypeSwitcher({ variants, current, onChange }: PrototypeSwitcherProps) {
  const index = variants.findIndex((v) => v.key === current)
  const go = (delta: number) => {
    const next = (index + delta + variants.length) % variants.length
    onChange(variants[next].key)
  }
  const label = variants[index]

  return (
    <div className="pv-switcher">
      <button onClick={() => go(-1)} aria-label="Previous variant">←</button>
      <span>{label.key} — {label.name}</span>
      <button onClick={() => go(1)} aria-label="Next variant">→</button>
    </div>
  )
}
