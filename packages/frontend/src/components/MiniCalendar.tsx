import { localTodayISO } from '../utils/dateAgenda'

const WEEKDAY_LABELS = ['S', 'M', 'T', 'W', 'T', 'F', 'S']

// Minimal shape this component needs from a todo — just the due date used
// to mark calendar cells. Not a full canonical Todo type (none exists on
// the frontend yet).
export interface MiniCalendarTodo {
  dueDate?: string | null
}

interface MiniCalendarProps {
  todos: MiniCalendarTodo[]
  nextOfficeDay?: string | null
  onSetOfficeDay?: (date: string | null) => void
}

// Small calendar widget marking which days in the current month have due
// todos, plus the shared "next office day" (a violet ring, distinct from
// the cyan due-date dot) and a control to set/clear it. "Today" is computed
// live from `new Date()` on every render, not stored — see the dateAgenda
// constraint about local calendar-day strings.
export function MiniCalendar({ todos, nextOfficeDay = null, onSetOfficeDay }: MiniCalendarProps) {
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
    <div className="w-full shrink-0 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-white/10 dark:bg-white/5 dark:shadow-none dark:backdrop-blur-md sm:w-56">
      <p className="mb-3 text-sm font-bold text-slate-900 dark:text-slate-100">
        {today.toLocaleString('default', { month: 'long', year: 'numeric' })}
      </p>
      <div className="grid grid-cols-7 gap-1">
        {WEEKDAY_LABELS.map((label, i) => (
          <div key={i} className="text-center text-[0.65rem] text-slate-400 dark:text-slate-500">
            {label}
          </div>
        ))}
        {cells.map((day, i) => {
          if (!day) return <div key={i} />

          const iso = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
          const isToday = iso === todayISO
          const hasDue = dueDates.has(iso)
          const isOfficeDay = iso === nextOfficeDay

          return (
            <div
              key={i}
              title={isOfficeDay ? 'Next office day' : undefined}
              className={`relative flex aspect-square items-center justify-center rounded-lg text-xs ${
                isToday
                  ? 'bg-gradient-to-br from-violet-500 to-fuchsia-500 font-bold text-white shadow-[0_0_14px_rgba(255,107,214,0.5)]'
                  : isOfficeDay
                    ? 'font-semibold text-slate-600 ring-2 ring-inset ring-violet-400 dark:text-slate-300'
                    : 'text-slate-600 dark:text-slate-300'
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

      <div className="mt-3 flex flex-col gap-1 border-t border-slate-200 pt-3 dark:border-white/10">
        <label htmlFor="next-office-day" className="text-xs font-medium text-slate-500 dark:text-slate-300">
          Next office day
        </label>
        <div className="flex items-center gap-1">
          <input
            id="next-office-day"
            type="date"
            value={nextOfficeDay ?? ''}
            onChange={(e) => onSetOfficeDay?.(e.target.value || null)}
            className="min-w-0 flex-1 rounded-lg border border-slate-200 bg-slate-50 px-2 py-1.5 text-xs text-slate-900 focus:border-violet-400/60 focus:outline-none dark:border-white/10 dark:bg-white/5 dark:text-slate-100"
          />
          {nextOfficeDay && (
            <button
              type="button"
              aria-label="Clear next office day"
              onClick={() => onSetOfficeDay?.(null)}
              className="shrink-0 rounded-lg px-2 py-1.5 text-xs text-slate-400 hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-white/10 dark:hover:text-slate-200"
            >
              ×
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
