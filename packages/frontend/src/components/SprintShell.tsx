import { useEffect, useState } from 'react'
import { Navigate, Route, Routes, useLocation, useNavigate, useParams } from 'react-router-dom'
import { useActiveTeam } from '../hooks/useActiveTeam'
import { getId } from '../utils/getId'
import { teamSlug } from '../utils/teamSlug'
import { applyTheme, getInitialTheme } from '../utils/theme'
import type { Team } from '../types'
import { ConfirmDialog } from './ConfirmDialog'
import { Header } from './Header'
import { PlanningView } from './PlanningView'
import { TeamSwitcher } from './TeamSwitcher'

type SprintTab = 'planning' | 'status' | 'epics'

const SPRINT_TABS: readonly { key: SprintTab; label: string }[] = [
  { key: 'planning', label: 'Planning' },
  { key: 'status', label: 'Status' },
  { key: 'epics', label: 'Epics' },
]

// Read-only-for-now placeholder for the Planning/Status/Epics sub-views,
// built out in tickets 18/20/21.
function SprintStubView({ label }: { label: string }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm dark:border-white/10 dark:bg-white/5 dark:shadow-none dark:backdrop-blur-md">
      <p className="text-sm text-slate-500 dark:text-slate-400">{label} view coming soon.</p>
    </div>
  )
}

// Landing at bare /sprint with no team in the URL yet - resolves the
// last-active team (useActiveTeam's own localStorage/fallback logic) and
// redirects to its Planning view. No teams at all is a valid, non-error
// state (unlike Profile, Team has no "at least one must exist" guard).
function SprintIndex({ teams, loading, activeTeamId }: { teams: Team[]; loading: boolean; activeTeamId: string | null }) {
  if (loading) return null

  const activeTeam = teams.find((team) => getId(team) === activeTeamId)
  if (!activeTeam) {
    return (
      <p className="text-sm text-slate-500 dark:text-slate-400">
        No teams yet — use "Manage teams" above to create one.
      </p>
    )
  }

  return <Navigate to={`/sprint/${encodeURIComponent(teamSlug(activeTeam.name))}/planning`} replace />
}

// Everything under /sprint/:teamSlug/* - the sub-nav pill row plus whichever
// stub view the route segment selects. Owns adopting the URL's team as the
// active one (mirrors AppShell's URL -> state sync for profiles) so the
// header's TeamSwitcher stays in sync with a bookmarked/back-navigated URL.
function TeamShell({
  teams,
  activeTeamId,
  setActiveTeamId,
  loading,
}: {
  teams: Team[]
  activeTeamId: string | null
  setActiveTeamId: (id: string) => void
  loading: boolean
}) {
  const { teamSlug: routeTeamSlug } = useParams<{ teamSlug: string }>()
  const navigate = useNavigate()
  const location = useLocation()
  const team = teams.find((t) => teamSlug(t.name) === routeTeamSlug) ?? null

  useEffect(() => {
    const id = team ? getId(team) : undefined
    if (id && id !== activeTeamId) setActiveTeamId(id)
  }, [team, activeTeamId, setActiveTeamId])

  if (!team) {
    // Stale/unknown slug (e.g. a deleted team, or the active team's own
    // name/slug just changed) once the team list has settled - falls back
    // to re-resolving the last-active team from scratch (SprintIndex, which
    // itself renders the "no teams yet" message if none remain). Checked
    // against `loading`, not `teams.length` - an empty list is a genuine
    // resolved state (e.g. right after deleting the last team), not
    // evidence the fetch is still in flight.
    return loading ? null : <Navigate to="/sprint" replace />
  }

  const activeTab: SprintTab = location.pathname.endsWith('/status')
    ? 'status'
    : location.pathname.endsWith('/epics')
      ? 'epics'
      : 'planning'

  return (
    <>
      <div
        role="tablist"
        aria-label="Sprint view"
        className="mb-6 flex w-fit items-center gap-1 rounded-full border border-slate-200 bg-white p-1 dark:border-white/10 dark:bg-white/5"
      >
        {SPRINT_TABS.map((sprintTab) => (
          <button
            key={sprintTab.key}
            type="button"
            role="tab"
            aria-selected={activeTab === sprintTab.key}
            onClick={() => navigate(`/sprint/${encodeURIComponent(routeTeamSlug ?? '')}/${sprintTab.key}`)}
            className={`rounded-full px-3 py-1.5 text-sm font-semibold transition ${
              activeTab === sprintTab.key
                ? 'bg-gradient-to-r from-violet-500 to-fuchsia-500 text-white'
                : 'text-slate-500 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-white/10'
            }`}
          >
            {sprintTab.label}
          </button>
        ))}
      </div>

      <Routes>
        <Route index element={<Navigate to="planning" replace />} />
        <Route path="planning" element={<PlanningView team={team} />} />
        <Route path="status" element={<SprintStubView label="Status" />} />
        <Route path="epics" element={<SprintStubView label="Epics" />} />
      </Routes>
    </>
  )
}

// The Sprint tab's own top-level shell, mounted on /sprint/* by App.tsx
// alongside (never inside) AppShell - see the spec's "Two-shell
// architecture". A clean-room component: it owns its own theme state
// (mirroring AppShell's, since the two shells are never mounted together)
// rather than sharing AppShell's.
export function SprintShell() {
  const navigate = useNavigate()
  const [theme, setTheme] = useState(getInitialTheme)
  const [pendingDelete, setPendingDelete] = useState<Team | null>(null)

  useEffect(() => {
    applyTheme(theme)
  }, [theme])

  const { teams, activeTeamId, loading, error, setActiveTeamId, createTeam, updateTeam, deleteTeam } =
    useActiveTeam()

  function handleSelectTeam(id: string) {
    setActiveTeamId(id)
    const team = teams.find((t) => getId(t) === id)
    if (team) navigate(`/sprint/${encodeURIComponent(teamSlug(team.name))}/planning`)
  }

  return (
    <main className="min-h-screen bg-[#f2f1f5] px-6 py-9 text-slate-900 dark:bg-[radial-gradient(circle_at_20%_0%,#241a3a_0%,#0f0f18_55%)] dark:text-slate-100 sm:px-10">
      <Header
        onWordmarkClick={() => navigate('/')}
        theme={theme}
        onToggleTheme={() => setTheme((t) => (t === 'dark' ? 'light' : 'dark'))}
      >
        {!loading && (
          <TeamSwitcher
            teams={teams}
            activeTeamId={activeTeamId}
            onSelect={handleSelectTeam}
            onCreate={createTeam}
            onRename={(id, name) => updateTeam(id, { name })}
            onUpdateJiraLabels={(id, jiraLabels) => updateTeam(id, { jiraLabels })}
            onDeleteRequest={setPendingDelete}
          />
        )}
      </Header>

      {error && (
        <p className="mb-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-300">
          Error: {error}
        </p>
      )}

      <Routes>
        <Route index element={<SprintIndex teams={teams} loading={loading} activeTeamId={activeTeamId} />} />
        <Route
          path=":teamSlug/*"
          element={
            <TeamShell teams={teams} activeTeamId={activeTeamId} setActiveTeamId={setActiveTeamId} loading={loading} />
          }
        />
      </Routes>

      {pendingDelete && (
        <ConfirmDialog
          message={`Delete "${pendingDelete.name}"? This cannot be undone.`}
          onCancel={() => setPendingDelete(null)}
          onConfirm={() => {
            const id = getId(pendingDelete)
            setPendingDelete(null)
            if (id) deleteTeam(id)
          }}
        />
      )}
    </main>
  )
}
