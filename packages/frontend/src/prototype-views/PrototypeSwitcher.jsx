// PROTOTYPE — floating variant switcher. Not for production.
export function PrototypeSwitcher({ variants, current, onChange }) {
  const index = variants.findIndex((v) => v.key === current)
  const go = (delta) => {
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
