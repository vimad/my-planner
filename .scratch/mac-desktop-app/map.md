# Mac Desktop App (Tauri)

Label: wayfinder:map

## Destination

A Tauri-based Mac desktop wrapper around the existing `packages/frontend`, with no/minimal changes to the frontend or backend code. The desktop app loads the same React UI (the running Vite dev server while developing, the static `vite build` output once packaged) and talks to the existing Express backend via the already-parameterized `VITE_API_URL` (defaults to `http://localhost:4100`) — the backend and MongoDB keep starting exactly as they do today (`pnpm dev:backend`, `docker compose up`), no in-app management of either. Output is an unsigned local `.app`, built with `tauri build`, opened once via right-click → Open. Windows/Linux builds stay architecturally possible (that's Tauri's whole pitch) but are not produced or tested in this effort — Mac only, for now.

## Notes

- Domain: [[domain]] — single-user personal planner, dark glassmorphism UI. Before touching any window chrome/native UI, consult `docs/ui-conventions.md` for the established look.
- Facts already confirmed (no ticket needed):
  - `packages/frontend/src/App.tsx` already reads its API base from `VITE_API_URL`, defaulting to `http://localhost:4100` — this is *why* "minimal changes" is realistic; the desktop wrapper just needs to load the frontend, nothing about how it talks to the backend needs to change.
  - `packages/backend/src/app.ts` sets CORS to `corsOrigin ?? '*'` — wildcard by default, so Tauri's webview origin (`tauri://localhost` / `http://tauri.localhost`) is already allowed without a backend change.
  - `packages/frontend/public/favicon.svg` exists and is the source to generate the Tauri app icon set from (`tauri icon`).
  - Rust/Cargo are **not** installed on this Mac; Xcode Command Line Tools **are** present (`/Library/Developer/CommandLineTools`).
- Destination-shaping decisions already made while charting (not tickets, no need to re-litigate):
  - Desktop app still depends on the developer manually running the backend + MongoDB, same as today — it is not self-contained.
  - Tauri chosen over Electron and over a PWA — smaller footprint, genuinely cross-platform later, still just editing TS/React day to day.
  - Unsigned local build only — no Apple Developer account, no notarization.
  - This effort's scope stops at a working Mac build; Windows/Linux are left unblocked architecturally but not built or verified now.

## Decisions so far

- [Install Rust + Tauri toolchain](issues/01-install-rust-tauri-toolchain.md) — installed via `rustup` (rustc/cargo 1.97.1), not Homebrew (its bottle download flaked); Xcode CLT already sufficient; Tauri CLI deferred to the scaffold ticket as a project-scoped devDependency.
- [Decide dev-mode wiring](issues/03-decide-dev-mode-wiring.md) — Tauri attaches to an already-running Vite dev server (`devUrl: http://localhost:5173`, no `beforeDevCommand`) rather than spawning its own; you run `pnpm dev` as usual, then `pnpm dev:desktop` separately to open the native window.
- [Scaffold packages/desktop (Tauri)](issues/02-scaffold-tauri-desktop-package.md) — `packages/desktop` scaffolded and verified: `pnpm build:desktop` produces a working unsigned `My Planner.app` (identifier `com.vinod.my-planner`) that loads the real UI and hits the manually-run backend. Bundle limited to `targets: ["app"]` (DMG creation isn't needed and failed). Icon derived from `favicon.svg` into a new `packages/desktop/icon-source.svg` (squared + stripped of unsupported `display-p3` color functions).
- [Decide window chrome & desktop look](issues/04-decide-window-chrome-and-look.md) — kept Tauri's default native menu bar (needed for Cmd+C/V/X/A/Z in text fields) and standard system-appearance title bar, both zero-config; bumped default window size 800×600 → 1280×800 (min 900×600) and added `tauri-plugin-window-state` so size/position persist across launches. User-verified end to end.

## Not yet specified

(none — all four tickets resolved, no new fog surfaced along the way; the map is done)

## Out of scope

- **Embedding/managing the backend or MongoDB inside the desktop app** (auto-start, bundled/embedded DB) — ruled out when naming the destination; the app intentionally stays a thin wrapper around the developer-run backend.
- **Code signing & notarization** — ruled out; personal single-machine use doesn't need it, and it adds a real setup cost (Apple Developer account, notarization pipeline).
- **Producing or testing Windows/Linux builds** — Tauri makes them possible later, but there's no machine to test on right now and it wasn't asked for.
- **Auto-update plugin** — no signed/distributed build exists for an updater to check against.
- **New desktop-native features** (tray icon, native notifications, dock badge counts, global shortcuts) — not requested; the destination is a working wrapper, not new functionality.
- **DMG installer-image bundling** — `bundle.targets` trimmed to `["app"]` after `bundle_dmg.sh` failed during [[02-scaffold-tauri-desktop-package]]; a `.dmg` is for distributing an installer to other people, which isn't this destination (unsigned local `.app`, opened via right-click → Open).
