Type: grilling
Status: resolved

## Question

What is the "Notes" feature's relationship to the existing Scratchpad, and what's the minimal data model — folder hierarchy shape, note fields, delete/order/move semantics, and scope boundaries — needed before any UI can be designed?

## Answer

**Relationship to Scratchpad.** Notes is a wholly separate, coexisting concept — not a replacement, evolution, or merge of Scratchpad. Scratchpad stays "quick capture → triage → promote or discard" (`ScratchNote`). Notes is "durable, named, organized documents" with no promotion/completion lifecycle at all.

**Note fields (kept deliberately minimal).** `name`, rich-text `body` (same Tiptap JSON shape `RichTextEditor` already uses), `folderId` (nullable — a note may live at the root, outside any folder), `profileId` (scoped like every other entity in this app), `createdAt`/`updatedAt`. No priority, tags, due dates, recurrence, category, or completion — those are Todo-specific and don't map onto this concept. The same minimalism extends to Folder: `name`, `parentId` (nullable, for root-level folders), `profileId`, timestamps — no color/icon/metadata beyond that.

**Folder hierarchy shape.** Unlimited nesting depth via a self-referencing `parentId` (folders inside folders inside folders). Notes may exist directly at the root with no folder required — not forced into an "Uncategorized"-style catch-all.

**Deleting a folder.** Cascades — deletes everything nested inside it, recursively (notes and sub-folders). Gated behind the app's existing `requestConfirm` pattern, but with the confirm message stating the count of what's being destroyed (e.g. "Delete 'Recipes' and everything in it — 4 notes, 2 folders?"), not just a bare "delete this folder?".

**Ordering.** Alphabetical within a folder, no manual/custom ordering and no persisted `order` field. Folders/nesting already provide organizational control, so manual ordering on top of that was judged redundant for a "small notes section."

**Moving a note or folder.** A simple "move to folder" picker (a dropdown/modal listing the folder tree — pick a destination, confirm) reassigns `folderId`/`parentId`. No drag-and-drop for v1 — meaningfully bigger UI-engineering lift (drop targets at every tree depth, touch support) with no forcing need yet; can be layered on later if the picker feels clunky.

**Explicitly out of scope** (see map's Out of scope section): converting/promoting a Note into a Todo, multi-user collaboration/sharing, version history/revision tracking, and search over Notes (neither participating in the existing todo search box nor a new one — browse-by-folder is enough for now).

**Not decided here** (left to a later ticket): whether folder/note names must be unique within their parent.

Status: resolved.
