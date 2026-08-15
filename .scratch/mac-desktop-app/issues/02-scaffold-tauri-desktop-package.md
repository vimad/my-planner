# Scaffold packages/desktop (Tauri)

Type: task
Status: resolved
Blocked by: 01, 03

## Question

Scaffold `packages/desktop` as a new pnpm workspace member wrapping `packages/frontend` in Tauri (don't let `create-tauri-app` generate a new frontend — point it at the existing one):

- Wire `frontendDist` to `packages/frontend/dist` and `devUrl`/`beforeDevCommand` per the answer recorded on [[03-decide-dev-mode-wiring]].
- Generate the app icon set from `packages/frontend/public/favicon.svg` via `tauri icon`.
- Pick an app identifier and product name.
- Add `dev:desktop` / `build:desktop` scripts at the workspace root (and wire `pnpm-workspace.yaml` if needed).
- Verify end to end: with the backend running manually (`pnpm dev:backend` + `pnpm db:up`), `pnpm build:desktop` produces an unsigned `.app` that opens via right-click → Open and successfully calls `http://localhost:4100`.

Blocks: [[04-decide-window-chrome-and-look]]

## Answer

`packages/desktop` scaffolded as a new pnpm workspace member wrapping the existing frontend, verified end to end.

- **New files**: `packages/desktop/package.json` (`dev`/`build`/`icon` scripts, `@tauri-apps/cli` devDependency), `packages/desktop/src-tauri/` (Tauri v2 Rust project via `tauri init --ci`), `packages/desktop/icon-source.svg` (derived icon source, see below). No `pnpm-workspace.yaml` change needed — it already globs `packages/*`.
- **Config** (`src-tauri/tauri.conf.json`): `identifier: "com.vinod.my-planner"`, `productName: "My Planner"`, `frontendDist: "../../frontend/dist"`, `devUrl: "http://localhost:5173"` with no `beforeDevCommand` (per [[03-decide-dev-mode-wiring]]), `beforeBuildCommand: "pnpm --filter frontend build"`, `bundle.targets: ["app"]` (see below for why, not `"all"`).
- **Root scripts added**: `pnpm dev:desktop` (→ `tauri dev`, assumes `pnpm dev` is already running) and `pnpm build:desktop` (→ builds frontend then `tauri build`).
- **Icon**: `packages/frontend/public/favicon.svg` could not feed `tauri icon` directly — two blockers: (1) it's 48×46, not square, which the icon generator requires; (2) its `style` fill values are `fill:<hex>;fill:color(display-p3 ...)`, and the generator's SVG parser chokes on the `color(display-p3 ...)` function, silently falling back to solid black. Fixed by deriving `packages/desktop/icon-source.svg` — same artwork, `display-p3` overrides stripped (the hex fallback already in the same `style` attribute is kept, so the rendered color is unchanged) and the canvas padded to 48×48 via `viewBox="0 -1 48 48"`. Verified the generated `128x128.png` renders the correct purple (`~#9856ff`), not black, before generating the full set. The original `favicon.svg` was left untouched.
- **Bundle targets**: first build with `targets: "all"` produced a working `My Planner.app` but then failed bundling the `.dmg` (`bundle_dmg.sh` error). Since the destination only calls for an unsigned local `.app` (right-click → Open), not a distributable installer image, switched to `targets: ["app"]` rather than debugging DMG creation — out of scope for what this build needs to do.
- **Verified end to end**: with `pnpm dev:backend` + `pnpm db:up` running manually, `pnpm build:desktop` produced `packages/desktop/src-tauri/target/release/bundle/macos/My Planner.app` (arm64 Mach-O, correct identifier/display name/icon). Launched via `open`; user confirmed visually that the window shows the real planner UI with data loaded from the backend.
