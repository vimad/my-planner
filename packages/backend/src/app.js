import cors from 'cors'
import express from 'express'
import { testRouter } from './routes/test.js'

export function createApp({ corsOrigin } = {}) {
  const app = express()

  app.use(cors({ origin: corsOrigin ?? '*' }))
  app.use(express.json())

  app.get('/health', (req, res) => {
    res.json({ status: 'ok' })
  })

  app.use('/api/test', testRouter)

  // Basic error handler.
  app.use((err, req, res, next) => {
    console.error(err)
    res.status(500).json({ error: 'Internal server error' })
  })

  return app
}
