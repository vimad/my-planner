// PROTOTYPE — shared strip so every variant still shows the locked "remaining/completed per category" requirement.
import { categories, categoryCounts } from './mockData'

export function CategorySummaryStrip() {
  return (
    <div className="pv-summary-strip">
      {categories.map((c) => {
        const { remaining, completed } = categoryCounts(c.id)
        return (
          <div className="pv-summary-chip" key={c.id}>
            <span className="pv-dot" style={{ background: c.color }} />
            <strong>{c.name}</strong>
            <span>{remaining} remaining · {completed} done</span>
          </div>
        )
      })}
    </div>
  )
}
