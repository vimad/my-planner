import { useEffect, useState } from 'react'
import { Link, Navigate, Route, Routes, useLocation, useNavigate, useParams } from 'react-router-dom'
import { Presentation } from 'lucide-react'
import { useActiveTeam } from '../hooks/useActiveTeam'
import { getId } from '../utils/getId'
import { teamSlug } from '../utils/teamSlug'
import { applyTheme, getInitialTheme } from '../utils/theme'
import type { Team } from '../types'
import { AtlasPeopleButton } from './AtlasPeopleButton'
import { AtlasPresentView } from './AtlasPresentView'
import { AtlasView } from './AtlasView'
import { ConfirmDialog } from './ConfirmDialog'
import { Header } from './Header'
import { PlanningView } from './PlanningView'
import { StatusView } from './StatusView'
import { TeamSwitcher } from './TeamSwitcher'
import { WorkspaceSwitcher } from './WorkspaceSwitcher'

type SprintTab = 'planning' | 'status' | 'atlas'

// Team-scoped pills only (Planning/Status) - Atlas is rendered separately in
// the tab row below since it's always present regardless of team selection,
// unlike these two which only apply once a team is active.
const SPRINT_TABS: readonly { key: 'planning' | 'status'; label: string }[] = [
  { key: 'planning', label: 'Planning' },
  { key: 'status', label: 'Status' },
]

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

// Everything under /sprint/:teamSlug/* - just whichever view the route
// segment selects (the sub-nav pill row itself now lives in the header's
// left-hand cluster, next to WorkspaceSwitcher - see SprintShell below). Owns
// adopting the URL's team as the active one (mirrors AppShell's URL -> state
// sync for profiles) so the header's TeamSwitcher stays in sync with a
// bookmarked/back-navigated URL.
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

  return (
    <Routes>
      <Route index element={<Navigate to="planning" replace />} />
      <Route path="planning" element={<PlanningView team={team} />} />
      <Route path="status" element={<StatusView team={team} />} />
    </Routes>
  )
}

// Ticket 11's only touch-point on the Dashboard side: a top-of-page link
// into Present (spec §7 - Atlas's second, read-only view). Deliberately kept
// here rather than inside AtlasView.tsx itself, for two reasons: (1) the
// ticket's brief is explicit that Present "does not modify the Dashboard",
// and (2) AtlasView.test.tsx renders <AtlasView /> directly with no Router
// context - a <Link>/useNavigate call inside AtlasView.tsx would break that
// whole suite. SprintShell already renders inside a Router (App.tsx), so the
// link lives one level up instead.
function AtlasDashboardSection() {
  return (
    <div className="flex flex-col gap-3">
      <div className="flex justify-end">
        <Link
          to="/sprint/atlas/present"
          className="flex items-center gap-1.5 rounded-lg border border-slate-200 px-2.5 py-1 text-xs font-medium text-slate-600 hover:bg-slate-100 dark:border-white/10 dark:text-slate-300 dark:hover:bg-white/5"
        >
          <Presentation size={12} />
          Present
        </Link>
      </div>
      <AtlasView />
    </div>
  )
}

// The Sprint tab's own top-level shell, mounted on /sprint/* by App.tsx
// alongside (never inside) AppShell - see the spec's "Two-shell
// architecture". A clean-room component: it owns its own theme state
// (mirroring AppShell's, since the two shells are never mounted together)
// rather than sharing AppShell's.
export function SprintShell() {
  const navigate = useNavigate()
  const location = useLocation()
  const [theme, setTheme] = useState(getInitialTheme)
  const [pendingDelete, setPendingDelete] = useState<Team | null>(null)

  useEffect(() => {
    applyTheme(theme)
  }, [theme])

  const { teams, activeTeamId, loading, error, setActiveTeamId, createTeam, updateTeam, deleteTeam } =
    useActiveTeam()

  // Derived from the URL rather than useParams - SprintShell itself is
  // mounted at /sprint/* (App.tsx), one level above the :teamSlug route
  // param TeamShell binds, so this is the only place up here to read it.
  // /sprint/atlas is a sibling route to :teamSlug/*, not a team slug itself
  // - guarded first so a team lookup never runs against the literal string
  // "atlas" (which would only misfire if a real team were ever named that).
  const pathSegments = location.pathname.split('/').filter(Boolean)
  const isAtlasRoute = pathSegments[1] === 'atlas'
  const routeTeamSlug = isAtlasRoute ? undefined : pathSegments[1]
  // On a team-scoped route, trust the URL over `activeTeamId` state (which
  // TeamShell only syncs via an effect, so it can lag one render behind a
  // fresh navigation). Atlas has no team segment in its URL at all, but
  // Planning/Status still need to know the last-active team so they keep
  // sharing the tab row (spec §1) instead of vanishing - see the
  // "shows Planning/Status alongside Atlas" test for the bug this fixes.
  const activeTeam = isAtlasRoute
    ? teams.find((t) => getId(t) === activeTeamId)
    : teams.find((t) => teamSlug(t.name) === routeTeamSlug)
  const activeTab: SprintTab = isAtlasRoute ? 'atlas' : pathSegments[2] === 'status' ? 'status' : 'planning'

  function handleSelectTeam(id: string) {
    setActiveTeamId(id)
    // Switching the active team from the Atlas tab must not navigate away
    // from it (Atlas has no team scoping at all) - just update which team
    // is active so Planning/Status reflect it whenever the user does
    // navigate back to a team-scoped tab.
    if (isAtlasRoute) return
    const team = teams.find((t) => getId(t) === id)
    if (team) navigate(`/sprint/${encodeURIComponent(teamSlug(team.name))}/planning`)
  }

  return (
    <main className="min-h-screen bg-[#f2f1f5] px-6 py-9 text-slate-900 dark:bg-[radial-gradient(circle_at_20%_0%,#241a3a_0%,#0f0f18_55%)] dark:text-slate-100 sm:px-10">
      <Header
        title="Sprint"
        subtitle="From backlog to sprint."
        theme={theme}
        onToggleTheme={() => setTheme((t) => (t === 'dark' ? 'light' : 'dark'))}
        workspaceSwitcher={
          <>
            <WorkspaceSwitcher current="sprint" onNavigate={(target) => target === 'planner' && navigate('/')} />
            <div
              role="tablist"
              aria-label="Sprint view"
              className="flex items-center gap-1 rounded-full border border-slate-200 bg-white p-1 dark:border-white/10 dark:bg-white/5"
            >
              {activeTeam &&
                SPRINT_TABS.map((sprintTab) => (
                  <button
                    key={sprintTab.key}
                    type="button"
                    role="tab"
                    aria-selected={activeTab === sprintTab.key}
                    onClick={() => navigate(`/sprint/${encodeURIComponent(teamSlug(activeTeam.name))}/${sprintTab.key}`)}
                    className={`rounded-full px-3 py-1.5 text-sm font-semibold transition ${
                      activeTab === sprintTab.key
                        ? 'bg-gradient-to-r from-violet-500 to-fuchsia-500 text-white'
                        : 'text-slate-500 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-white/10'
                    }`}
                  >
                    {sprintTab.label}
                  </button>
                ))}
              {/* Atlas: unlike Planning/Status above, always visible and
                  clickable regardless of team selection - it has no team
                  scoping at all (spec.md §1). */}
              <button
                type="button"
                role="tab"
                aria-selected={activeTab === 'atlas'}
                onClick={() => navigate('/sprint/atlas')}
                className={`rounded-full px-3 py-1.5 text-sm font-semibold transition ${
                  activeTab === 'atlas'
                    ? 'bg-gradient-to-r from-violet-500 to-fuchsia-500 text-white'
                    : 'text-slate-500 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-white/10'
                }`}
              >
                Atlas
              </button>
            </div>
          </>
        }
      >
        {/* Atlas has no team scoping at all (spec.md §1) - swap the
            Team-switching control out for Atlas's own roster button rather
            than showing a team switcher that has nothing to do on this
            route. */}
        {!loading && (isAtlasRoute ? (
          <AtlasPeopleButton />
        ) : (
          <TeamSwitcher
            teams={teams}
            activeTeamId={activeTeamId}
            onSelect={handleSelectTeam}
            onCreate={createTeam}
            onRename={(id, name) => updateTeam(id, { name })}
            onUpdateJiraLabels={(id, jiraLabels) => updateTeam(id, { jiraLabels })}
            onDeleteRequest={setPendingDelete}
          />
        ))}
      </Header>

      {error && (
        <p className="mb-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-300">
          Error: {error}
        </p>
      )}

      <Routes>
        <Route index element={<SprintIndex teams={teams} loading={loading} activeTeamId={activeTeamId} />} />
        <Route path="atlas" element={<AtlasDashboardSection />} />
        <Route path="atlas/present" element={<AtlasPresentView />} />
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
