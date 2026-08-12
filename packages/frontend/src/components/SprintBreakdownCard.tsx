// Sprint Breakdown card (.scratch/sprint-breakdown-card) - header ->
// headline total dev estimate -> Recharts donut -> vertical legend list, top
// to bottom. Visual design validated via a `/prototype` session (Variant A,
// "Stacked sidebar" - branch prototype/sprint-breakdown-card,
// SprintBreakdownVariantA.tsx); this is the permanent version, wired to the
// real utils/sprintBreakdown.ts instead of a variant switcher.
import { Cell, Pie, PieChart, ResponsiveContainer } from 'recharts'
import { formatDaysHours } from '../utils/formatDuration'
import type { Breakdown } from '../utils/sprintBreakdown'

export function SprintBreakdownCard({ breakdown }: { breakdown: Breakdown }) {
  const { totalHours, slices } = breakdown
  const empty = totalHours === 0

  return (
    <div className="w-full shrink-0 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-white/10 dark:bg-white/5 dark:shadow-none dark:backdrop-blur-md lg:w-80">
      <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">Sprint breakdown</h2>
      <div className="mt-1 text-2xl font-extrabold text-slate-900 dark:text-slate-100">
        {formatDaysHours(totalHours)} <span className="text-xs font-medium text-slate-400">total dev estimate</span>
      </div>

      {empty ? (
        <div className="mt-4 flex flex-col items-center gap-2 rounded-xl border border-dashed border-slate-200 py-8 text-center dark:border-white/10">
          <div className="h-16 w-16 rounded-full border-4 border-dashed border-slate-200 dark:border-white/10" />
          <p className="text-xs text-slate-400">No dev tickets planned yet</p>
        </div>
      ) : (
        <div className="mt-2 h-40 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie data={slices} dataKey="hours" nameKey="bucket" innerRadius={40} outerRadius={64} paddingAngle={2} stroke="none">
                {slices.map((s) => (
                  <Cell key={s.bucket} fill={s.color} />
                ))}
              </Pie>
            </PieChart>
          </ResponsiveContainer>
        </div>
      )}

      <div className="mt-3 flex flex-col gap-1.5">
        {slices.map((s) => (
          <div key={s.bucket} className="flex items-center justify-between gap-2 text-sm">
            <span className="flex items-center gap-1.5 text-slate-700 dark:text-slate-200">
              <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: s.color }} />
              {s.bucket}
            </span>
            <span className="shrink-0 text-xs text-slate-500 dark:text-slate-400">
              {s.percent}% <span className="text-slate-400 dark:text-slate-500">({formatDaysHours(s.hours)})</span>
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}
