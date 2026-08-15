# Decide dev-mode wiring

Type: grilling
Status: resolved

## Question

When running the desktop app during development (`tauri dev`), should Tauri spawn its own frontend dev server (`beforeDevCommand: pnpm --filter frontend dev`, Tauri's default pattern), or should its `devUrl` just point at an already-running `pnpm dev:frontend` (or full `pnpm dev`) instance the developer starts separately?

This decides the shape of daily dev usage: a single `pnpm dev:desktop` that does everything vs. a documented "run `pnpm dev` first, then open the Tauri window" two-step. Either way the backend (`pnpm dev:backend` + Mongo) stays manual per the map's destination — this ticket is only about the frontend dev server. Feeds directly into how [[02-scaffold-tauri-desktop-package]] configures `devUrl`/`beforeDevCommand`.

Blocks: [[02-scaffold-tauri-desktop-package]]

## Answer

The Tauri app attaches to an already-running dev server rather than spawning its own.

- `tauri.conf.json` sets `build.devUrl` to `http://localhost:5173` (Vite's default port) and leaves `build.beforeDevCommand` **unset**.
- Daily dev flow: run `pnpm dev` (or `pnpm dev:frontend`) as usual for browser-based iteration, then separately run a new `pnpm dev:desktop` (→ `tauri dev` from `packages/desktop`) to pop the same live app into a native window. One Vite process serves both the browser tab and the desktop window, both hot-reloading together.
- Rationale: avoids Tauri spinning up a second Vite instance that Vite would bump to a different port (5174, ...) when 5173 is already taken, which would silently break `devUrl`. Also matches the destination's framing — web dev stays the fast loop, desktop is a thin attach-to-it wrapper, not a parallel process to manage.
- Consequence for [[02-scaffold-tauri-desktop-package]]: the scaffold ticket should NOT wire a `beforeDevCommand`, and `pnpm dev:desktop` should just be `tauri dev --config packages/desktop/src-tauri/tauri.conf.json` (or run from within `packages/desktop`) — it assumes the frontend dev server is already up and will show a blank/error window if it isn't.
