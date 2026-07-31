import { useState } from 'react'
import { addDaysISO, dateFromISO, localTodayISO } from './dateMath'

const WEEKDAY_LABELS = ['S', 'M', 'T', 'W', 'T', 'F', 'S']

interface DatePickerPopupProps {
  value?: string | null
  onPick: (iso: string) => void
  // Only present when editing an existing badge (not when inserting a new
  // one from the "@date" trigger).
  onRemove?: () => void
}

const QUICK_PICKS: { label: string; days: number }[] = [
  { label: 'Today', days: 0 },
  { label: 'Tomorrow', days: 1 },
  { label: 'Next week', days: 7 },
]

// Quick-pick row + an interactive month grid, used both for inserting a new
// date badge (from the "@date" suggestion) and for changing/removing one
// (clicking an existing badge). Visually modeled on MiniCalendar's grid, but
// with month navigation and clickable days instead of a static "this month
// only" display.
export function DatePickerPopup({ value, onPick, onRemove }: DatePickerPopupProps) {
  const todayISO = localTodayISO()
  const [viewDate, setViewDate] = useState(() => dateFromISO(value || todayISO))

  const year = viewDate.getFullYear()
  const month = viewDate.getMonth()
  const firstDayOffset = new Date(year, month, 1).getDay()
  const daysInMonth = new Date(year, month + 1, 0).getDate()
  const cells = [...Array(firstDayOffset).fill(null), ...Array.from({ length: daysInMonth }, (_, i) => i + 1)]

  function changeMonth(delta: number) {
    setViewDate(new Date(year, month + delta, 1))
  }

  return (
    <div className="w-64 p-3">
      <div className="mb-2 flex flex-wrap gap-1">
        {QUICK_PICKS.map(({ label, days }) => (
          <button
            key={label}
            type="button"
            onClick={() => onPick(addDaysISO(todayISO, days))}
            className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-violet-100 hover:text-violet-700 dark:bg-white/10 dark:text-slate-200 dark:hover:bg-violet-500/30 dark:hover:text-violet-200"
          >
            {label}
          </button>
        ))}
      </div>

      <div className="mb-2 flex items-center justify-between">
        <button
          type="button"
          aria-label="Previous month"
          onClick={() => changeMonth(-1)}
          className="rounded px-1.5 py-0.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-white/10 dark:hover:text-slate-200"
        >
          ‹
        </button>
        <p className="text-xs font-bold text-slate-900 dark:text-slate-100">
          {viewDate.toLocaleString('default', { month: 'long', year: 'numeric' })}
        </p>
        <button
          type="button"
          aria-label="Next month"
          onClick={() => changeMonth(1)}
          className="rounded px-1.5 py-0.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-white/10 dark:hover:text-slate-200"
        >
          ›
        </button>
      </div>

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
          const isSelected = iso === value

          return (
            <button
              key={i}
              type="button"
              onClick={() => onPick(iso)}
              className={`flex aspect-square items-center justify-center rounded-lg text-xs transition ${
                isSelected
                  ? 'bg-gradient-to-br from-violet-500 to-fuchsia-500 font-bold text-white shadow-[0_0_14px_rgba(255,107,214,0.5)]'
                  : isToday
                    ? 'font-semibold text-violet-600 ring-2 ring-inset ring-violet-400 dark:text-violet-300'
                    : 'text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-white/10'
              }`}
            >
              {day}
            </button>
          )
        })}
      </div>

      {onRemove && (
        <button
          type="button"
          onClick={onRemove}
          className="mt-2 w-full rounded-lg px-2 py-1 text-left text-xs text-rose-500 hover:bg-rose-50 dark:text-rose-300 dark:hover:bg-rose-500/10"
        >
          Remove date
        </button>
      )}
    </div>
  )
}
