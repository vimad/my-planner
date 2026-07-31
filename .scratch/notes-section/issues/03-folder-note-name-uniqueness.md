Type: grilling
Status: claimed

## Question

Must folder names be unique among their siblings (same `parentId`), and must note names be unique within their containing folder (same `folderId`)? Or can two folders/notes share a name as long as they're not literally the same document?

## Answer

No enforced uniqueness, for either folders or notes. Two folders (or two notes) may share a name as long as they're different documents — matching the existing app-wide convention: nothing else here (Category names, Todo titles, ScratchNote content) enforces name uniqueness at the schema or route level. Adding it here would be new, inconsistent friction, would require deciding a collision-handling UX (reject vs. auto-suffix) nothing asked for, and the unified tree view already disambiguates same-named items visually by nesting/position.

Status: resolved.
