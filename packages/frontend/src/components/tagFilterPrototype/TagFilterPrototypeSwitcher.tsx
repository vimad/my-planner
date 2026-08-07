// PROTOTYPE — three UI variants for tag-based filtering in the Todos tab,
// switchable via ?variant=A|B|C (or the ← / → arrow keys). Mounted directly
// in App.tsx in place of the plain search input. Wipe this whole folder
// (and revert App.tsx's TagFilterPrototypeSwitcher usage) once one variant
// wins - see the "Capture it when done" step in .claude/skills/prototype.
import { useEffect, useState } from 'react'
import { VariantPopover, name as nameA } from './VariantPopover'
import { VariantTokenized, name as nameB } from './VariantTokenized'
import { VariantCollapsibleStrip, name as nameC } from './VariantCollapsibleStrip'
import { PrototypeSwitcher } from '../../prototype-views/PrototypeSwitcher'
import '../../prototype-views/prototype-views.css'
import type { TagFilterVariantProps } from './types'

const VARIANTS = [
  { key: 'A', name: nameA, Component: VariantPopover },
  { key: 'B', name: nameB, Component: VariantTokenized },
  { key: 'C', name: nameC, Component: VariantCollapsibleStrip },
]

function readVariantFromUrl(): string {
  const key = new URLSearchParams(window.location.search).get('variant')
  return key && VARIANTS.some((v) => v.key === key) ? key : 'A'
}

export function TagFilterPrototypeSwitcher(props: TagFilterVariantProps) {
  const [variant, setVariant] = useState(readVariantFromUrl)

  const setVariantAndUrl = (key: string) => {
    setVariant(key)
    const params = new URLSearchParams(window.location.search)
    params.set('variant', key)
    window.history.replaceState(null, '', `?${params.toString()}`)
  }

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = document.activeElement?.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA' || (document.activeElement as HTMLElement | null)?.isContentEditable) return
      const index = VARIANTS.findIndex((v) => v.key === variant)
      if (e.key === 'ArrowLeft') setVariantAndUrl(VARIANTS[(index - 1 + VARIANTS.length) % VARIANTS.length].key)
      if (e.key === 'ArrowRight') setVariantAndUrl(VARIANTS[(index + 1) % VARIANTS.length].key)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [variant])

  const Current = (VARIANTS.find((v) => v.key === variant) ?? VARIANTS[0]).Component

  return (
    <>
      <Current {...props} />
      {!import.meta.env.PROD && (
        <PrototypeSwitcher variants={VARIANTS} current={variant} onChange={setVariantAndUrl} />
      )}
    </>
  )
}
