// Generic confirmation modal used to gate destructive/hard-to-undo actions
// (deleting a todo/category/scratch note, marking a todo complete) behind an
// explicit second click. Callers own the "should we even ask" decision -
// this component just renders whatever message it's given.
export function ConfirmDialog({ message, confirmLabel = 'Confirm', cancelLabel = 'Cancel', onConfirm, onCancel }) {
  return (
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center bg-black/60 p-4"
      role="alertdialog"
      aria-modal="true"
      aria-label="Confirm action"
    >
      <div className="w-full max-w-sm rounded-2xl border border-white/10 bg-[#160f24] p-6 text-slate-100 shadow-xl">
        <p className="mb-5 text-sm text-slate-200">{message}</p>
        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="rounded-lg border border-white/10 px-3 py-1.5 text-sm text-slate-300 hover:bg-white/5"
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className="rounded-lg bg-gradient-to-r from-violet-500 to-fuchsia-500 px-3 py-1.5 text-sm font-semibold text-white hover:opacity-90"
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}
