import 'dotenv/config'
import { createApp } from './app.ts'
import { connectDB } from './config/db.ts'
import { seedUncategorizedCategory } from './seed.ts'

const PORT = process.env.PORT ?? 4100
const MONGODB_URI = process.env.MONGODB_URI ?? 'mongodb://localhost:27017/my-planner'
const CORS_ORIGIN = process.env.CORS_ORIGIN ?? '*'

async function main() {
  await connectDB(MONGODB_URI)
  console.log(`Connected to MongoDB at ${MONGODB_URI}`)

  await seedUncategorizedCategory()

  const app = createApp({ corsOrigin: CORS_ORIGIN })

  app.listen(PORT, () => {
    console.log(`Backend listening on http://localhost:${PORT}`)
  })
}

main().catch((err) => {
  console.error('Failed to start server:', err)
  process.exit(1)
})
