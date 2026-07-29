import cors from 'cors'
import express, { type NextFunction, type Request, type Response } from 'express'
import { categoriesRouter } from './routes/categories.ts'
import { scratchNotesRouter } from './routes/scratchNotes.ts'
import { settingsRouter } from './routes/settings.ts'
import { todosRouter } from './routes/todos.ts'

interface CreateAppOptions {
  corsOrigin?: string
}

export function createApp({ corsOrigin }: CreateAppOptions = {}) {
  const app = express()

  app.use(cors({ origin: corsOrigin ?? '*' }))
  app.use(express.json())

  app.get('/health', (req: Request, res: Response) => {
    res.json({ status: 'ok' })
  })

  app.use('/api/categories', categoriesRouter)
  app.use('/api/todos', todosRouter)
  app.use('/api/scratch-notes', scratchNotesRouter)
  app.use('/api/settings', settingsRouter)

  // Basic error handler.
  app.use((err: unknown, req: Request, res: Response, next: NextFunction) => {
    console.error(err)
    res.status(500).json({ error: 'Internal server error' })
  })

  return app
}
