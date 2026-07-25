// PROTOTYPE — variant C: date/agenda list with a small calendar widget on the side.
import { todos, categoryById, priorityColor, TODAY_ISO } from './mockData'
import { CategorySummaryStrip } from './CategorySummaryStrip'

export const name = 'Date Agenda'

const dueDates = new Set(todos.filter((t) => t.dueDate).map((t) => t.dueDate))

function MiniCalendar() {
  const today = new Date()
  const year = today.getFullYear()
  const month = today.getMonth()
  const firstDay = new Date(year, month, 1)
  const startOffset = firstDay.getDay()
  const daysInMonth = new Date(year, month + 1, 0).getDate()
  const cells = [...Array(startOffset).fill(null), ...Array.from({ length: daysInMonth }, (_, i) => i + 1)]

  return (
    <div className="pv-mini-calendar">
      <strong>{today.toLocaleString('default', { month: 'long', year: 'numeric' })}</strong>
      <div className="pv-mini-calendar-grid">
        {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((d, i) => (
          <div key={i} style={{ fontSize: '0.65rem', color: '#999', textAlign: 'center' }}>{d}</div>
        ))}
        {cells.map((day, i) => {
          if (!day) return <div key={i} />
          const iso = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
          const isToday = iso === TODAY_ISO
          return (
            <div
              key={i}
              className={`pv-mini-calendar-cell ${dueDates.has(iso) ? 'pv-has-due' : ''} ${isToday ? 'pv-today' : ''}`}
            >
              {day}
            </div>
          )
        })}
      </div>
    </div>
  )
}

function groupLabel(dueDate) {
  if (!dueDate) return 'No date'
  if (dueDate === TODAY_ISO) return 'Today'
  const diff = Math.round((new Date(dueDate) - new Date(TODAY_ISO)) / 86400000)
  if (diff === 1) return 'Tomorrow'
  if (diff > 1 && diff <= 7) return 'This week'
  if (diff < 0) return 'Overdue'
  return 'Later'
}

export function VariantDateAgenda() {
  const open = todos.filter((t) => !t.completed)
  const order = ['Overdue', 'Today', 'Tomorrow', 'This week', 'Later', 'No date']
  const groups = order
    .map((label) => ({ label, items: open.filter((t) => groupLabel(t.dueDate) === label) }))
    .filter((g) => g.items.length > 0)

  return (
    <div>
      <CategorySummaryStrip />
      <div className="pv-agenda-layout">
        <MiniCalendar />
        <div className="pv-agenda-main">
          {groups.map((g) => (
            <div className={`pv-agenda-group ${g.label === 'Today' ? 'pv-today-group' : ''}`} key={g.label}>
              <div className="pv-agenda-group-title">{g.label}</div>
              {g.items.map((t) => {
                const cat = categoryById[t.categoryId]
                return (
                  <div className="pv-agenda-item" key={t.id}>
                    <span className="pv-dot" style={{ background: cat.color }} />
                    <span className="pv-agenda-item-title">{t.title}</span>
                    <span className="pv-chip" style={{ background: priorityColor[t.priority] + '22', color: priorityColor[t.priority] }}>
                      {t.priority}
                    </span>
                    {t.tags.map((tag) => (
                      <span className="pv-tag" key={tag}>#{tag}</span>
                    ))}
                  </div>
                )
              })}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
