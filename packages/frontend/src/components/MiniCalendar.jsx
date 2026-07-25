import { localTodayISO } from '../utils/dateAgenda'

const WEEKDAY_LABELS = ['S', 'M', 'T', 'W', 'T', 'F', 'S']

// Small calendar widget marking which days in the current month have due
// todos. "Today" is computed live from `new Date()` on every render, not
// stored — see the dateAgenda constraint about local calendar-day strings.
export function MiniCalendar({ todos }) {
  const today = new Date()
  const year = today.getFullYear()
  const month = today.getMonth()
  const todayISO = localTodayISO(today)

  const firstDayOffset = new Date(year, month, 1).getDay()
  const daysInMonth = new Date(year, month + 1, 0).getDate()
  const cells = [
    ...Array(firstDayOffset).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ]

  const dueDates = new Set(todos.filter((t) => t.dueDate).map((t) => t.dueDate))

  return (
    <div className="w-full shrink-0 rounded-2xl border border-white/10 bg-white/5 p-4 backdrop-blur-md sm:w-56">
      <p className="mb-3 text-sm font-bold text-slate-100">
        {today.toLocaleString('default', { month: 'long', year: 'numeric' })}
      </p>
      <div className="grid grid-cols-7 gap-1">
        {WEEKDAY_LABELS.map((label, i) => (
          <div key={i} className="text-center text-[0.65rem] text-slate-500">
            {label}
          </div>
        ))}
        {cells.map((day, i) => {
          if (!day) return <div key={i} />

          const iso = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
          const isToday = iso === todayISO
          const hasDue = dueDates.has(iso)

          return (
            <div
              key={i}
              className={`relative flex aspect-square items-center justify-center rounded-lg text-xs ${
                isToday
                  ? 'bg-gradient-to-br from-violet-500 to-fuchsia-500 font-bold text-white shadow-[0_0_14px_rgba(255,107,214,0.5)]'
                  : 'text-slate-300'
              }`}
            >
              {day}
              {hasDue && !isToday && (
                <span className="absolute bottom-0.5 h-1 w-1 rounded-full bg-cyan-300 shadow-[0_0_6px_#6bf0ff]" />
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
