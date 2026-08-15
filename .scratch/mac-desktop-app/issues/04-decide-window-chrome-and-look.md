# Decide window chrome & desktop look

Type: prototype
Status: resolved
Blocked by: 02

## Question

Decide the desktop app's window/menu chrome and prototype it in the scaffolded Tauri app (see `docs/ui-conventions.md` for the existing dark glassmorphism aesthetic before choosing anything):

- Native macOS menu bar (File/Edit/View, standard Cmd+Q/Cmd+W/Cmd+R) vs. a minimal/no menu bar.
- Standard title bar vs. a custom/hidden title bar that matches the app's look.
- Fixed window size vs. remembered size/position across launches, and a sensible minimum window size given the planner's layout.

Confirm the chosen look feels right running against the real app before closing this ticket — this is the last open ticket on the map.

## Answer

All three decided in favor of the zero/low-effort option, prototyped in the real app and confirmed by the user:

- **Menu bar**: kept Tauri's default native macOS menu bar as-is (no code change). It already provides the standard Edit menu that macOS relies on for Cmd+C/V/X/A/Z to work correctly inside the WKWebView's text fields — confirmed working in the notes/todo fields after the change below.
- **Title bar**: kept the standard native title bar, following system light/dark appearance (no code change) — not forced dark.
- **Window sizing**: default bumped from Tauri's generic 800×600 to 1280×800 with a 900×600 minimum (`app.windows[0]` in `tauri.conf.json`), and added `tauri-plugin-window-state` (`Cargo.toml` dependency + `.plugin(tauri_plugin_window_state::Builder::default().build())` in `src-tauri/src/lib.rs`) so the window remembers size/position across quit/reopen. User verified: resized the window, quit via Cmd+Q, reopened `My Planner.app`, and it came back at the same size/position; Cmd+C/Cmd+V confirmed working in a text field.

This was the last open ticket — the map is done.
