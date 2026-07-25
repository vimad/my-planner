import { getId } from '../utils/getId'
import { ScratchNoteCard } from './ScratchNoteCard'

// Inbox-style list of scratch notes - each a separate card (not one
// continuous pad), per the scratchpad decisions on the wayfinder map.
export function Scratchpad({ notes, categories, onCreateNote, onUpdateLines, onPromote, onArchive, onDelete }) {
  return (
    <section aria-label="Scratchpad" className="mt-6">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-lg font-semibold text-slate-100">Scratchpad</h2>
        <button
          type="button"
          onClick={onCreateNote}
          className="rounded-full border border-dashed border-white/20 px-4 py-2 text-sm text-slate-300 hover:bg-white/5"
        >
          + New note
        </button>
      </div>

      {notes.length === 0 && (
        <p className="text-sm text-slate-400">
          No scratch notes yet — jot something down before it slips your mind.
        </p>
      )}

      <div className="flex flex-col gap-3">
        {notes.map((note) => {
          const id = getId(note)
          return (
            <ScratchNoteCard
              key={id}
              note={note}
              categories={categories}
              onUpdateLines={(lines) => onUpdateLines(id, lines)}
              onPromote={(lineId, options) => onPromote(id, lineId, options)}
              onArchive={() => onArchive(id)}
              onDelete={() => onDelete(id)}
            />
          )
        })}
      </div>
    </section>
  )
}
