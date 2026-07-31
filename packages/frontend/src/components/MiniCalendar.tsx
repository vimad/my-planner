import { useState } from 'react'
import { localTodayISO, type DateRange } from '../utils/dateAgenda'

// Unlike dateAgenda's matchesDateRange (where a null range means "no
// filter, everything matches"), a null range here just means "nothing to
// highlight" - this is purely about which cells to visually mark as
// selected/previewed, not about filtering todos.
function inRange(iso: string, range: DateRange | null): boolean {
  return range !== null && iso >= range.start && iso <= range.end
}

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
  selectedRange?: DateRange | null
  onSelectRange?: (range: DateRange | null) => void
}

// Small calendar widget marking which days in the current month have due
// todos, plus the shared "next office day" (a violet ring, distinct from
// the cyan due-date dot), a control to set/clear it, and a click/click
// date-range filter (see utils/dateAgenda.ts's matchesDateRange). "Today"
// and the due-date/office-day markers are always computed live from
// `new Date()`/the real todos - navigating `viewDate` to browse another
// month never changes what "today" means, see the dateAgenda constraint
// about local calendar-day strings.
export function MiniCalendar({
  todos,
  nextOfficeDay = null,
  onSetOfficeDay,
  selectedRange = null,
  onSelectRange,
}: MiniCalendarProps) {
  const [viewDate, setViewDate] = useState(() => new Date())
  // The first click of a range picks a provisional start; onSelectRange
  // only fires on the second click (see the spec's click-start /
  // hover-preview / click-end-to-commit decision - hovering must never
  // filter anything by itself).
  const [pendingStart, setPendingStart] = useState<string | null>(null)
  const [hoverDay, setHoverDay] = useState<string | null>(null)

  const todayISO = localTodayISO()
  const year = viewDate.getFullYear()
  const month = viewDate.getMonth()

  const firstDayOffset = new Date(year, month, 1).getDay()
  const daysInMonth = new Date(year, month + 1, 0).getDate()
  const cells = [
    ...Array(firstDayOffset).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ]

  const dueDates = new Set(todos.filter((t) => t.dueDate).map((t) => t.dueDate))

  const previewRange: DateRange | null =
    pendingStart && hoverDay
      ? {
          start: pendingStart < hoverDay ? pendingStart : hoverDay,
          end: pendingStart < hoverDay ? hoverDay : pendingStart,
        }
      : null

  function changeMonth(delta: number) {
    setViewDate(new Date(year, month + delta, 1))
  }

  function handleDayClick(iso: string) {
    if (!pendingStart) {
      setPendingStart(iso)
      setHoverDay(null)
      return
    }

    const start = pendingStart < iso ? pendingStart : iso
    const end = pendingStart < iso ? iso : pendingStart
    onSelectRange?.({ start, end })
    setPendingStart(null)
    setHoverDay(null)
  }

  function clearSelection() {
    setPendingStart(null)
    setHoverDay(null)
    onSelectRange?.(null)
  }

  return (
    <div className="w-full shrink-0 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-white/10 dark:bg-white/5 dark:shadow-none dark:backdrop-blur-md sm:w-56">
      <div className="mb-3 flex items-center justify-between">
        <button
          type="button"
          aria-label="Previous month"
          onClick={() => changeMonth(-1)}
          className="rounded px-1.5 py-0.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-white/10 dark:hover:text-slate-200"
        >
          ‹
        </button>
        <p className="text-sm font-bold text-slate-900 dark:text-slate-100">
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
      <div className="grid grid-cols-7 gap-1" onMouseLeave={() => setHoverDay(null)}>
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
          const isSelected = inRange(iso, selectedRange) || inRange(iso, previewRange) || iso === pendingStart

          // Today, selected, and office-day are expressed on independent CSS
          // channels (background, border, ring) rather than one mutually-
          // exclusive if/else chain, so any combination of the three stays
          // simultaneously legible on the same cell instead of one silently
          // hiding another.
          let cellClassName =
            'relative flex aspect-square items-center justify-center rounded-lg text-xs transition '
          if (isToday) {
            cellClassName +=
              'bg-gradient-to-br from-violet-500 to-fuchsia-500 font-bold text-white shadow-[0_0_14px_rgba(255,107,214,0.5)] '
          } else if (isSelected) {
            cellClassName += 'bg-violet-500/20 font-semibold text-violet-700 dark:bg-violet-500/25 dark:text-violet-200 '
          } else {
            cellClassName += 'text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-white/10 '
          }
          if (isSelected) {
            cellClassName += 'border border-violet-400 dark:border-violet-300 '
          }
          if (isOfficeDay) {
            cellClassName += 'ring-2 ring-inset ring-violet-400 '
            if (!isToday && !isSelected) {
              cellClassName += 'font-semibold text-slate-600 dark:text-slate-300 '
            }
          }

          return (
            <button
              key={i}
              type="button"
              title={isOfficeDay ? 'Next office day' : undefined}
              onClick={() => handleDayClick(iso)}
              onMouseEnter={() => {
                if (pendingStart) setHoverDay(iso)
              }}
              className={cellClassName}
            >
              {day}
              {hasDue && !isToday && (
                <span className="absolute bottom-0.5 h-1 w-1 rounded-full bg-cyan-300 shadow-[0_0_6px_#6bf0ff]" />
              )}
            </button>
          )
        })}
      </div>

      {selectedRange && (
        <div className="mt-3 flex items-center justify-between border-t border-slate-200 pt-3 dark:border-white/10">
          <p className="text-xs text-slate-500 dark:text-slate-300">Filtered by date</p>
          <button
            type="button"
            aria-label="Clear date filter"
            onClick={clearSelection}
            className="shrink-0 rounded-lg px-2 py-1.5 text-xs text-slate-400 hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-white/10 dark:hover:text-slate-200"
          >
            ×
          </button>
        </div>
      )}

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
