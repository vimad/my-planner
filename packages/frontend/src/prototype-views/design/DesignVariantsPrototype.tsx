// PROTOTYPE — "Visual Design & Styling Approach" wayfinder ticket. Switchable via ?design=A|B|C. Wipe me.
import { useEffect, useState } from 'react'
import { DesignVariantVivid, name as nameA } from './DesignVariantVivid'
import { DesignVariantPastel, name as nameB } from './DesignVariantPastel'
import { DesignVariantDark, name as nameC } from './DesignVariantDark'
import { PrototypeSwitcher } from '../PrototypeSwitcher'
import '../prototype-views.css'

const VARIANTS = [
  { key: 'A', name: nameA, Component: DesignVariantVivid },
  { key: 'B', name: nameB, Component: DesignVariantPastel },
  { key: 'C', name: nameC, Component: DesignVariantDark },
]

function readVariantFromUrl(): string {
  const key = new URLSearchParams(window.location.search).get('design')
  return key && VARIANTS.some((v) => v.key === key) ? key : 'A'
}

export function DesignVariantsPrototype() {
  const [variant, setVariant] = useState(readVariantFromUrl)

  const setVariantAndUrl = (key: string) => {
    setVariant(key)
    const params = new URLSearchParams(window.location.search)
    params.set('design', key)
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
      <Current />
      {!import.meta.env.PROD && (
        <PrototypeSwitcher variants={VARIANTS} current={variant} onChange={setVariantAndUrl} />
      )}
    </>
  )
}
