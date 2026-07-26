import { useState } from 'react'
import { CATEGORY_COLORS } from '../constants/categoryColors'

export function CategoryForm({
  initialName = '',
  initialColor = CATEGORY_COLORS[0].hex,
  submitLabel,
  onSubmit,
  onCancel,
}) {
  const [name, setName] = useState(initialName)
  const [color, setColor] = useState(initialColor)

  function handleSubmit(e) {
    e.preventDefault()
    if (!name.trim()) return
    onSubmit({ name: name.trim(), color })
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-white/10 dark:bg-white/5 dark:shadow-none dark:backdrop-blur-md"
    >
      <div className="flex flex-col gap-1">
        <label htmlFor="category-name" className="text-xs font-medium text-slate-500 dark:text-slate-300">
          Category name
        </label>
        <input
          id="category-name"
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g. Work"
          className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-fuchsia-400/60 focus:outline-none dark:border-white/10 dark:bg-white/5 dark:text-slate-100 dark:placeholder:text-slate-500"
        />
      </div>

      <div className="flex flex-col gap-1">
        <span className="text-xs font-medium text-slate-500 dark:text-slate-300">Color</span>
        <div role="group" aria-label="Color" className="flex flex-wrap gap-2">
          {CATEGORY_COLORS.map((swatch) => (
            <button
              key={swatch.hex}
              type="button"
              aria-label={swatch.name}
              aria-pressed={color === swatch.hex}
              onClick={() => setColor(swatch.hex)}
              className={`h-6 w-6 rounded-full ring-offset-2 ring-offset-transparent transition ${
                color === swatch.hex
                  ? 'ring-2 ring-slate-900 dark:ring-white'
                  : 'ring-1 ring-slate-300 dark:ring-white/20'
              }`}
              style={{ background: swatch.hex }}
            />
          ))}
        </div>
      </div>

      <div className="flex gap-2 pt-1">
        <button
          type="submit"
          className="rounded-lg bg-gradient-to-r from-violet-500 to-fuchsia-500 px-3 py-1.5 text-sm font-semibold text-white hover:opacity-90"
        >
          {submitLabel}
        </button>
        {onCancel && (
          <button
            type="button"
            onClick={onCancel}
            className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-100 dark:border-white/10 dark:text-slate-300 dark:hover:bg-white/5"
          >
            Cancel
          </button>
        )}
      </div>
    </form>
  )
}
