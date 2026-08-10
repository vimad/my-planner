import cors from 'cors'
import express, { type NextFunction, type Request, type Response } from 'express'
import { boardsRouter } from './routes/boards.ts'
import { categoriesRouter } from './routes/categories.ts'
import { noteFoldersRouter } from './routes/noteFolders.ts'
import { notesRouter } from './routes/notes.ts'
import { peopleRouter } from './routes/people.ts'
import { profilesRouter } from './routes/profiles.ts'
import { scratchNotesRouter } from './routes/scratchNotes.ts'
import { settingsRouter } from './routes/settings.ts'
import { teamMembershipsRouter } from './routes/teamMemberships.ts'
import { teamsRouter } from './routes/teams.ts'
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

  app.use('/api/boards', boardsRouter)
  app.use('/api/categories', categoriesRouter)
  app.use('/api/note-folders', noteFoldersRouter)
  app.use('/api/notes', notesRouter)
  app.use('/api/people', peopleRouter)
  app.use('/api/profiles', profilesRouter)
  app.use('/api/team-memberships', teamMembershipsRouter)
  app.use('/api/teams', teamsRouter)
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
