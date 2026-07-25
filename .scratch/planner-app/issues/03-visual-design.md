# Visual Design & Styling Approach

Type: prototype
Status: resolved

## Question

What should the overall visual design of the dashboard look like — colorful, modern, sleek, per the user's brief — and what styling approach/component foundation should the frontend use to achieve it (e.g. Tailwind CSS, a component library such as shadcn/ui or Mantine, or something else)?

Build a rough visual prototype via the `/prototype` skill covering: overall layout, color system (how category colors from the curated palette sit inside the broader theme), typography, and component style (cards, buttons, badges for priority/counts). Settle on the styling tech to carry into implementation.

## Answer

Three visual variants were prototyped via the `/prototype` skill (UI branch, sub-shape B), all skinning the same Date Agenda structure chosen in the View Modes ticket rather than changing the information architecture: **A — Vivid Blocks** (bold gradient hero, saturated category-tinted rows, chunky pill badges), **B — Soft Pastel** (cream background, serif headings, faint pastel tints, airy whitespace), **C — Vibrant Dark** (near-black gradient background, neon glowing category dots, glassmorphism cards, gradient-text heading).

**Decision: ship "Vibrant Dark" (C)** — dark background, category colors used as glowing neon accents, translucent/blurred glass cards, gradient-text headings, high contrast.

**Styling tech: Tailwind CSS.** Chosen for fast iteration on the gradient/blur/glow effects Vibrant Dark needs, no component-library lock-in, and pairing with a small set of hand-built components (cards, badges, mini calendar) styled with utilities. Not yet installed in the repo — that's implementation work, not part of this decision.

**Asset / primary source:** the three prototype variants live at `packages/frontend/src/prototype-views/design/` (`useAgendaData.js`, `DesignVariantVivid.jsx` + `vivid.css`, `DesignVariantPastel.jsx` + `pastel.css`, `DesignVariantDark.jsx` + `dark.css`, `DesignVariantsPrototype.jsx`), clearly marked as throwaway/PROTOTYPE, reusing the mock data and `PrototypeSwitcher` from the View Modes ticket's assets. As with that ticket, this repo isn't a git repository, so the usual "capture on a throwaway branch" step wasn't possible — the files were left in place instead, unwired from `App.jsx` (the temporary `?design=` hook was reverted). To view them again, temporarily re-add a conditional render of `DesignVariantsPrototype` in `App.jsx`.

The winning "Vibrant Dark" visual language (colors, glassmorphism, gradients, glow treatment) is the reference for implementation, but no design tokens/theme file were extracted yet — that's implementation work once Tailwind is actually installed, not part of this decision.
