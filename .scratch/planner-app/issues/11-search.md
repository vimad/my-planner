# 11 — Search

**What to build:** A search box on the dashboard that filters todos by title and body text as the user types.

**Blocked by:** 08 — Todo detail: priority, due date, tags, category, rich-text body

**Status:** ready-for-agent

- [ ] Todo save path maintains a denormalized plain-text extract of the Tiptap `body` alongside `title`, for search
- [ ] Backend exposes a search endpoint that matches todos by `title` and/or the plain-text body extract, case-insensitive
- [ ] Frontend dashboard has a search box that filters the visible agenda to matching todos as the user types
- [ ] Backend search route is tested via `createApp()` + supertest with mocked models
- [ ] Frontend search filtering is tested via React Testing Library with `fetch` mocked
