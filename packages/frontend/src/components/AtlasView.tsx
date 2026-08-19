import { useState } from 'react'

// Ticket 06's scaffold-only empty state: the epic-key input renders and is
// typeable, but submitting it does nothing yet - wiring it to a real,
// synchronous Jira sync (spec.md §4.1) is ticket 07's job. Kept as local
// state (rather than omitted entirely) so the input reads as a genuine,
// about-to-be-wired control rather than a static placeholder - and so
// ticket 07 can lift this same state into a real submit handler with a
// minimal diff.
export function AtlasView() {
  const [epicKey, setEpicKey] = useState('')

  return (
    <div className="flex flex-col gap-4">
      <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-white/10 dark:bg-white/5 dark:shadow-none dark:backdrop-blur-md">
        <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">No epics tracked yet</h2>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
          Enter a Jira epic key to start tracking it. Atlas will pull in its full task and sub-task tree.
        </p>

        <form
          className="mt-4 flex items-center gap-2"
          onSubmit={(event) => {
            // Inert by design (ticket 06 scope) - real submit/sync wiring
            // lands in ticket 07.
            event.preventDefault()
          }}
        >
          <input
            type="text"
            value={epicKey}
            onChange={(event) => setEpicKey(event.target.value)}
            placeholder="e.g. WOSMVP-123"
            aria-label="Jira epic key"
            className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-fuchsia-400/60 focus:outline-none dark:border-white/10 dark:bg-white/5 dark:text-slate-100 dark:placeholder:text-slate-500"
          />
          <button
            type="submit"
            disabled
            className="rounded-lg bg-gradient-to-r from-violet-500 to-fuchsia-500 px-3 py-1.5 text-sm font-semibold text-white hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Track
          </button>
        </form>
      </div>
    </div>
  )
}
