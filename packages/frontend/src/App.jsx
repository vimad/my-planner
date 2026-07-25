import { useEffect, useState } from 'react'
import './App.css'

const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:4100'

function App() {
  const [value, setValue] = useState(null)
  const [error, setError] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false

    fetch(`${API_URL}/api/test`)
      .then((res) => {
        if (!res.ok) throw new Error(`Request failed with status ${res.status}`)
        return res.json()
      })
      .then((data) => {
        if (!cancelled) setValue(data)
      })
      .catch((err) => {
        if (!cancelled) setError(err.message)
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [])

  return (
    <main className="app">
      <h1>My Planner</h1>
      <p className="subtitle">Frontend + Backend + MongoDB scaffold</p>

      <div className="card" data-testid="result-card">
        {loading && <p>Loading...</p>}
        {!loading && error && <p className="error">Error: {error}</p>}
        {!loading && !error && (
          <p>
            Value from database: <strong>{value?.name}</strong>
          </p>
        )}
      </div>
    </main>
  )
}

export default App
