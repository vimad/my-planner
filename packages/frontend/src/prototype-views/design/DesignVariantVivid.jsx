// PROTOTYPE — visual variant A: "Vivid Blocks" — bold saturated gradient + maximalist color.
import { priorityColor } from '../mockData'
import { useAgendaGroups, useCategorySummary, useMiniCalendar } from './useAgendaData'
import './vivid.css'

export const name = 'Vivid Blocks'

export function DesignVariantVivid() {
  const groups = useAgendaGroups()
  const summary = useCategorySummary()
  const calendar = useMiniCalendar()

  return (
    <div className="dvV-root">
      <div className="dvV-hero">
        <h1>My Planner</h1>
        <p>Today's the 25th. Let's get through it.</p>
      </div>
      <div className="dvV-summary-strip">
        {summary.map((c) => (
          <div className="dvV-summary-chip" key={c.id}>
            <span className="dvV-dot" style={{ background: c.color }} />
            {c.name} · {c.remaining} left
          </div>
        ))}
      </div>
      <div className="dvV-body">
        <div className="dvV-calendar">
          <div className="dvV-calendar-title">{calendar.label}</div>
          <div className="dvV-calendar-grid">
            {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((d, i) => (
              <div key={i} style={{ fontSize: '0.65rem', textAlign: 'center', color: '#999' }}>{d}</div>
            ))}
            {calendar.cells.map((cell, i) => (
              <div key={i} className={`dvV-calendar-cell ${cell?.hasDue ? 'has-due' : ''} ${cell?.isToday ? 'today' : ''}`}>
                {cell?.day ?? ''}
              </div>
            ))}
          </div>
        </div>
        <div className="dvV-main">
          {groups.map((g) => (
            <div className="dvV-group" key={g.label}>
              <div className="dvV-group-title">{g.label}</div>
              {g.items.map((t) => (
                <div className={`dvV-item ${g.label === 'Today' ? 'today' : ''}`} key={t.id} style={{ background: t.category.color + '1a' }}>
                  <span className="dvV-dot" style={{ background: t.category.color }} />
                  <span className="dvV-item-title">{t.title}</span>
                  <span className="dvV-badge" style={{ background: priorityColor[t.priority] }}>{t.priority}</span>
                  {t.tags.map((tag) => (
                    <span className="dvV-tag" key={tag}>#{tag}</span>
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
