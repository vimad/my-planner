// PROTOTYPE — variant B: grouped by priority, cutting across categories.
import { todos, categoryById, isDueToday, priorityColor, type Priority } from './mockData'
import { CategorySummaryStrip } from './CategorySummaryStrip'

export const name = 'Priority Groups'

const tiers: Priority[] = ['High', 'Medium', 'Low']

export function VariantPriorityGroups() {
  return (
    <div>
      <CategorySummaryStrip />
      {tiers.map((tier) => {
        const inTier = todos.filter((t) => t.priority === tier && !t.completed)
        return (
          <div className="pv-priority-section" key={tier}>
            <div className="pv-priority-header" style={{ background: priorityColor[tier] }}>
              <span>{tier} priority</span>
              <span>{inTier.length} remaining</span>
            </div>
            {inTier.map((t) => {
              const cat = categoryById[t.categoryId]
              return (
                <div className={`pv-priority-row ${isDueToday(t.dueDate) ? 'pv-due-today' : ''}`} key={t.id}>
                  <span className="pv-dot" style={{ background: cat.color }} />
                  <span className="pv-priority-row-title">{t.title}</span>
                  <span className="pv-tag">{cat.name}</span>
                  {t.dueDate && <span className="pv-tag">{t.dueDate}</span>}
                  {t.tags.map((tag) => (
                    <span className="pv-tag" key={tag}>#{tag}</span>
                  ))}
                </div>
              )
            })}
            {inTier.length === 0 && (
              <div className="pv-priority-row">
                <span style={{ fontSize: '0.78rem', color: '#999' }}>Nothing here.</span>
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
