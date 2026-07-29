// PROTOTYPE — throwaway mock data for the "View Modes" wayfinder ticket. Wipe me.

export type Priority = 'High' | 'Medium' | 'Low'

export interface Category {
  id: string
  name: string
  color: string
}

export interface Todo {
  id: number
  title: string
  categoryId: string
  priority: Priority
  dueDate: string | null
  tags: string[]
  completed: boolean
}

const today = new Date()
const localIso = (d: Date): string =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
const iso = (offsetDays: number): string => {
  const d = new Date(today)
  d.setDate(d.getDate() + offsetDays)
  return localIso(d)
}

export const TODAY_ISO = iso(0)

export const categories: Category[] = [
  { id: 'work', name: 'Work', color: '#4361ee' },
  { id: 'personal', name: 'Personal', color: '#e85d75' },
  { id: 'side-project', name: 'Side Project', color: '#8338ec' },
  { id: 'home', name: 'Home', color: '#2a9d8f' },
  { id: 'uncategorized', name: 'Uncategorized', color: '#94a3b8' },
]

export const todos: Todo[] = [
  { id: 1, title: 'Ship Q3 roadmap deck', categoryId: 'work', priority: 'High', dueDate: iso(0), tags: ['urgent'], completed: false },
  { id: 2, title: 'Review PR #482', categoryId: 'work', priority: 'Medium', dueDate: iso(0), tags: [], completed: false },
  { id: 3, title: '1:1 notes follow-up', categoryId: 'work', priority: 'Low', dueDate: iso(3), tags: ['waiting-on-someone'], completed: false },
  { id: 4, title: 'Renew passport', categoryId: 'personal', priority: 'High', dueDate: iso(1), tags: [], completed: false },
  { id: 5, title: 'Book dentist appointment', categoryId: 'personal', priority: 'Low', dueDate: null, tags: [], completed: false },
  { id: 6, title: 'Reply to Sarah re: trip', categoryId: 'personal', priority: 'Medium', dueDate: iso(0), tags: [], completed: true },
  { id: 7, title: 'Set up CI for planner app', categoryId: 'side-project', priority: 'High', dueDate: iso(2), tags: ['urgent'], completed: false },
  { id: 8, title: 'Pick rich text editor', categoryId: 'side-project', priority: 'High', dueDate: iso(0), tags: [], completed: true },
  { id: 9, title: 'Sketch dashboard layout', categoryId: 'side-project', priority: 'Medium', dueDate: null, tags: [], completed: false },
  { id: 10, title: 'Fix leaking faucet', categoryId: 'home', priority: 'Medium', dueDate: iso(-1), tags: [], completed: false },
  { id: 11, title: 'Order groceries', categoryId: 'home', priority: 'Low', dueDate: iso(0), tags: [], completed: false },
  { id: 12, title: 'Water the plants', categoryId: 'home', priority: 'Low', dueDate: iso(7), tags: [], completed: true },
  { id: 13, title: 'Random idea from a call', categoryId: 'uncategorized', priority: 'Medium', dueDate: null, tags: [], completed: false },
]

export const categoryCounts = (categoryId: string): { remaining: number; completed: number } => {
  const inCategory = todos.filter((t) => t.categoryId === categoryId)
  return {
    remaining: inCategory.filter((t) => !t.completed).length,
    completed: inCategory.filter((t) => t.completed).length,
  }
}

export const categoryById: Record<string, Category> = Object.fromEntries(categories.map((c) => [c.id, c]))

export const isDueToday = (dueDate: string | null): boolean => dueDate === TODAY_ISO

export const priorityOrder: Record<Priority, number> = { High: 0, Medium: 1, Low: 2 }
export const priorityColor: Record<Priority, string> = { High: '#e63946', Medium: '#f4a261', Low: '#2a9d8f' }
