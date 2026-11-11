# Revenant Reader — Tasks

**Project:** Revenant Reader — RSS, reborn as an AI newsroom
**Category:** Kiroween 2026 — Resurrection
**Status:** Tasks v1.0 — scaffold phase, 2026-11-08
**Timeline:** scaffold 8–10 Nov · core build 11–20 Nov · digest/polish/deploy
21–27 Nov · video + write-up 28 Nov–1 Dec · buffer + submit 2–4 Dec
(deadline 5 Dec 2026 05:00 WIB)

Tasks are written for Kiro spec-driven execution: each task references the
requirement(s) it satisfies and has a clear done-condition. Check a task off
only when its acceptance criteria pass.

## Phase 1 — Scaffold (8–10 Nov) ✅ in progress

- [x] 1. Create project at `~/workspace/revenant-reader/` (local only; no
      GitHub repo / push until review)
- [x] 2. Write `.kiro/specs/revenant-reader/requirements.md` (this spec set)
- [x] 3. Write `.kiro/specs/revenant-reader/design.md`
- [x] 4. Write `.kiro/specs/revenant-reader/tasks.md` (this file)
- [x] 5. Write `.kiro/steering/summaries.md` (summary rules)
- [x] 6. Write `.kiro/hooks/on-feed-item.md` (summarize + dedupe + rank)
- [x] 7. Write `.kiro/mcp/feed-fetch.md` (feed-fetch tool note)
- [x] 8. Write `README.md` (project, category, Kiro usage)
- [x] 9. Scaffold app shell: package.json, app layout, feed list + article
      view placeholders, dark theme CSS variables
- [x] 10. Verify the scaffold builds/runs locally; record the result
- [ ] 11. Request the free 4,000 Kiro credits on the Devpost Resources tab
      — **needs the user's Devpost account in a browser; deadline 2 Dec
      03:00 WIB. Do not miss.**
- [x] 12. Create the public GitHub repo and push (after user review)
  - _Done 2026-11-10:_ repo `maulanaabdansakur/revenant-reader` live with
    topics + MIT license; local `master` up to date with `origin/master`.

## Phase 2 — Core build (11–20 Nov)

### Feeds
- [x] 13. Feed parser: fetch + parse RSS 2.0 and Atom 1.0 (Req 1)
  - _Done 2026-11-11:_ `src/lib/feed.js` implements `fetchFeed` (10s
    timeout, browser UA, `rss-parser`) plus `normalizeLink` (utm/fbclid/
    gclid stripped, fragment + trailing slash removed) and
    `normalizeTitle`. Verified live via dev server: Hacker News RSS 20
    items, BBC News RSS 31 items, The Verge Atom 10 items; bad URL
    (example.com 404) and invalid URL both return clean errors.
    `npm run build` passes. NOT pushed yet — push after user review.
- [x] 14. Feed CRUD API: `POST /api/feeds`, `GET /api/feeds`,
      `DELETE /api/feeds/[id]` (Req 1)
  - _Done when:_ add/remove/list works end-to-end from the UI.
  - _Done 2026-11-11:_ `src/app/api/feeds/route.js` (GET list; POST
    validates via the task 13 parser — non-feed URL rejected 422,
    invalid URL 400, duplicate URL 409) + `src/app/api/feeds/[id]/
    route.js` (DELETE, 404 when unknown) + interim in-memory store
    `src/lib/feeds-store.js` (task 16 replaces it with SQLite) +
    `FeedList.jsx` wired to the API (add form, per-feed ✕ remove,
    starter-feed suggestions when empty). Verified live on the dev
    server: Hacker News RSS + BBC News RSS added (201), duplicate
    re-add rejected (409), example.com rejected (422), garbage URL
    rejected (400), list showed both, both deleted (200, unknown id
    404), list empty again; home page renders 200. `npm run build`
    passes. NOT pushed — push after user review.
- [ ] 15. OPML import: parse file, add valid feeds, report added vs.
      skipped (Req 1)
  - _Done when:_ a sample OPML with 5 feeds (1 bad URL) imports 4 and
    reports the skip.
- [ ] 16. Persistence: SQLite locally, migration path to Postgres for
      deploy (Req 1, 2)
  - _Done when:_ feeds + items survive a server restart.

### Reader
- [ ] 17. Story list UI: newest-first cards with title, source, time,
      read/unread dot (Req 2)
- [ ] 18. Article view: title, source, time, summary, original link
      (Req 2)
- [ ] 19. Read/unread + starring, persisted; starred-only filter;
      per-feed filter (Req 2)
  - _Done when:_ reload keeps read/star state; filters work.

### Summaries
- [ ] 20. Summarizer: one LLM call per new item, prompt from title +
      excerpt, result cached (Req 3)
  - _Done when:_ a new story gets a 2–3 sentence summary + "why it
    matters" within seconds of refresh; re-reading does not re-call.
- [ ] 21. Summary fallback: model unavailable → feed excerpt shown,
      story marked "summary pending" (Req 3)
- [ ] 22. Enforce steering rules in the prompt + a length check on the
      output (Req 3, steering)

### Dedupe
- [ ] 23. Link normalization + canonical-URL dedupe (Req 4)
- [ ] 24. Normalized-title dedupe across feeds (72h window) + multi-source
      chips on the surviving card (Req 4)
  - _Done when:_ the same story in 2 feeds shows as 1 card with 2 sources.

## Phase 3 — Digest, polish, deploy (21–27 Nov)

- [ ] 25. Ranking: recency score + source-diversity cap (max 3 per feed in
      top 10) (Req 5)
- [ ] 26. Digest view: top-10 last-24h, numbered cards, count shown when
      fewer than 10 (Req 5)
- [ ] 27. Refresh scheduler: poll feeds on a timer + manual refresh button;
      runs the on-feed-item hook per new item (Req 3, 4, 5)
- [ ] 28. UI polish: responsive layout, card fade-in animation, empty state
      with 3 starter feeds (Req 6)
- [ ] 29. Deploy live (Vercel first choice; Vultr box fallback) with the
      public URL recorded in the README (Req 7)
- [ ] 30. Full manual pass: add 3 feeds → summaries appear → filter/rank →
      digest top 10 (this is the demo script)

## Phase 4 — Video, write-up, submit (28 Nov–4 Dec)

- [ ] 31. Demo video < 3 min (narrated, same style as the MLH video)
- [ ] 32. Devpost write-up in English, incl. "how Kiro was used" section
- [ ] 33. Final checklist: public repo with `/.kiro/` at root, live demo
      link, video, write-up, category Resurrection
- [ ] 34. Submit on Devpost before 5 Dec 2026 05:00 WIB
