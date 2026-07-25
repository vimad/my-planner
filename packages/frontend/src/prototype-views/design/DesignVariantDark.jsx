// PROTOTYPE — visual variant C: "Vibrant Dark" — dark mode, neon category accents, glassmorphism.
import { priorityColor } from '../mockData'
import { useAgendaGroups, useCategorySummary, useMiniCalendar } from './useAgendaData'
import './dark.css'

export const name = 'Vibrant Dark'

export function DesignVariantDark() {
  const groups = useAgendaGroups()
  const summary = useCategorySummary()
  const calendar = useMiniCalendar()

  return (
    <div className="dvD-root">
      <div className="dvD-header">
        <h1>My Planner</h1>
        <p>Here's what's glowing today.</p>
      </div>
      <div className="dvD-summary-strip">
        {summary.map((c) => (
          <div className="dvD-summary-chip" key={c.id}>
            <span className="dvD-dot" style={{ background: c.color, color: c.color }} />
            {c.name} · {c.remaining} left
          </div>
        ))}
      </div>
      <div className="dvD-body">
        <div className="dvD-calendar">
          <div className="dvD-calendar-title">{calendar.label}</div>
          <div className="dvD-calendar-grid">
            {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((d, i) => (
              <div key={i} style={{ fontSize: '0.62rem', textAlign: 'center', color: '#5f5a80' }}>{d}</div>
            ))}
            {calendar.cells.map((cell, i) => (
              <div key={i} className={`dvD-calendar-cell ${cell?.hasDue ? 'has-due' : ''} ${cell?.isToday ? 'today' : ''}`}>
                {cell?.day ?? ''}
              </div>
            ))}
          </div>
        </div>
        <div className="dvD-main">
          {groups.map((g) => (
            <div className="dvD-group" key={g.label}>
              <div className="dvD-group-title">{g.label}</div>
              {g.items.map((t) => (
                <div className={`dvD-item ${g.label === 'Today' ? 'today' : ''}`} key={t.id}>
                  <span className="dvD-dot" style={{ background: t.category.color, color: t.category.color }} />
                  <span className="dvD-item-title">{t.title}</span>
                  <span className="dvD-badge" style={{ background: priorityColor[t.priority] }}>{t.priority}</span>
                  {t.tags.map((tag) => (
                    <span className="dvD-tag" key={tag}>#{tag}</span>
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
