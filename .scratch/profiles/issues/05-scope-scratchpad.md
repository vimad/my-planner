# 05 — Scope scratchpad to the active profile

**What to build:** Scratch notes and the promote-to-todo flow scoped to the active profile, so the scratchpad inbox and its category picker never mix content across profiles. See `.scratch/profiles/spec.md` for full context.

**Blocked by:** 02 — Profile switcher + category scoping.

- [ ] `ScratchNote` create/list/update/archive/delete routes are scoped to the active profile via its own `profileId` (set directly at creation, not derived).
- [ ] New scratch notes are created attached to the active profile.
- [ ] The scratchpad inbox only shows the active profile's notes.
- [ ] Promoting a note's line into a todo only offers categories from that note's own profile (which, since a note can't switch profiles, is always the active profile).
- [ ] Switching profiles immediately re-scopes the scratchpad inbox.
- [ ] Backend tests cover the now-scoped ScratchNote routes (profile A's notes never returned when profile B is active).
- [ ] Frontend tests cover: scratchpad inbox scoped to active profile, and the promotion flow's category picker only offering that profile's categories.
