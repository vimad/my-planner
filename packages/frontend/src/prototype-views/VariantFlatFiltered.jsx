// PROTOTYPE — variant D: single flat list with filters, sorted by priority by default.
import { useMemo, useState } from 'react'
import { categories, todos, categoryById, isDueToday, priorityColor, priorityOrder } from './mockData'
import { CategorySummaryStrip } from './CategorySummaryStrip'

export const name = 'Flat List + Filters'

export function VariantFlatFiltered() {
  const [categoryFilter, setCategoryFilter] = useState('all')
  const [priorityFilter, setPriorityFilter] = useState('all')
  const [search, setSearch] = useState('')

  const rows = useMemo(() => {
    return todos
      .filter((t) => !t.completed)
      .filter((t) => categoryFilter === 'all' || t.categoryId === categoryFilter)
      .filter((t) => priorityFilter === 'all' || t.priority === priorityFilter)
      .filter((t) => t.title.toLowerCase().includes(search.toLowerCase()))
      .sort((a, b) => priorityOrder[a.priority] - priorityOrder[b.priority])
  }, [categoryFilter, priorityFilter, search])

  return (
    <div>
      <CategorySummaryStrip />
      <div className="pv-filter-bar">
        <input placeholder="Search todos…" value={search} onChange={(e) => setSearch(e.target.value)} />
        <select value={categoryFilter} onChange={(e) => setCategoryFilter(e.target.value)}>
          <option value="all">All categories</option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </select>
        <select value={priorityFilter} onChange={(e) => setPriorityFilter(e.target.value)}>
          <option value="all">All priorities</option>
          <option value="High">High</option>
          <option value="Medium">Medium</option>
          <option value="Low">Low</option>
        </select>
        <span style={{ fontSize: '0.75rem', color: '#888' }}>sorted by priority</span>
      </div>
      <div className="pv-flat-list">
        {rows.map((t) => {
          const cat = categoryById[t.categoryId]
          return (
            <div className={`pv-flat-row ${isDueToday(t.dueDate) ? 'pv-due-today' : ''}`} key={t.id}>
              <input type="checkbox" checked={t.completed} readOnly />
              <span className="pv-dot" style={{ background: cat.color }} />
              <span className="pv-flat-row-title">{t.title}</span>
              <span className="pv-tag">{cat.name}</span>
              <span className="pv-chip" style={{ background: priorityColor[t.priority] + '22', color: priorityColor[t.priority] }}>
                {t.priority}
              </span>
              {t.dueDate && <span className="pv-tag">{t.dueDate}</span>}
              {t.tags.map((tag) => (
                <span className="pv-tag" key={tag}>#{tag}</span>
              ))}
            </div>
          )
        })}
        {rows.length === 0 && <div className="pv-flat-row">No matches.</div>}
      </div>
    </div>
  )
}
