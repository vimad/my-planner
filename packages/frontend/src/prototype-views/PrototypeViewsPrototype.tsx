// PROTOTYPE — "View Modes" wayfinder ticket. Switchable via ?variant=A|B|C|D. Wipe me.
import { useEffect, useState } from 'react'
import { VariantCategoryBoard, name as nameA } from './VariantCategoryBoard'
import { VariantPriorityGroups, name as nameB } from './VariantPriorityGroups'
import { VariantDateAgenda, name as nameC } from './VariantDateAgenda'
import { VariantFlatFiltered, name as nameD } from './VariantFlatFiltered'
import { PrototypeSwitcher } from './PrototypeSwitcher'
import './prototype-views.css'

const VARIANTS = [
  { key: 'A', name: nameA, Component: VariantCategoryBoard },
  { key: 'B', name: nameB, Component: VariantPriorityGroups },
  { key: 'C', name: nameC, Component: VariantDateAgenda },
  { key: 'D', name: nameD, Component: VariantFlatFiltered },
]

function readVariantFromUrl(): string {
  const key = new URLSearchParams(window.location.search).get('variant')
  return key && VARIANTS.some((v) => v.key === key) ? key : 'A'
}

export function PrototypeViewsPrototype() {
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
    <div className="pv-root">
      <div className="pv-banner">
        PROTOTYPE — View Modes ticket (.scratch/planner-app/issues/02-view-modes.md). Not real data, not for production.
      </div>
      <h1 className="pv-title">My Planner — dashboard view prototype</h1>
      <Current />
      {!import.meta.env.PROD && (
        <PrototypeSwitcher variants={VARIANTS} current={variant} onChange={setVariantAndUrl} />
      )}
    </div>
  )
}
