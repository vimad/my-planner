import { useCallback, useEffect, useState } from 'react'
import { boardItemKey, itemKey } from '../utils/boardItemKey'
import { getId } from '../utils/getId'
import type { Board, BoardItem, BoardItemType } from '../types'

const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:4100'

async function parseErrorMessage(res: Response): Promise<string> {
  try {
    const data = await res.json()
    return data?.error ?? `Request failed with status ${res.status}`
  } catch {
    return `Request failed with status ${res.status}`
  }
}

export interface UseBoardsResult {
  boards: Board[]
  loading: boolean
  error: string | null
  refreshBoards: () => Promise<void>
  createBoard: (name: string) => Promise<Board>
  renameBoard: (id: string, name: string) => Promise<Board>
  deleteBoard: (id: string) => Promise<void>
  // Whole-array items replace, covering add/remove/reorder in one PATCH -
  // exactly like linkedTodoIds (see the Boards spec). Optimistic: the local
  // board's items update immediately, then roll back to the pre-call items
  // if the PATCH fails.
  replaceItems: (id: string, items: BoardItem[]) => Promise<Board>
  addItem: (id: string, itemType: BoardItemType, itemId: string) => Promise<Board>
  removeItem: (id: string, itemType: BoardItemType, itemId: string) => Promise<Board>
}

// Single source of truth for a profile's boards - lifted out of BoardsView
// (ticket 14, .scratch/boards/issues/14-quick-add-icon-and-badge.md) so the
// quick-add icon (TodoItem/NotesView, siblings of BoardsView under App.tsx)
// and the Boards tab's toggle badge can read/mutate the same active board's
// item list without drifting out of sync with whatever BoardsView itself is
// showing. Every board mutation in the app - BoardsView's own
// rename/delete/reorder/remove-item, and the quick-add icon's add/remove -
// goes through this one hook, the same way todos/categories/folders are
// already owned by App.tsx (or a dedicated hook, per useActiveProfile) and
// threaded down as props rather than fetched redundantly per component.
export function useBoards(activeProfileId: string | null): UseBoardsResult {
  const [boards, setBoards] = useState<Board[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const loadBoards = useCallback(async (profileId: string) => {
    setError(null)
    try {
      const res = await fetch(`${API_URL}/api/boards?profileId=${encodeURIComponent(profileId)}`)
      if (!res.ok) throw new Error(await parseErrorMessage(res))
      setBoards(await res.json())
    } catch (err) {
      setError((err as Error).message)
    }
  }, [])

  const refreshBoards = useCallback(() => {
    return activeProfileId ? loadBoards(activeProfileId) : Promise.resolve()
  }, [activeProfileId, loadBoards])

  // Fetches (and re-fetches on every profile switch) the newly active
  // profile's boards - mirrors App.tsx's identical profile-keyed effect for
  // categories/todos/etc.
  useEffect(() => {
    if (!activeProfileId) return
    setLoading(true)
    loadBoards(activeProfileId).finally(() => setLoading(false))
  }, [activeProfileId, loadBoards])

  const createBoard = useCallback(
    async (name: string): Promise<Board> => {
      if (!activeProfileId) throw new Error('No active profile')
      setError(null)
      try {
        const res = await fetch(`${API_URL}/api/boards`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name, profileId: activeProfileId }),
        })
        if (!res.ok) throw new Error(await parseErrorMessage(res))
        const created: Board = await res.json()
        await loadBoards(activeProfileId)
        return created
      } catch (err) {
        setError((err as Error).message)
        throw err
      }
    },
    [activeProfileId, loadBoards],
  )

  const renameBoard = useCallback(
    async (id: string, name: string): Promise<Board> => {
      if (!activeProfileId) throw new Error('No active profile')
      setError(null)
      try {
        const res = await fetch(`${API_URL}/api/boards/${id}?profileId=${encodeURIComponent(activeProfileId)}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name }),
        })
        if (!res.ok) throw new Error(await parseErrorMessage(res))
        const updated: Board = await res.json()
        setBoards((prev) => prev.map((b) => (getId(b) === id ? updated : b)))
        return updated
      } catch (err) {
        setError((err as Error).message)
        throw err
      }
    },
    [activeProfileId],
  )

  const deleteBoard = useCallback(
    async (id: string): Promise<void> => {
      if (!activeProfileId) throw new Error('No active profile')
      setError(null)
      try {
        const res = await fetch(`${API_URL}/api/boards/${id}?profileId=${encodeURIComponent(activeProfileId)}`, {
          method: 'DELETE',
        })
        if (!res.ok) throw new Error(await parseErrorMessage(res))
        await loadBoards(activeProfileId)
      } catch (err) {
        setError((err as Error).message)
        throw err
      }
    },
    [activeProfileId, loadBoards],
  )

  const replaceItems = useCallback(
    async (id: string, items: BoardItem[]): Promise<Board> => {
      if (!activeProfileId) throw new Error('No active profile')
      const previousItems = boards.find((b) => getId(b) === id)?.items ?? []
      setBoards((prev) => prev.map((b) => (getId(b) === id ? { ...b, items } : b)))
      setError(null)
      try {
        const res = await fetch(`${API_URL}/api/boards/${id}?profileId=${encodeURIComponent(activeProfileId)}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ items }),
        })
        if (!res.ok) throw new Error(await parseErrorMessage(res))
        const updated: Board = await res.json()
        setBoards((prev) => prev.map((b) => (getId(b) === id ? updated : b)))
        return updated
      } catch (err) {
        setError((err as Error).message)
        setBoards((prev) => prev.map((b) => (getId(b) === id ? { ...b, items: previousItems } : b)))
        throw err
      }
    },
    [activeProfileId, boards],
  )

  // Convenience wrappers around replaceItems for the quick-add icon's two
  // actions (append one item / remove one item by key) - the icon itself
  // never needs to compute a whole next-items array by hand.
  const addItem = useCallback(
    (id: string, itemType: BoardItemType, itemId: string): Promise<Board> => {
      const board = boards.find((b) => getId(b) === id)
      const items = [...(board?.items ?? []), { itemType, itemId }]
      return replaceItems(id, items)
    },
    [boards, replaceItems],
  )

  const removeItem = useCallback(
    (id: string, itemType: BoardItemType, itemId: string): Promise<Board> => {
      const board = boards.find((b) => getId(b) === id)
      const targetKey = boardItemKey(itemType, itemId)
      const items = (board?.items ?? []).filter((existing) => itemKey(existing) !== targetKey)
      return replaceItems(id, items)
    },
    [boards, replaceItems],
  )

  return {
    boards,
    loading,
    error,
    refreshBoards,
    createBoard,
    renameBoard,
    deleteBoard,
    replaceItems,
    addItem,
    removeItem,
  }
}
