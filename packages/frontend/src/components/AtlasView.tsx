import { useState, type FormEvent } from 'react'
import { useAtlasEpics } from '../hooks/useAtlasEpics'
import type { AtlasEpic, AtlasTaskNode } from '../types'

// Recursive - one row per task/sub-task, indented one level per depth (spec
// §6's dashboard row shape, minimal/unstyled version - ticket 08 does the
// real visual design). Depth hard-floors at one nested level server-side
// (services/atlasSync.ts), but this component itself has no ceiling - it
// just renders whatever `subtasks` it's handed.
function AtlasTaskRows({ tasks, depth }: { tasks: AtlasTaskNode[]; depth: number }) {
  if (tasks.length === 0) return null
  return (
    <ul className="mt-2 flex flex-col gap-1" style={{ marginLeft: depth * 18 }}>
      {tasks.map((task) => (
        <li key={task._id ?? task.jiraKey} className="text-sm text-slate-700 dark:text-slate-300">
          <span className="font-mono text-xs text-fuchsia-600 dark:text-fuchsia-400">{task.jiraKey}</span>{' '}
          <span>{task.title}</span>{' '}
          <span className="text-xs font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">
            {task.status}
          </span>
          <AtlasTaskRows tasks={task.subtasks} depth={depth + 1} />
        </li>
      ))}
    </ul>
  )
}

function AtlasEpicRow({ epic }: { epic: AtlasEpic }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-white/10 dark:bg-white/5 dark:shadow-none dark:backdrop-blur-md">
      <div className="flex items-center gap-2">
        <span className="font-mono text-sm text-fuchsia-600 dark:text-fuchsia-400">{epic.jiraKey}</span>
        <span className="font-semibold text-slate-900 dark:text-slate-100">{epic.title}</span>
      </div>
      <AtlasTaskRows tasks={epic.tasks} depth={0} />
    </div>
  )
}

// Ticket 07's real sync wiring on top of ticket 06's scaffold: submitting
// the epic-key input triggers an immediate, synchronous
// resolve-and-recursively-sync against Jira (useAtlasEpics' trackEpic ->
// POST /api/atlas/epics), with a loading state on the button and an inline
// error on an unresolvable/non-Epic key (spec §4.1, §4.3). Below the input,
// every tracked epic renders as a minimal (unstyled - ticket 08 does visual
// design) list of its key/title and its task/sub-task tree.
export function AtlasView() {
  const { epics, loading, loadError, tracking, trackError, trackEpic } = useAtlasEpics()
  const [epicKey, setEpicKey] = useState('')

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    const key = epicKey.trim()
    if (!key) return
    const ok = await trackEpic(key)
    if (ok) setEpicKey('')
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-white/10 dark:bg-white/5 dark:shadow-none dark:backdrop-blur-md">
        {!loading && epics.length === 0 && (
          <>
            <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">No epics tracked yet</h2>
            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
              Enter a Jira epic key to start tracking it. Atlas will pull in its full task and sub-task tree.
            </p>
          </>
        )}

        <form className="mt-4 flex items-center gap-2" onSubmit={handleSubmit}>
          <input
            type="text"
            value={epicKey}
            onChange={(event) => setEpicKey(event.target.value)}
            placeholder="e.g. WOSMVP-123"
            aria-label="Jira epic key"
            disabled={tracking}
            className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-fuchsia-400/60 focus:outline-none disabled:opacity-50 dark:border-white/10 dark:bg-white/5 dark:text-slate-100 dark:placeholder:text-slate-500"
          />
          <button
            type="submit"
            disabled={tracking || !epicKey.trim()}
            className="rounded-lg bg-gradient-to-r from-violet-500 to-fuchsia-500 px-3 py-1.5 text-sm font-semibold text-white hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {tracking ? 'Syncing…' : 'Track'}
          </button>
        </form>

        {trackError && <p className="mt-2 text-sm text-red-600 dark:text-red-400">Error: {trackError}</p>}
      </div>

      {loading && <p className="text-sm text-slate-400 dark:text-slate-500">Loading tracked epics…</p>}
      {loadError && <p className="text-sm text-red-600 dark:text-red-400">Error: {loadError}</p>}

      {!loading && epics.length > 0 && (
        <div className="flex flex-col gap-3">
          {epics.map((epic) => (
            <AtlasEpicRow key={epic._id ?? epic.jiraKey} epic={epic} />
          ))}
        </div>
      )}
    </div>
  )
}
