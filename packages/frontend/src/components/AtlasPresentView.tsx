import { useEffect, useMemo, useState } from 'react'
import { AlertTriangle, ArrowUpRight, Link2 } from 'lucide-react'
import { Link } from 'react-router-dom'
import { useAtlasEpics } from '../hooks/useAtlasEpics'
import type { AtlasEpic } from '../types'
import { jiraIssueUrl } from '../constants/jira'
import { getId } from '../utils/getId'
import {
  AT_RISK_BADGE,
  HEALTH_LABEL,
  HEALTH_RING,
  HEALTH_TILE,
  STATUS_BADGE,
  attentionItems,
  buildBlockedByLookup,
  epicHealth,
  epicStats,
  formatDateRange,
  type AttentionItem,
  type BlockedByRef,
  type EpicHealth,
} from '../utils/atlasStats'

// Present view (ticket 11, spec §7 / .scratch/sprint-atlas-program/issues/
// 11-present-view.md) - the dedicated, read-only, screen-share-friendly
// standup screen. "Compact master/detail" (winning prototype Variant D,
// branch prototype/atlas-present-ui-variants; see issue 05's Answer for why
// it beat the carousel/scroll/grid variants). A brand-new, separate screen
// from AtlasView/the Dashboard - shares only the read layer (useAtlasEpics,
// atlasStats.ts's pure helpers) and never calls a single mutation. The
// Dashboard-side entry point into this screen lives in SprintShell.tsx, not
// here or in AtlasView.tsx - see that file's AtlasDashboardSection comment
// for why.
//
// Live (non-archived) epics only, everywhere - archive/restore stays a
// Dashboard-only concept. Selecting an epic (click, or ↑/↓ while no text
// input is focused) swaps the detail pane via local state only - no route
// change, no page transition.

function MiniRing({ pct, ringClassName }: { pct: number; ringClassName: string }) {
  const size = 34
  const stroke = 4
  const r = (size - stroke) / 2
  const c = 2 * Math.PI * r
  return (
    <svg width={size} height={size} className="-rotate-90 shrink-0" aria-hidden="true">
      <circle cx={size / 2} cy={size / 2} r={r} strokeWidth={stroke} className="fill-none stroke-black/10 dark:stroke-white/10" />
      <circle
        cx={size / 2}
        cy={size / 2}
        r={r}
        strokeWidth={stroke}
        strokeLinecap="round"
        className={`fill-none ${ringClassName}`}
        strokeDasharray={c}
        strokeDashoffset={c - (pct / 100) * c}
      />
    </svg>
  )
}

// One program-strip row - a health-ringed progress dot, title + Jira key,
// and an at-risk count badge (only when >0, spec §7). The whole row is the
// click target; ↑/↓ handling lives once at the top level (AtlasPresentView)
// rather than per-row, since it needs to know the full ordered list.
function ProgramStripRow({
  epic,
  health,
  progressPct,
  atRiskCount,
  selected,
  onSelect,
}: {
  epic: AtlasEpic
  health: EpicHealth
  progressPct: number
  atRiskCount: number
  selected: boolean
  onSelect: () => void
}) {
  return (
    <button
      type="button"
      role="option"
      aria-selected={selected}
      onClick={onSelect}
      className={`flex w-full items-center gap-3 rounded-xl border px-3 py-2 text-left transition ${
        selected
          ? 'border-fuchsia-400 bg-fuchsia-50 dark:border-fuchsia-500/50 dark:bg-fuchsia-500/10'
          : 'border-slate-200 bg-white hover:bg-slate-50 dark:border-white/10 dark:bg-white/5 dark:hover:bg-white/10'
      }`}
    >
      <MiniRing pct={progressPct} ringClassName={HEALTH_RING[health]} />
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-semibold text-slate-900 dark:text-slate-50">{epic.title}</div>
        <div className="font-mono text-[11px] text-slate-400">{epic.jiraKey}</div>
      </div>
      {atRiskCount > 0 && (
        <span className={`shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-semibold ${AT_RISK_BADGE}`}>{atRiskCount}</span>
      )}
    </button>
  )
}

// One line of the "needs attention" digest - an at-risk task, or one
// blocked by something not yet Done, each with its reason spelled out and
// its notes shown inline when present (spec §7). Cross-epic blocker keys
// are shown bare, no epic-suffix chip - the digest is already scoped to one
// epic, unlike the Dashboard's "Blocked by" chips (AtlasView.tsx).
function AttentionRow({ item, blockedByLookup }: { item: AttentionItem; blockedByLookup: Map<string, BlockedByRef> }) {
  const { task, reason } = item
  const blockerKeys = task.blockedBy.map((id) => blockedByLookup.get(id)?.jiraKey).filter((key): key is string => Boolean(key))
  return (
    <div className="flex items-start gap-2 text-sm">
      {reason === 'at-risk' ? (
        <AlertTriangle size={16} className="mt-0.5 shrink-0 text-rose-600 dark:text-rose-300" />
      ) : (
        <Link2 size={16} className="mt-0.5 shrink-0 text-rose-600 dark:text-rose-300" />
      )}
      <span className="text-slate-800 dark:text-slate-100">
        <span className="font-mono text-xs font-semibold text-fuchsia-600 dark:text-fuchsia-300">{task.jiraKey}</span>{' '}
        <span className="font-semibold">{task.title}</span>{' '}
        <span className="text-slate-500 dark:text-slate-400">
          ({reason === 'at-risk' ? 'at risk' : `blocked by ${blockerKeys.length > 0 ? blockerKeys.join(', ') : 'a linked task'}`})
        </span>
        {task.notesText && <span className="block text-xs italic text-slate-500 dark:text-slate-400">{task.notesText}</span>}
      </span>
    </div>
  )
}

// The focused right-hand panel for whichever epic is selected: key + Jira
// link + date range, title, health/progress line, status bucket counts, the
// needs-attention digest (or an explicit "on track" line when clean), then
// epic notes as a blockquote - rendered from `notesText` the same plain-text
// way the Dashboard's own EpicNotesEditor read-only state does
// (AtlasView.tsx), not the raw Tiptap JSON. Background tinted by health.
function DetailPane({ epic, epics }: { epic: AtlasEpic; epics: AtlasEpic[] }) {
  const stats = epicStats(epic)
  const health = epicHealth(stats)
  const attention = attentionItems(epic)
  // Built from every tracked epic, not just this one - a cross-epic blocker
  // (spec §5.2) needs its jiraKey resolved even though it lives elsewhere.
  const blockedByLookup = useMemo(() => buildBlockedByLookup(epics), [epics])

  return (
    <div className={`flex h-full flex-col overflow-y-auto rounded-2xl border p-6 ${HEALTH_TILE[health]}`}>
      <div className="mb-1 flex items-center gap-2">
        <a
          href={jiraIssueUrl(epic.jiraKey)}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-1 font-mono text-sm font-semibold text-fuchsia-600 hover:underline dark:text-fuchsia-300"
        >
          {epic.jiraKey}
          <ArrowUpRight size={12} />
        </a>
        <span className="text-xs text-slate-500 dark:text-slate-400">{formatDateRange(stats.startDate, stats.endDate)}</span>
      </div>
      <h2 className="mb-4 text-3xl font-extrabold text-slate-900 dark:text-slate-50">{epic.title}</h2>

      <div className="mb-5 flex flex-wrap items-center gap-4">
        <div className="text-sm font-semibold text-slate-700 dark:text-slate-200">
          {HEALTH_LABEL[health]} · {stats.progressPct}% done
        </div>
        <div className="flex gap-2 text-xs">
          <span className={`rounded-full px-1.5 py-0.5 font-semibold ${STATUS_BADGE['To Do']}`}>{stats.todo} To Do</span>
          <span className={`rounded-full px-1.5 py-0.5 font-semibold ${STATUS_BADGE['In Progress']}`}>
            {stats.inProgress} In Progress
          </span>
          <span className={`rounded-full px-1.5 py-0.5 font-semibold ${STATUS_BADGE.Done}`}>{stats.done} Done</span>
        </div>
      </div>

      {attention.length === 0 ? (
        <p className="text-sm font-medium text-emerald-700 dark:text-emerald-300">On track — nothing at risk or blocked right now.</p>
      ) : (
        <div className="flex flex-col gap-2">
          {attention.map((item) => (
            <AttentionRow key={getId(item.task) ?? item.task.jiraKey} item={item} blockedByLookup={blockedByLookup} />
          ))}
        </div>
      )}

      {epic.notesText && (
        <blockquote className="mt-4 border-l-4 border-fuchsia-400 pl-3 text-sm italic text-slate-600 dark:border-fuchsia-500/50 dark:text-slate-300">
          {epic.notesText}
        </blockquote>
      )}
    </div>
  )
}

export function AtlasPresentView() {
  const { epics, loading, loadError } = useAtlasEpics()
  // Present is standup-facing, live epics only, everywhere (spec §7) -
  // archived epics never appear in the strip, the detail pane, or as a
  // cross-epic blocker's resolved key.
  const active = useMemo(() => epics.filter((epic) => !epic.archived), [epics])
  const [selectedId, setSelectedId] = useState<string | null>(null)

  // Falls back to the first live epic whenever nothing's been explicitly
  // selected yet, or the previously-selected one just dropped out of `active`
  // (e.g. archived on the Dashboard in another tab mid-standup) - mirrors
  // AtlasView's own index-derived "no effect needed" default-selection
  // pattern rather than seeding this via an effect that would race the
  // initial fetch.
  const selected = active.find((epic) => getId(epic) === selectedId) ?? active[0] ?? null

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      // Present has no text inputs of its own, but this guard costs nothing
      // and keeps the listener safe if that ever changes.
      const tag = document.activeElement?.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA') return
      if (event.key !== 'ArrowUp' && event.key !== 'ArrowDown') return
      if (active.length === 0) return
      event.preventDefault()
      const currentId = selected ? getId(selected) : undefined
      const index = active.findIndex((epic) => getId(epic) === currentId)
      const delta = event.key === 'ArrowDown' ? 1 : -1
      const next = active[(index + delta + active.length) % active.length]
      setSelectedId(getId(next) ?? null)
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [active, selected])

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">Present</h2>
        <Link
          to="/sprint/atlas"
          className="rounded-lg border border-slate-200 px-2.5 py-1 text-xs font-medium text-slate-600 hover:bg-slate-100 dark:border-white/10 dark:text-slate-300 dark:hover:bg-white/5"
        >
          Back to Dashboard
        </Link>
      </div>

      {loading && <p className="text-sm text-slate-400 dark:text-slate-500">Loading tracked epics…</p>}
      {loadError && <p className="text-sm text-red-600 dark:text-red-400">Error: {loadError}</p>}

      {!loading && !loadError && active.length === 0 && (
        <p className="text-sm text-slate-500 dark:text-slate-400">No live epics tracked yet. Track one from the Dashboard first.</p>
      )}

      {!loading && active.length > 0 && selected && (
        <div className="flex h-[calc(100vh-16rem)] min-h-[420px] gap-4">
          <div role="listbox" aria-label="Program (Up/Down to move)" className="flex w-64 shrink-0 flex-col gap-2 overflow-y-auto">
            {active.map((epic) => {
              const stats = epicStats(epic)
              const health = epicHealth(stats)
              const id = getId(epic) ?? epic.jiraKey
              return (
                <ProgramStripRow
                  key={id}
                  epic={epic}
                  health={health}
                  progressPct={stats.progressPct}
                  atRiskCount={stats.atRisk}
                  selected={getId(selected) === id}
                  onSelect={() => setSelectedId(id)}
                />
              )
            })}
          </div>
          <div className="min-w-0 flex-1">
            <DetailPane epic={selected} epics={epics} />
          </div>
        </div>
      )}
    </div>
  )
}
