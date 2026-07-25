// PROTOTYPE — visual variant B: "Soft Pastel" — airy cards, serif/sans pairing, muted tints.
import { useAgendaGroups, useCategorySummary, useMiniCalendar } from './useAgendaData'
import './pastel.css'

export const name = 'Soft Pastel'

export function DesignVariantPastel() {
  const groups = useAgendaGroups()
  const summary = useCategorySummary()
  const calendar = useMiniCalendar()

  return (
    <div className="dvP-root">
      <div className="dvP-header">
        <h1>My Planner</h1>
        <p>A calm look at what's ahead.</p>
      </div>
      <div className="dvP-summary-strip">
        {summary.map((c) => (
          <div className="dvP-summary-chip" key={c.id} style={{ background: c.color + '14' }}>
            <span className="dvP-dot" style={{ background: c.color }} />
            {c.name} · {c.remaining} left
          </div>
        ))}
      </div>
      <div className="dvP-body">
        <div className="dvP-calendar">
          <div className="dvP-calendar-title">{calendar.label}</div>
          <div className="dvP-calendar-grid">
            {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((d, i) => (
              <div key={i} style={{ fontSize: '0.62rem', textAlign: 'center', color: '#bbb' }}>{d}</div>
            ))}
            {calendar.cells.map((cell, i) => (
              <div key={i} className={`dvP-calendar-cell ${cell?.hasDue ? 'has-due' : ''} ${cell?.isToday ? 'today' : ''}`}>
                {cell?.day ?? ''}
              </div>
            ))}
          </div>
        </div>
        <div className="dvP-main">
          {groups.map((g) => (
            <div className="dvP-group" key={g.label}>
              <div className="dvP-group-title">{g.label}</div>
              {g.items.map((t) => (
                <div className={`dvP-item ${g.label === 'Today' ? 'today' : ''}`} key={t.id} style={{ background: t.category.color + '0c' }}>
                  <span className="dvP-dot" style={{ background: t.category.color }} />
                  <span className="dvP-item-title">{t.title}</span>
                  <span className="dvP-badge">{t.priority}</span>
                  {t.tags.map((tag) => (
                    <span className="dvP-tag" key={tag}>#{tag}</span>
                  ))}
                </div>
              ))}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
