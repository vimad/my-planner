// PROTOTYPE — variant A: Kanban-style board, one column per category.
import { categories, todos, categoryCounts, isDueToday, priorityColor } from './mockData'

export const name = 'Category Board'

export function VariantCategoryBoard() {
  return (
    <div className="pv-board">
      {categories.map((c) => {
        const inCategory = todos.filter((t) => t.categoryId === c.id && !t.completed)
        const { remaining, completed } = categoryCounts(c.id)
        return (
          <div className="pv-column" key={c.id}>
            <div className="pv-column-header" style={{ borderTop: `4px solid ${c.color}` }}>
              <div className="pv-column-title">
                <span className="pv-dot" style={{ background: c.color }} />
                {c.name}
              </div>
              <div className="pv-column-counts">{remaining} remaining · {completed} completed</div>
            </div>
            <div className="pv-column-body">
              {inCategory.map((t) => (
                <div className={`pv-card ${isDueToday(t.dueDate) ? 'pv-due-today' : ''}`} key={t.id}>
                  <div className="pv-card-title">{t.title}</div>
                  <div className="pv-card-meta">
                    <span className="pv-chip" style={{ background: priorityColor[t.priority] + '22', color: priorityColor[t.priority] }}>
                      {t.priority}
                    </span>
                    {t.dueDate && <span className="pv-tag">{t.dueDate}</span>}
                    {t.tags.map((tag) => (
                      <span className="pv-tag" key={tag}>#{tag}</span>
                    ))}
                  </div>
                </div>
              ))}
              {inCategory.length === 0 && <p style={{ fontSize: '0.78rem', color: '#999' }}>Nothing here.</p>}
            </div>
            <div className="pv-quick-add">+ Quick add a todo…</div>
          </div>
        )
      })}
    </div>
  )
}
