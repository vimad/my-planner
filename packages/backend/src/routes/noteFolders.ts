import { Router, type NextFunction, type Request, type Response } from 'express'
import type { Types } from 'mongoose'
import { Note } from '../models/Note.ts'
import { NoteFolder } from '../models/NoteFolder.ts'
import { requireProfileId } from '../utils/profileScope.ts'

export const noteFoldersRouter = Router()

// Request body shape for create/update — client-supplied and unvalidated,
// so fields are optional here even though the model requires `name`; the
// handlers below enforce presence before writing. `parentId` is nullable
// (root-level) throughout, so `null` is a meaningful value distinct from
// `undefined` ("not supplied") wherever it appears below.
interface NoteFolderBody {
  name?: string
  parentId?: string | null
  profileId?: string
}

// Breadth-first walk down `parentId` from `rootId`, collecting the id of
// every folder in the subtree (including `rootId` itself). Used by DELETE's
// cascade below and by the reparent-cycle guard in PATCH - a small,
// unbounded-depth loop rather than a single query, since Mongo has no
// recursive "descendants of" primitive to lean on here. Scoped to
// `profileId` throughout - belt-and-suspenders alongside the parentId
// ownership checks below, so even a bad cross-profile reference couldn't
// make this wander into another profile's folders.
async function collectFolderIdsInSubtree(
  rootId: Types.ObjectId | string,
  profileId: Types.ObjectId | string,
): Promise<(Types.ObjectId | string)[]> {
  const allIds: (Types.ObjectId | string)[] = [rootId]
  let frontier: (Types.ObjectId | string)[] = [rootId]

  while (frontier.length > 0) {
    const children = await NoteFolder.find({ parentId: { $in: frontier }, profileId }, { _id: 1 })
    const childIds = children.map((child) => child._id)
    if (childIds.length === 0) break
    allIds.push(...childIds)
    frontier = childIds
  }

  return allIds
}

// POST /api/note-folders -> create a folder, attached to the given
// profileId. profileId is required in the body (not resolved server-side) -
// same reasoning as POST /api/categories: there's no server-side "active
// profile" concept, so the client is the only party that has it in hand.
noteFoldersRouter.post(
  '/',
  async (req: Request<Record<string, never>, unknown, NoteFolderBody>, res: Response, next: NextFunction) => {
    try {
      const { name } = req.body

      if (!name) {
        return res.status(400).json({ error: 'name is required' })
      }

      const profileId = requireProfileId(req.body.profileId, res)
      if (!profileId) return

      const parentId = req.body.parentId ?? null

      // A non-null parentId must resolve to a folder owned by this same
      // profile - 404, not 403 (same convention as the profileId ownership
      // checks below), so a cross-profile id doesn't get silently linked in
      // as a parent.
      if (parentId !== null) {
        const parentFolder = await NoteFolder.findOne({ _id: parentId, profileId })
        if (!parentFolder) {
          return res.status(404).json({ error: 'Parent folder not found' })
        }
      }

      const folder = await NoteFolder.create({ name, parentId, profileId })
      res.status(201).json(folder)
    } catch (err) {
      next(err)
    }
  },
)

// GET /api/note-folders?profileId=... -> lists all of a profile's folders,
// flat - the client assembles the tree from `parentId`. profileId is
// required so a caller can never accidentally see another profile's folders
// by omitting it.
noteFoldersRouter.get('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const profileId = requireProfileId(req.query.profileId, res)
    if (!profileId) return

    const folders = await NoteFolder.find({ profileId }).sort({ createdAt: 1 })
    res.json(folders)
  } catch (err) {
    next(err)
  }
})

// PATCH /api/note-folders/:id?profileId=... -> rename and/or reparent
// (`parentId`, `null` to move to root) a folder. profileId is required and
// checked against the folder's own profileId (404, not 403, so a mismatch
// reveals nothing about whether the id exists under a different profile) -
// mirrors PATCH /api/categories/:id.
noteFoldersRouter.patch(
  '/:id',
  async (
    req: Request<{ id: string }, unknown, NoteFolderBody, { profileId?: string }>,
    res: Response,
    next: NextFunction,
  ) => {
    try {
      const profileId = requireProfileId(req.query.profileId, res)
      if (!profileId) return

      const { name, parentId } = req.body

      // A non-null parentId must resolve to a folder owned by this same
      // profile (same 404-not-403 convention as the profileId check above),
      // and it must not be this folder's own id or one of its descendants -
      // otherwise collectFolderIdsInSubtree's BFS walk above would loop
      // forever the next time this folder gets deleted.
      if (parentId !== undefined && parentId !== null) {
        const parentFolder = await NoteFolder.findOne({ _id: parentId, profileId })
        if (!parentFolder) {
          return res.status(404).json({ error: 'Parent folder not found' })
        }

        const descendantIds = await collectFolderIdsInSubtree(req.params.id, profileId)
        if (descendantIds.some((id) => id.toString() === parentId.toString())) {
          return res.status(400).json({ error: 'Cannot move a folder into itself or one of its own descendants' })
        }
      }

      const update: NoteFolderBody = {}
      if (name !== undefined) update.name = name
      if (parentId !== undefined) update.parentId = parentId

      const folder = await NoteFolder.findOneAndUpdate({ _id: req.params.id, profileId }, update, {
        returnDocument: 'after',
      })

      if (!folder) {
        return res.status(404).json({ error: 'Note folder not found' })
      }

      res.json(folder)
    } catch (err) {
      next(err)
    }
  },
)

// DELETE /api/note-folders/:id?profileId=... -> cascades: recursively
// deletes every descendant folder and every note inside this folder or any
// descendant, mirroring the cascade pattern in DELETE /api/profiles/:id
// (collect the affected ids, `deleteMany` on them, then delete the target
// itself). profileId is required and checked against the folder's own
// profileId, same reasoning as PATCH above.
noteFoldersRouter.delete(
  '/:id',
  async (req: Request<{ id: string }, unknown, unknown, { profileId?: string }>, res: Response, next: NextFunction) => {
    try {
      const profileId = requireProfileId(req.query.profileId, res)
      if (!profileId) return

      const folder = await NoteFolder.findOne({ _id: req.params.id, profileId })

      if (!folder) {
        return res.status(404).json({ error: 'Note folder not found' })
      }

      const folderIds = await collectFolderIdsInSubtree(folder._id, profileId)

      await Note.deleteMany({ folderId: { $in: folderIds } })
      await NoteFolder.deleteMany({ _id: { $in: folderIds } })

      res.status(204).end()
    } catch (err) {
      next(err)
    }
  },
)
