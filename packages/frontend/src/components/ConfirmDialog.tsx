interface ConfirmDialogProps {
  message: string
  confirmLabel?: string
  cancelLabel?: string
  onConfirm: () => void
  onCancel: () => void
  // Opt-in extra checkbox rendered on the left of the footer, opposite the
  // Cancel/Confirm buttons (e.g. mark-complete's "Add followup") - omitted
  // entirely for every other caller of this shared dialog (delete
  // todo/category/scratch note, etc).
  checkboxLabel?: string
  checkboxChecked?: boolean
  onCheckboxChange?: (checked: boolean) => void
}

// Generic confirmation modal used to gate destructive/hard-to-undo actions
// (deleting a todo/category/scratch note, marking a todo complete) behind an
// explicit second click. Callers own the "should we even ask" decision -
// this component just renders whatever message it's given.
export function ConfirmDialog({
  message,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  onConfirm,
  onCancel,
  checkboxLabel,
  checkboxChecked,
  onCheckboxChange,
}: ConfirmDialogProps) {
  return (
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center bg-black/60 p-4"
      role="alertdialog"
      aria-modal="true"
      aria-label="Confirm action"
    >
      <div className="w-full max-w-sm rounded-2xl border border-slate-200 bg-white p-6 text-slate-900 shadow-xl dark:border-white/10 dark:bg-[#160f24] dark:text-slate-100">
        <p className="mb-5 text-sm text-slate-700 dark:text-slate-200">{message}</p>
        <div className="flex items-center justify-between gap-2">
          {checkboxLabel ? (
            <label className="flex items-center gap-1 text-[10px] font-medium text-slate-600 dark:text-slate-300">
              <input
                type="checkbox"
                checked={checkboxChecked ?? false}
                onChange={(e) => onCheckboxChange?.(e.target.checked)}
                className="h-2.5 w-2.5 accent-fuchsia-500"
              />
              {checkboxLabel}
            </label>
          ) : (
            <span />
          )}
          <div className="flex gap-2">
            <button
              type="button"
              onClick={onCancel}
              className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-100 dark:border-white/10 dark:text-slate-300 dark:hover:bg-white/5"
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
    </div>
  )
}
