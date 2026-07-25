import { Router } from 'express'
import { Test } from '../models/Test.js'

export const testRouter = Router()

// GET /api/test -> the single seeded document, e.g. { name: "vinod" }
testRouter.get('/', async (req, res, next) => {
  try {
    const doc = await Test.findOne().sort({ createdAt: 1 })

    if (!doc) {
      return res.status(404).json({ error: 'No test document found' })
    }

    res.json({ name: doc.name })
  } catch (err) {
    next(err)
  }
})
