import { useEffect, useState } from 'react'
import { CategoryChip } from './components/CategoryChip'
import { CategoryForm } from './components/CategoryForm'

const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:4100'

async function parseErrorMessage(res) {
  try {
    const data = await res.json()
    return data?.error ?? `Request failed with status ${res.status}`
  } catch {
    return `Request failed with status ${res.status}`
  }
}

function App() {
  const [categories, setCategories] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [showCreateForm, setShowCreateForm] = useState(false)
  const [editingCategory, setEditingCategory] = useState(null)

  async function loadCategories() {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`${API_URL}/api/categories`)
      if (!res.ok) throw new Error(await parseErrorMessage(res))
      const data = await res.json()
      setCategories(data)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadCategories()
  }, [])

  async function handleCreate({ name, color }) {
    setError(null)
    try {
      const res = await fetch(`${API_URL}/api/categories`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, color }),
      })
      if (!res.ok) throw new Error(await parseErrorMessage(res))
      setShowCreateForm(false)
      await loadCategories()
    } catch (err) {
      setError(err.message)
    }
  }

  async function handleRename(id, { name, color }) {
    setError(null)
    try {
      const res = await fetch(`${API_URL}/api/categories/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, color }),
      })
      if (!res.ok) throw new Error(await parseErrorMessage(res))
      setEditingCategory(null)
      await loadCategories()
    } catch (err) {
      setError(err.message)
    }
  }

  async function handleDelete(category) {
    setError(null)
    try {
      const res = await fetch(`${API_URL}/api/categories/${category._id ?? category.id}`, {
        method: 'DELETE',
      })
      if (!res.ok) throw new Error(await parseErrorMessage(res))
      await loadCategories()
    } catch (err) {
      setError(err.message)
    }
  }

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_20%_0%,#241a3a_0%,#0f0f18_55%)] px-6 py-9 text-slate-100 sm:px-10">
      <header className="mb-7">
        <h1 className="bg-gradient-to-r from-violet-400 via-fuchsia-400 to-cyan-300 bg-clip-text text-3xl font-extrabold text-transparent">
          My Planner
        </h1>
        <p className="mt-1 text-sm text-slate-400">Here's what's glowing today.</p>
      </header>

      {error && (
        <p className="mb-4 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-300">
          Error: {error}
        </p>
      )}

      <section aria-label="Categories" className="mb-6">
        <div className="flex flex-wrap items-center gap-3">
          {loading && <p className="text-sm text-slate-400">Loading categories...</p>}
          {!loading &&
            categories.map((category) => (
              <CategoryChip
                key={category._id ?? category.id}
                category={category}
                onEdit={setEditingCategory}
                onDelete={handleDelete}
              />
            ))}
          <button
            type="button"
            onClick={() => {
              setEditingCategory(null)
              setShowCreateForm((v) => !v)
            }}
            className="rounded-full border border-dashed border-white/20 px-4 py-2 text-sm text-slate-300 hover:bg-white/5"
          >
            + Add category
          </button>
        </div>

        {showCreateForm && (
          <div className="mt-3 max-w-sm">
            <CategoryForm
              submitLabel="Add category"
              onSubmit={handleCreate}
              onCancel={() => setShowCreateForm(false)}
            />
          </div>
        )}

        {editingCategory && (
          <div className="mt-3 max-w-sm">
            <CategoryForm
              initialName={editingCategory.name}
              initialColor={editingCategory.color}
              submitLabel="Save"
              onSubmit={(values) => handleRename(editingCategory._id ?? editingCategory.id, values)}
              onCancel={() => setEditingCategory(null)}
            />
          </div>
        )}
      </section>

      <section className="rounded-2xl border border-white/10 bg-white/5 p-6 text-center text-slate-400 backdrop-blur-md">
        Agenda coming soon — your todos will show up here.
      </section>
    </main>
  )
}

export default App
