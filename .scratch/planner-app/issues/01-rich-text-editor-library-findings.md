# Rich-text editor library: research findings

## Question

Which rich-text editor library should `my-planner` use for two use cases — todo body text and scratch notes — given the frontend stack (React 19.2.7 + Vite 8.1.5, RTL 16 / Vitest 4)?

Requirements evaluated for every candidate:

1. **Features**: bullet lists, numbered lists, bold/italic/basic inline styling, checklists with **nested** sub-tasks and interactive checkboxes, headings, links — noting what's built-in vs. an extra package, and whether nesting is real (not flat-only).
2. **Free/OSS, maintained, popular, modern**: actual license, last release date, release cadence, npm weekly downloads, GitHub stars/open issues.
3. **React 19 + Vite compatibility**: peerDependencies ranges, known React 19 issues.
4. **Same-data-format view/edit split**: a clean read-only render path and a separate edit path that consume the *same* stored document, not two independent renderers that can drift.
5. **Approximate bundle size** for core + the minimum plugins needed to hit the feature list.

All figures below were pulled directly from npm's registry API, the npm downloads API, GitHub's REST API, Bundlephobia, and each project's own docs/README — not secondary blog posts. Fetch date for all "current" figures: **2026-07-25**.

---

## Tiptap

**Maintenance / popularity.** Latest `@tiptap/react` / `@tiptap/core` version is **3.29.0**, published **2026-07-24** ([registry.npmjs.org/@tiptap/react/latest](https://registry.npmjs.org/@tiptap/react/latest)). Release cadence is fast — 5 releases in the two and a half weeks before that (v3.27.2 → v3.29.0, 2026-07-06 to 2026-07-24) per the GitHub Releases API ([api.github.com/repos/ueberdosis/tiptap/releases](https://api.github.com/repos/ueberdosis/tiptap/releases)). GitHub repo: **37,775 stars**, 828 open issues, MIT license, last push 2026-07-24 ([api.github.com/repos/ueberdosis/tiptap](https://api.github.com/repos/ueberdosis/tiptap)). npm weekly downloads: **@tiptap/core ≈ 15.5M**, **@tiptap/react ≈ 12.3M** (week of 2026-07-18–24, [api.npmjs.org/downloads/point/last-week/@tiptap/core](https://api.npmjs.org/downloads/point/last-week/@tiptap/core), [.../@tiptap/react](https://api.npmjs.org/downloads/point/last-week/@tiptap/react)).

**License.** MIT, confirmed via the GitHub API `license.spdx_id` field.

**React 19 compatibility.** `@tiptap/react@3.29.0` peerDependencies: `"react": "^17.0.0 || ^18.0.0 || ^19.0.0"`, `"react-dom": "^17.0.0 || ^18.0.0 || ^19.0.0"` ([registry.npmjs.org/@tiptap/react/latest](https://registry.npmjs.org/@tiptap/react/latest)) — explicit, first-class React 19 support in the peer range, no shimming needed.

**Features.**
- Bold/italic/strike/code, headings, blockquote, bullet list, ordered list, links, undo/redo are all bundled in `@tiptap/starter-kit` out of the box, including `Link` ("New in v3") ([tiptap.dev/docs/editor/extensions/functionality/starterkit](https://tiptap.dev/docs/editor/extensions/functionality/starterkit)).
- **Checklists are not in StarterKit.** They require the separate `@tiptap/extension-list` package (v3 consolidated the old `@tiptap/extension-task-list` + `@tiptap/extension-task-item` into one package with `./task-list` and `./task-item` sub-exports; confirmed via `registry.npmjs.org/@tiptap/extension-list/latest`, which lists `./bullet-list`, `./ordered-list`, `./task-list`, `./task-item` exports).
- **Nested checklist items are supported**, explicitly via a config flag: `TaskItem.configure({ nested: true })` ([tiptap.dev/docs/editor/extensions/nodes/task-item](https://tiptap.dev/docs/editor/extensions/nodes/task-item)).

**View/edit mode.** Same ProseMirror-based `Editor` instance/JSON doc for both. Read-only is a boolean flag on the *same* editor: `new Editor({ content, extensions, editable: false })` at init, or `editor.setEditable(false)` at runtime — "Both approaches preserve your document content and formatting—they simply prevent user modifications" ([tiptap.dev/docs/editor/api/editor](https://tiptap.dev/docs/editor/api/editor)). There's no separate "renderer" component; the same editor renders the same JSON/HTML doc, just non-editable, which directly satisfies the "same underlying format, no drift" requirement.

**Bundle size (Bundlephobia, minified+gzip unless noted).** `@tiptap/starter-kit`: 347,108 B raw / 108,993 B gzip. `@tiptap/react`: 25,483 B raw / 7,504 B gzip. `@tiptap/extension-list` (adds checklist + nesting): 1,111,416 B unpacked (npm registry `dist.unpackedSize`, not a Bundlephobia gzip figure — Bundlephobia doesn't index this exact package name reliably; treat as an upper bound). Practical estimate for starter-kit + react + list ≈ **120–140 KB gzip**. Sources: [bundlephobia.com/package/@tiptap/starter-kit](https://bundlephobia.com/package/@tiptap/starter-kit), [bundlephobia.com/package/@tiptap/react](https://bundlephobia.com/package/@tiptap/react), [registry.npmjs.org/@tiptap/extension-list/latest](https://registry.npmjs.org/@tiptap/extension-list/latest).

---

## Lexical

**Maintenance / popularity.** Latest `lexical` / `@lexical/react` version is **0.48.0**, published **2026-07-16** ([registry.npmjs.org/lexical/latest](https://registry.npmjs.org/lexical/latest); date via [api.github.com/repos/facebook/lexical/releases](https://api.github.com/repos/facebook/lexical/releases)). Cadence is roughly monthly-to-biweekly (v0.45.0 2026-05-28 → v0.46.0 2026-06-26 → v0.47.0 2026-07-09 → v0.48.0 2026-07-16). GitHub repo: **23,707 stars**, 344 open issues, MIT license, last push 2026-07-24 ([api.github.com/repos/facebook/lexical](https://api.github.com/repos/facebook/lexical)). npm weekly downloads: **lexical ≈ 4.47M** (week of 2026-07-18–24, [api.npmjs.org/downloads/point/last-week/lexical](https://api.npmjs.org/downloads/point/last-week/lexical)). Backed by Meta.

**License.** MIT, confirmed via the GitHub API `license.spdx_id` field.

**React 19 compatibility.** Core `lexical` package has **no** React peer dependency at all (it's framework-agnostic) — its only peerDependency is `"typescript": ">=5.2"` (optional) ([registry.npmjs.org/lexical/latest](https://registry.npmjs.org/lexical/latest)). `@lexical/react@0.48.0` peerDependencies: `"react": ">=18.x"`, `"react-dom": ">=18.x"`, `"yjs": ">=13.5.22"`, `"typescript": ">=5.2"` ([registry.npmjs.org/@lexical/react/latest](https://registry.npmjs.org/@lexical/react/latest)) — open-ended lower bound, so React 19 is covered. Community search confirms "React 18 is now the minimum supported version... If you are already on React 18 or 19, no changes are required" (per Lexical's own release notes, surfaced via GitHub search of facebook/lexical).

**Features.**
- Rich text (bold/italic/etc.), headings, links are covered by `@lexical/rich-text` and `@lexical/link` — all separate composable packages (Lexical's core has *no* built-in nodes at all; everything is a plugin/package, though the official ones are first-party and documented, unlike Slate where you write the schema yourself).
- Lists + checklists: `@lexical/list` exports `ListNode`/`ListItemNode`, and a `CheckListExtension` "provides checklist support for ListNode and ListItemNode" ([lexical.dev/docs/api/modules/lexical_list](https://lexical.dev/docs/api/modules/lexical_list)). A `ListItemNode` can be a checkbox with `.getChecked()`; **nested lists are natively modeled** — "if the ListNode is nested in a ListItemNode..." — and the theme exposes distinct classes for nested checked/unchecked items, confirming nested checklist items are a supported, built-in scenario, not a hack.

**View/edit mode.** Same `LexicalEditor` + same serialized `EditorState` for both; the only difference is the `contentEditable` DOM attribute. Per Lexical's own docs: "the main implementation detail is that the `contentEditable` is being set to `false` or `true` depending on the mode... The underlying editor state and serialized content remain unchanged; only the ability to edit is toggled" ([lexical.dev/docs/concepts/read-only](https://lexical.dev/docs/concepts/read-only)). Set via `editable: false` in `createEditor()`/`LexicalComposer` init, or `editor.setEditable(false)` at runtime. This is architecturally identical in spirit to Tiptap's approach — one editor, one state, a boolean toggle — directly satisfying the no-drift requirement.

**Bundle size (Bundlephobia).** `lexical` core: 170,690 B raw / 53,987 B gzip ([bundlephobia.com/package/lexical](https://bundlephobia.com/package/lexical)). `@lexical/react` could not be retrieved from Bundlephobia's API in this session (422 error); expect a similarly modest addition given it's mostly React bindings + plugin wrappers. Practical estimate for lexical + react bindings + rich-text + list + link ≈ **90–120 KB gzip** (extrapolated from core size plus several small satellite packages; not independently confirmed per-package here).

---

## BlockNote

**Maintenance / popularity.** Latest `@blocknote/react` version is **0.52.1**, published **2026-07-20** ([registry.npmjs.org/@blocknote/react/latest](https://registry.npmjs.org/@blocknote/react/latest); date via [api.github.com/repos/TypeCellOS/BlockNote/releases](https://api.github.com/repos/TypeCellOS/BlockNote/releases)). Cadence: v0.51.2 (2026-05-20) → v0.51.3 (05-26) → v0.51.4 (06-02) → v0.52.0/v0.52.1 (07-20, same day) — roughly biweekly to monthly, with v0.52.0 being "a significant architectural shift, decoupling Yjs from the core library and migrating to Vite" per its own release notes. GitHub repo: **10,011 stars**, 204 open issues ([api.github.com/repos/TypeCellOS/BlockNote](https://api.github.com/repos/TypeCellOS/BlockNote)). npm weekly downloads: **@blocknote/react ≈ 457,376** (week of 2026-07-18–24, [api.npmjs.org/downloads/point/last-week/@blocknote/react](https://api.npmjs.org/downloads/point/last-week/@blocknote/react)) — smallest download footprint of the five.

**License.** GitHub's API reports `license.spdx_id: "NOASSERTION"` (auto-detection failed because BlockNote splits licenses). BlockNote's own README states: "The majority of BlockNote is licensed under the **MPL-2.0** license, which allows you to use BlockNote in commercial (and closed-source) applications," while "the XL packages (`@blocknote/xl-*`, e.g. PDF/DOCX export) are licensed under **GPL-3.0**" (via GitHub search of TypeCellOS/BlockNote README/CLA). The core `@blocknote/core`/`@blocknote/react`/UI packages needed for this app's feature set are MPL-2.0 — free and OSS, but MPL-2.0 is copyleft-per-file (modifications to BlockNote's own source files must be published), which is a materially different, stricter license than the other candidates' MIT.

**React 19 compatibility.** `@blocknote/react@0.52.1` peerDependencies: `"react": "^18.0 || ^19.0 || >= 19.0.0-rc"`, `"react-dom": "^18.0 || ^19.0 || >= 19.0.0-rc"` ([registry.npmjs.org/@blocknote/react/latest](https://registry.npmjs.org/@blocknote/react/latest)) — explicit React 19 support.

**Features.** BlockNote is block-based (Notion-style), built on Prosemirror and Tiptap. Built-in block types include Paragraph, Heading, Quote, Bullet List Item, Numbered List Item, **Check List Item**, Toggle List Item, Code Block, Table, File, Image, Video, Audio — all part of the default schema with no extra packages ([www.blocknotejs.org/docs/features/blocks](https://www.blocknotejs.org/docs/features/blocks)). Every block type, including `checkListItem`, has a `children: Block[]` field in its type definition, and BlockNote's document model is a tree of blocks where "a block contains a piece of content and optionally nested (child) blocks" ([www.blocknotejs.org/docs/editor-basics/document-structure](https://www.blocknotejs.org/docs/editor-basics/document-structure)) — so **nested checklists are structurally supported** (a checkListItem block can contain child checkListItem blocks), consistent with how nesting works for every other block type in BlockNote. Links are supported as inline content. Bold/italic are default inline styles.

**View/edit mode.** Same `Block[]` JSON document for both modes; `<BlockNoteView editor={editor} editable={false} />` renders the identical editor/document read-only, hiding the editing toolbar/side menus — "editable: Whether the editor should be editable" ([www.blocknotejs.org/docs/editor-basics/setup](https://www.blocknotejs.org/docs/editor-basics/setup) via docs search). Same pattern as Tiptap (which it's built on): one editor instance, one document, boolean toggle.

**Bundle size (Bundlephobia).** `@blocknote/core`: 575,138 B raw / 173,234 B gzip. `@blocknote/react`: 777,992 B raw / 230,759 B gzip. `@blocknote/mantine` (default UI theme components, needed to actually render toolbars/menus for edit mode): 773,039 B raw / 229,377 B gzip. Sources: [bundlephobia.com/package/@blocknote/core](https://bundlephobia.com/package/@blocknote/core), [bundlephobia.com/package/@blocknote/react](https://bundlephobia.com/package/@blocknote/react), [bundlephobia.com/package/@blocknote/mantine](https://bundlephobia.com/package/@blocknote/mantine). Minimum viable stack (core + react + a UI package) is roughly **400–460 KB gzip** — by far the largest of the candidates, because it ships a full Notion-style block UI (drag handles, slash menu, side menus) that this app's requirements don't ask for.

---

## Plate (`platejs`, formerly `@udecode/plate`)

**Naming note.** The project renamed its main npm package from `@udecode/plate` to **`platejs`**; `@udecode/plate` is now the legacy/lagging package (latest **49.0.0**, unpublished-in-spirit) while `platejs` is current (latest **53.2.4**, per [registry.npmjs.org/platejs/latest](https://registry.npmjs.org/platejs/latest), vs. [registry.npmjs.org/@udecode/plate/latest](https://registry.npmjs.org/@udecode/plate/latest)). Docs confirm: "Server-only environments use base package imports like `platejs`..." ([platejs.org/docs/installation](https://platejs.org/docs/installation)).

**Maintenance / popularity.** Latest release **v53.3.2**, published **2026-07-03** ([api.github.com/repos/udecode/plate/releases](https://api.github.com/repos/udecode/plate/releases)), with v53.2.3 → v53.3.2 all landing 2026-06-27 to 2026-07-03 — a rapid, multi-release-per-week cadence typical of a monorepo shipping many packages together. GitHub repo: **16,444 stars**, only **14 open issues** (notably low, suggesting either very tight issue triage or a smaller surface area) ([api.github.com/repos/udecode/plate](https://api.github.com/repos/udecode/plate)). npm weekly downloads: **platejs ≈ 321,526**, legacy `@udecode/plate` ≈ 164,636 (week of 2026-07-18–24; [api.npmjs.org/downloads/point/last-week/platejs](https://api.npmjs.org/downloads/point/last-week/platejs), [.../@udecode/plate](https://api.npmjs.org/downloads/point/last-week/@udecode/plate)) — combined, still well below Tiptap/Lexical/Slate.

**License.** MIT (confirmed by fetching `raw.githubusercontent.com/udecode/plate/main/LICENSE`, and by the README's MIT badge).

**React 19 compatibility.** `platejs@53.2.4` peerDependencies: `"react": ">=18.0.0"`, `"react-dom": ">=18.0.0"` ([registry.npmjs.org/platejs/latest](https://registry.npmjs.org/platejs/latest)) — open lower bound, React 19 compatible.

**Features.** Plate is a plugin framework on top of Slate (see below — Plate's own README states "Core: This is the heart of Plate. It's a special plugin system just for `slate-react`", and the docs have a dedicated ["Slate" API page](https://platejs.org/docs/api/slate) plus a `@platejs/slate` "framework-free Slate layer" package, confirming Plate still depends on Slate's document model under a wrapper). Lists/checklists live in the separate `@platejs/list` package, which itself "depends on the [`@platejs/indent`] Indent plugin" for nesting — "Transform any block type... into list items through indentation" (via docs search of platejs.org/docs/list). **Nested checklists are supported but achieved generically through the indent system** shared with all list types, rather than a checklist-specific nesting primitive — functionally sufficient, but a level of indirection beyond Tiptap's dedicated `nested: true` flag or BlockNote's native block-tree children. Headings, bold/italic, links are covered by `@platejs/basic-nodes` and similar first-party packages, all separate from the `platejs` core.

**View/edit mode.** Plate has a dedicated static/read-only renderer, `<PlateStatic>`, described as "a fast, read-only React component for rendering Plate content" that is "recommended" for "purely server-rendered, non-interactive content" and offers "a smaller bundle size as it omits interactive editor code" ([platejs.org/docs/static](https://platejs.org/docs/static)). Both the editable `<Plate>` and `<PlateStatic>` are built from the same `createSlateEditor({ plugins, value })` call and the same `value` (an array of Slate `Descendant` nodes) — i.e., same underlying JSON document, but rendered through **two distinct component/rendering code paths** rather than one editor with an `editable` toggle. This is architecturally different from Tiptap/Lexical/BlockNote (same component, same instance, boolean flag) — Plate deliberately maintains a second, separate renderer for performance, which is defensible but does introduce two code paths that consume the same data format rather than one path with a flag, so it needs the same discipline (keep node schemas/plugins in sync between the two) to avoid visual drift.

**Bundle size (Bundlephobia).** `platejs` core: 313,276 B raw / 95,126 B gzip ([bundlephobia.com/package/platejs](https://bundlephobia.com/package/platejs)). Additional `@platejs/list`, `@platejs/indent`, `@platejs/basic-nodes`, `@platejs/link`, plus `slate`/`slate-react`/`slate-dom` as transitive peer deps, would add meaningfully on top; a full estimate for the minimum feature set is likely in the **150–200 KB gzip** range (not independently itemized per sub-package in this session).

---

## Slate (substrate for Plate — evaluated independently)

**Maintenance / popularity.** Latest `slate` / `slate-react` version is **0.126.0** ([registry.npmjs.org/slate/latest](https://registry.npmjs.org/slate/latest), [registry.npmjs.org/slate-react/latest](https://registry.npmjs.org/slate-react/latest)). Recent release history across the monorepo (`slate`, `slate-react`, `slate-dom`, `slate-hyperscript`) is steady: slate@0.123.0/0.124.0 (2026-03-24), slate@0.124.1 (2026-04-11), slate-react@0.124.2 (2026-05-14), slate-hyperscript@0.125.0 (2026-05-30), slate-react@0.125.1 (2026-06-30) ([api.github.com/repos/ianstormtaylor/slate/releases](https://api.github.com/repos/ianstormtaylor/slate/releases)) — roughly one release every 2–4 weeks, "actively maintained," not abandoned. GitHub repo: **31,728 stars**, 649 open issues, MIT license, last push 2026-07-20 ([api.github.com/repos/ianstormtaylor/slate](https://api.github.com/repos/ianstormtaylor/slate)). Note the repo still self-describes as "**Currently in beta**" in its GitHub description — after ~9 years, Slate has never reached a 1.0. npm weekly downloads: **slate-react ≈ 2.48M** (week of 2026-07-18–24, [api.npmjs.org/downloads/point/last-week/slate-react](https://api.npmjs.org/downloads/point/last-week/slate-react)) — high, but this includes downloads pulled in transitively by Plate itself.

**License.** MIT, confirmed via the GitHub API `license.spdx_id` field.

**React 19 compatibility.** `slate-react@0.126.0` peerDependencies: `"react": ">=18.2.0"`, `"react-dom": ">=18.2.0"`, `"slate": ">=0.121.0"`, `"slate-dom": ">=0.119.1"` ([registry.npmjs.org/slate-react/latest](https://registry.npmjs.org/slate-react/latest)) — open lower bound, no upper-bound restriction, so React 19 is not blocked. No React-19-specific GitHub issue was found in search (the repository doesn't appear to have an open, unresolved React 19 compatibility issue as of this research).

**Features.** Slate ships **zero built-in rich-text schema**. Its own docs describe it as deliberately "schema-less core," stating: "all of its logic is implemented with a series of plugins, so you aren't ever constrained by what *is* or *isn't* in 'core'," specifically contrasting itself with editors where "bold and italic were supported out of the box" ([docs.slatejs.org](https://docs.slatejs.org/)). In practice this means: **bold/italic, headings, bullet/numbered lists, links, and checklists (with nesting) are not provided at all** — the application must write its own `renderElement`/`renderLeaf` functions, its own toolbar, its own keyboard-shortcut handling, and its own checklist node type and nesting logic from scratch. This is the reason Plate exists (as a batteries-included plugin layer on top of Slate).

**View/edit mode.** `<Editable>` supports a `readOnly` prop, but because there's no built-in schema, "read-only rendering with formatting intact" is only as good as the custom `renderElement`/`renderLeaf` code the app writes — there's no first-party guarantee that a hand-rolled read-only renderer and the edit-mode renderer stay in sync (unlike Tiptap/Lexical, where the same official schema code is guaranteed to render both modes identically).

**Bundle size (Bundlephobia).** `slate` core: 117,146 B raw / 28,094 B gzip. `slate-react`: 72,161 B raw / 21,202 B gzip. Sources: [bundlephobia.com/package/slate](https://bundlephobia.com/package/slate), [bundlephobia.com/package/slate-react](https://bundlephobia.com/package/slate-react). Smallest of the five for the bare framework, but this excludes all the custom code (checklist schema, nesting logic, toolbar) the app would have to write and maintain itself to hit the feature list — code that ships for free in Tiptap/Lexical/BlockNote/Plate.

---

## Comparison table

| | Tiptap | Lexical | BlockNote | Plate (`platejs`) | Slate |
|---|---|---|---|---|---|
| Latest version / date | 3.29.0 — 2026-07-24 | 0.48.0 — 2026-07-16 | 0.52.1 — 2026-07-20 | 53.2.4 — 2026-07-03 | 0.126.0 (slate-react) — 2026-06-30 |
| License | MIT | MIT | MPL-2.0 (core/react); GPL-3.0 (XL export packages) | MIT | MIT |
| GitHub stars | 37,775 | 23,707 | 10,011 | 16,444 | 31,728 |
| Open issues | 828 | 344 | 204 | 14 | 649 |
| Weekly npm downloads (core pkg) | ~15.5M (`@tiptap/core`) | ~4.47M (`lexical`) | ~457K (`@blocknote/react`) | ~322K (`platejs`) | ~2.48M (`slate-react`) |
| React 19 peerDep | `^17\|\|^18\|\|^19` (explicit) | `>=18.x` (open) | `^18\|\|^19\|\|>=19.0.0-rc` (explicit) | `>=18.0.0` (open) | `>=18.2.0` (open) |
| Bullet/numbered lists | Built-in (StarterKit) | Built-in (`@lexical/list`, official pkg) | Built-in (core schema) | Built-in (`@platejs/list`) | Not built-in — custom |
| Bold/italic/links | Built-in (StarterKit incl. Link) | Built-in (`@lexical/rich-text`, `@lexical/link`, official) | Built-in (core schema) | Built-in (`@platejs/basic-nodes`) | Not built-in — custom |
| Headings | Built-in (StarterKit) | Built-in (`@lexical/rich-text`) | Built-in (core schema) | Built-in (`@platejs/basic-nodes`) | Not built-in — custom |
| Checklist | Extra pkg (`@tiptap/extension-list`) | Extra official pkg (`@lexical/list`) | Built-in (`checkListItem` block) | Extra pkg (`@platejs/list`) | Not built-in — custom |
| Nested checklist items | Yes — `TaskItem.configure({ nested: true })` | Yes — native nested `ListNode`/`ListItemNode` modeling | Yes — every block has `children: Block[]`, incl. `checkListItem` | Yes — via generic Indent plugin (`@platejs/indent`) | Only if you build it |
| Read-only mode mechanism | Same editor/doc, `editable: false` / `setEditable(false)` | Same editor/state, `contentEditable` toggle via `editable` / `setEditable()` | Same editor/doc, `<BlockNoteView editable={false}>` | **Separate** component `<PlateStatic>`, same `value`/plugins | `<Editable readOnly>`, but rendering is 100% custom code either way |
| Approx. min. bundle (gzip) | ~120–140 KB (starter-kit + react + list) | ~90–120 KB (core + react + list/rich-text/link, partial data) | ~400–460 KB (core + react + mantine UI) | ~150–200 KB (core + list/indent/basic-nodes, partial data) | ~50 KB framework only, **excludes required custom code** |

---

## Recommendation

**Use Tiptap** (`@tiptap/core`, `@tiptap/react`, `@tiptap/starter-kit`, `@tiptap/extension-list`) for both the todo body editor and scratch notes.

**Why it wins against the requirements:**

- **Feature list, cleanly.** StarterKit gives bullet/numbered lists, bold/italic, headings, and links out of the box; `@tiptap/extension-list` is one additional first-party package that adds bullet/ordered/task lists together, including **explicitly documented nested checklist support** via `TaskItem.configure({ nested: true })` — the single most concrete, low-effort nesting story of all five candidates.
- **React 19, unambiguous.** `@tiptap/react`'s peerDependencies literally spell out `^19.0.0`, not just an open-ended `>=18` range — the strongest, most explicit signal of the group.
- **View/edit without drift, by construction.** One `Editor` instance, one JSON/HTML document, one boolean (`editable`). There is structurally no way for the read-only render and the edit render to diverge, because it's the same code path with interaction disabled — this is the cleanest match to requirement 4 of any candidate (Lexical ties on this exact point; BlockNote is the same pattern; Plate deliberately uses a second renderer).
- **Maintenance and adoption, by a wide margin.** Highest star count (37,775), highest weekly downloads by roughly 3x over the next-closest (Lexical) and 30x+ over BlockNote/Plate, and the fastest release cadence observed among the five (multiple releases per week in the sample window).
- **Reasonable bundle size.** Mid-pack, well below BlockNote's ~400–460 KB, and doesn't force adoption of a full Notion-style block UI (drag handles, slash menus, side menus) the app doesn't need for todo bodies/notes.
- **License is unambiguous.** Plain MIT, no split-license surface area to reason about (unlike BlockNote's MPL-2.0/GPL-3.0 split).

**What ruled out the others:**

- **Lexical** — a very close second, and technically comparable on features, nesting, and the read-only mechanism (both use a same-instance boolean toggle). It loses out mainly on (a) a less explicit React 19 peer range (`>=18.x` vs. Tiptap's literal `^19.0.0`), (b) meaningfully lower adoption/downloads (~4.47M/week vs. ~12–15.5M/week for Tiptap), and (c) more assembly required — Lexical's checklist/list/link/rich-text support is spread across several separate official packages with less unified documentation than Tiptap's StarterKit + one extension package. It remains a credible fallback if deep customizability or Meta's roadmap becomes a priority later.
- **BlockNote** — has the best *native* nested-checklist story (every block, including `checkListItem`, is just a node with `children`, no separate nesting plugin needed) and is built on Tiptap under the hood, but it is a Notion-style block editor: it ships a whole block-based UI (drag handles, slash-command menu, side menus) this app doesn't need, its bundle is 2–4x heavier than Tiptap's, its download/star numbers are the smallest of the five, and its license is MPL-2.0 (copyleft-per-modified-file) rather than plain MIT — more license surface to track than necessary for a personal planner app.
- **Plate** — strong feature set and by far the lowest open-issue count (14), suggesting tight maintenance, but: it is a plugin framework *on top of* Slate (confirmed by its own docs/README), so the app inherits Slate's data model and quirks one layer down; its nested-checklist support is generic (shared Indent plugin) rather than checklist-specific; its read-only story uses a genuinely separate component (`<PlateStatic>`) rather than one editor with a flag, which is a closer fit to "two rendering paths" than the requirement wants; and its adoption (~322K downloads/week combined with legacy `@udecode/plate`) is the smallest of the mainstream candidates.
- **Slate** — ruled out decisively. It has healthy standalone maintenance (steady releases, 31,728 stars, MIT, React 19-open peer range) and is not itself unmaintained, but it provides **no built-in schema at all** — no bold/italic, no lists, no headings, no links, no checklists. Every one of the five feature requirements would have to be hand-built and hand-maintained by this project, including the nested-checklist logic and a from-scratch read-only renderer with no first-party guarantee it stays in sync with the edit-mode renderer. That is exactly the effort Plate exists to save, and exactly what Tiptap/Lexical/BlockNote provide for free — there's no reason to take on that build/maintenance cost directly for this app.
