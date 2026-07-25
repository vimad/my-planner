import cors from 'cors'
import express from 'express'
import { categoriesRouter } from './routes/categories.js'
import { todosRouter } from './routes/todos.js'

export function createApp({ corsOrigin } = {}) {
  const app = express()

  app.use(cors({ origin: corsOrigin ?? '*' }))
  app.use(express.json())

  app.get('/health', (req, res) => {
    res.json({ status: 'ok' })
  })

  app.use('/api/categories', categoriesRouter)
  app.use('/api/todos', todosRouter)

  // Basic error handler.
  app.use((err, req, res, next) => {
    console.error(err)
    res.status(500).json({ error: 'Internal server error' })
  })

  return app
}
