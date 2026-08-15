# Install Rust + Tauri toolchain

Type: task
Status: resolved

## Question

Get this Mac ready to build Tauri apps: install the Rust toolchain (`rustc`/`cargo`, e.g. via `rustup`) and the Tauri CLI, and confirm the existing Xcode Command Line Tools install (`/Library/Developer/CommandLineTools`) satisfies Tauri's macOS build requirements — install full Xcode instead if Tauri's doctor/build step says CLT alone isn't enough. Record what was installed and how (rustup vs Homebrew, versions) so it's reproducible if this Mac is reimaged.

Blocks: [[02-scaffold-tauri-desktop-package]]

## Answer

Installed via `rustup` (the official installer), not Homebrew — Homebrew's `rust` bottle download hit a transient `HTTP/2 stream ... PROTOCOL_ERROR` from ghcr.io and was abandoned in favor of rustup, which is also the toolchain Tauri's own docs point to.

- `rustc 1.97.1 (8bab26f4f 2026-07-14)`
- `cargo 1.97.1 (c980f4866 2026-06-30)`
- Installed to `$HOME/.cargo` — new shells need `. "$HOME/.cargo/env"` sourced (rustup adds this to shell rc files automatically; already verified working in this session).
- Xcode Command Line Tools (`/Library/Developer/CommandLineTools`) confirmed present and sufficient — no full Xcode install needed.
- Tauri CLI intentionally **not** installed globally — deferred to [[02-scaffold-tauri-desktop-package]] as a scoped `@tauri-apps/cli` devDependency inside `packages/desktop`.

Reproduction: `curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh` (the standard rustup install script).
