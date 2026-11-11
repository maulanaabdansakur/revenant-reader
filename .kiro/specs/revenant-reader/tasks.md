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
- [x] 15. OPML import: parse file, add valid feeds, report added vs.
      skipped (Req 1)
  - _Done when:_ a sample OPML with 5 feeds (1 bad URL) imports 4 and
    reports the skip.
  - _Done 2026-11-11:_ `src/lib/opml.js` (xmlUrl extraction from outline
    elements, entity decoding, folder outlines ignored) +
    `src/app/api/feeds/import/route.js` (POST multipart file; each URL
    validated with the task 13 parser — invalid/non-feed/duplicate
    reported in `skipped` with a reason each) + `FeedList.jsx` wired
    (file input + "Imported N, skipped M" report with per-URL reasons).
    Verified live on the dev server: sample OPML (HN, BBC, Verge, Ars
    Technica + example.com) imported 4, skipped 1 (example.com, not a
    feed); re-import skipped all 5 (4 duplicates + 1 not-a-feed);
    non-OPML / no-file / feed-less OPML all rejected 400; home page
    renders 200 with the Import OPML control. `npm run build` passes.
    Pushed to origin master directly per user instruction 2026-11-11
    ("Push saja, tidak usah tanya lagi").
- [x] 16. Persistence: SQLite locally, migration path to Postgres for
      deploy (Req 1, 2)
  - _Done when:_ feeds + items survive a server restart.
  - _Done 2026-11-11:_ `src/lib/db.js` (Node 24 built-in `node:sqlite`,
    zero new deps; `data/revenant-reader.db`, gitignored, schema created
    on first use) + `src/lib/feeds-store.js` rewritten on SQLite with the
    same feed interface (listFeeds/findByUrl/addFeed/removeFeed) plus
    item upsert/list/count; addFeed stores parsed items atomically with
    the feed, delete cascades to items. Routes pass `parsed.items` to
    addFeed; UI unchanged. Postgres migration path documented in
    design.md ("Persistence": swap only db.js for a `pg` Pool,
    `$1`-style placeholders, BOOLEAN/TIMESTAMPTZ, same upsert SQL).
    Verified live on the dev server: HN + BBC added (201, 30 + 31 items
    in DB), duplicate 409, example.com 422, garbage 400, unknown-id
    DELETE 404; fresh-DB OPML import added 4, skipped 1 (example.com);
    server restart kept all 4 feeds + 91 items; DELETE of HN removed
    its 30 items (91 → 61). `npm run build` passes. Pushed to origin
    master directly per user instruction ("Push saja, tidak usah tanya
    lagi").

### Reader
- [x] 17. Story list UI: newest-first cards with title, source, time,
      read/unread dot (Req 2)
  - _Done 2026-11-11:_ `GET /api/items` (+ `?feed=` filter) via new
    `listItemsWithSource` (joins feed title as `source`, newest-first,
    undated last) + `src/lib/time.js` (relative time: "5m ago", "3h ago",
    "2d ago", date for older) + `page.jsx` rewritten on real items
    (sample data removed; refetches on feed select and on feed add/
    remove/import) + `StoryCard`/`ArticleView` show relative time and
    the excerpt with a "Summary pending" note until task 20. Verified
    live on the dev server: HN + BBC added (61 items), all dated,
    sorted newest-first, all unread with dots, correct sources/times;
    `?feed=` returned 30 HN-only items in order; OPML regression
    (Verge + Ars added, 2 dups + 1 bad skipped); DELETE cascade
    (91 → 71 → 91 on re-add); home page 200, no scaffold text.
    `npm run build` passes. Pushed to origin master directly per user
    instruction ("Push saja, tidak usah tanya lagi").
- [x] 18. Article view: title, source, time, summary, original link
      (Req 2)
  - _Done 2026-11-11:_ `ArticleView.jsx` fully wired — title, source
    (linked to the feed's site), relative + absolute published time
    (new `formatAbsoluteTime` in `src/lib/time.js`), summary +
    "why it matters" when present, otherwise the excerpt with an
    explicit "Summary pending" note (task 21 fallback; summarizer is
    task 20), original link guarded when a feed provides none; `page.jsx`
    saves the list scroll position on open and restores it on back, so
    the filter + list state survive the round trip. Star/read controls
    stay in task 19. Verified live on the dev server with a real BBC
    story (91 items): title, source, "8m ago · Nov 11, 2026, 06:24 AM",
    excerpt + "Summary pending", original link, back button all render;
    summary branch renders summary + why-it-matters with no pending
    note; no-link/no-date edge case renders the fallback notes. Home
    page 200, feeds intact (4), per-feed filter still works (31 BBC
    items). `npm run build` passes. Pushed to origin master directly
    per user instruction ("Push saja, tidak usah tanya lagi").
- [x] 19. Read/unread + starring, persisted; starred-only filter;
      per-feed filter (Req 2)
  - _Done when:_ reload keeps read/star state; filters work.
  - _Done 2026-11-11:_ `feeds-store.js` gained `updateItem` (PATCH
    read/starred, returns the updated item) + `getItemWithSource` and
    starred/read filters on `listItemsWithSource`; new `PATCH
    /api/items/[id]` (400 on empty/non-boolean body, 404 unknown id)
    and `GET /api/items` accepts `?starred=1` / `?read=1|0` (per-feed
    `?feed=` unchanged); `StoryCard`/`ArticleView` star + mark
    read/unread buttons wired through `page.jsx` `patchItem`
    (optimistic state merge, open article too); opening a story marks
    it read (Req 2 AC3); "All stories / ★ Starred only" toggle in the
    list header. Verified live on the dev server with real feeds (91
    items): PATCH read/star 200, `?starred=1` returned exactly the
    starred story, `?read=1` exactly the read one, combined
    `?feed=&starred=1` worked, error cases 400/404; after a server
    restart the starred + read states were still there (91 items
    intact); test marks cleaned back to all-unread/unstarred.
    `npm run build` passes. Pushed to origin master directly per user
    instruction ("Push saja, tidak usah tanya lagi").

### Summaries
- [x] 20. Summarizer: one LLM call per new item, prompt from title +
      excerpt, result cached (Req 3)
  - _Done when:_ a new story gets a 2–3 sentence summary + "why it
    matters" within seconds of refresh; re-reading does not re-call.
  - _Done 2026-11-11:_ provider **Pollinations.ai text API (keyless,
    no signup, $0, GET `text.pollinations.ai/<prompt>?model=openai`)**
    — the only reliable keyless free-tier endpoint; verified live 3/3
    probe calls. `src/lib/summarizer.js` (steering-rules prompt, strict
    `WHY IT MATTERS:` parse, 2–3-sentence validation with one retry on
    a short result, call stats + logging) + `src/lib/on-feed-item.js`
    (hook step 3: background batch, newest-first, concurrency 2, one
    sequential retry round after 15s — Pollinations 404s bursts) +
    store `setItemSummary` / `markItemSummaryPending` /
    `listUnsummaryizedItems` (summary NULL, attempts < 3) +
    `summaryAttempts` column (safe ALTER migration). Feed-add and
    OPML-import routes fire the batch without awaiting (POST must not
    wait ~10–30s per call). Verified live on the dev server with fresh
    test DBs: 2-item local feed → both summarized in ~2s (3 sentences
    + why line each); real Verge Atom (10 items) → 4/10 first pass,
    6/10 404 rate-limit, all 6 recovered by the retry round (12/12
    summarized, 0 pending); re-reads + a server restart → 0 new model
    calls (cached summaries reused); dead endpoint
    (`SUMMARIZER_BASE_URL=http://127.0.0.1:1`) → summary null,
    summaryPending=1, attempts=2, excerpt still shown (task 21
    fallback); duplicate 409 / example.com 422 unchanged. Parser unit
    tests 6/6 (incl. "9 p.m." not splitting sentences). `npm run
    build` passes. No key needed — `SUMMARIZER_API_KEY` stays reserved
    in `.env.example` for a future provider swap. Caveat: serverless
    (Vercel) may kill background work after the response — task 27
    refresh / task 29 deploy to confirm `waitUntil` or a cron refresh.
    Pushed to origin master directly per user instruction ("Push saja,
    tidak usah tanya lagi").
- [x] 21. Summary fallback: model unavailable → feed excerpt shown,
      story marked "summary pending" (Req 3)
  - _Done when:_ excerpt + "Summary pending" render in list and article
    view; a single retry path works once and does not loop.
  - _Done 2026-11-11:_ `POST /api/items/[id]/summarize` (new route) +
    `retryItemSummary` in `src/lib/on-feed-item.js` — exactly ONE model
    attempt per call; 200 on success, 502 on a failed attempt (attempts
    + 1), 409 when already summarized or attempts exhausted (>= 3), 404
    unknown id. `StoryCard`/`ArticleView` now show the excerpt cleanly
    with a "Summary pending" note + "Retry summary" button ONLY when
    the model actually failed (`summaryPending`); a fresh story whose
    batch is still running shows just the excerpt; attempts-exhausted
    stories show "Summary unavailable" with no button; empty excerpts
    show "No excerpt available from this feed." instead of a blank
    block. `page.jsx` wires `retrySummary` (POST + merge into list and
    open article). Verified live on the dev server with a fresh test DB
    and a dead summarizer endpoint (`SUMMARIZER_BASE_URL=http://
    127.0.0.1:1`): real Hacker News RSS (30 items, served locally
    verbatim because the egress proxy took ~15s vs the 10s fetch
    timeout) → all 30 pending, attempts=2, 0 summaries; temp render
    page asserted list + article: excerpt, "Summary pending", "Retry
    summary" ×4 (pending + empty-excerpt copies), "Summary unavailable"
    ×2, no "Why it matters"; retry on dead endpoint → 502 then 409
    exhausted; restarted with the real Pollinations endpoint → retry
    returned a real 2-sentence summary + why line (200, pending
    cleared), second retry → 409 already-summarized, 2 re-lists → still
    exactly 1 model call. Regression: duplicate 409, example.com 422,
    garbage 400, unknown DELETE 404, PATCH star 200; OPML (BBC + HN
    dup + bad URL) → added 1, skipped 2. `npm run build` passes.
    Pushed to origin master directly per user instruction ("Push saja,
    tidak usah tanya lagi").
- [x] 22. Enforce steering rules in the prompt + a length check on the
      output (Req 3, steering)
  - _Done when:_ summaries obey `.kiro/steering/summaries.md`; a
    rule-breaking model output is corrected/rejected, not stored as-is.
  - _Done 2026-11-11:_ new `src/lib/summary-rules.js` — pure
    `validateSummary()` checks every mechanically-checkable rule
    (2–3 sentences; one-line non-empty "why it matters"; banned
    clickbait words with the "breaking"-wire exception; no question
    hooks; no direct reader address; plain text, no markdown; every
    number/quoted phrase must appear in the source) + `splitSentences`
    moved here (shared with the parser) + `NOT_CHECKABLE` lists the
    three rules no machine can check (cause claims, opinion labelling,
    headline-claim matching — prompt-only). `summarizer.js` now
    validates each result and retries once with a firmer prompt that
    NAMES the violations; a retry that still breaks a rule throws, so
    no rule-breaking summary is ever stored (item stays
    summaryPending, excerpt shown — task 21 fallback). This replaces
    task 20's "short summary beats none" acceptance. Tests:
    `test/summary-rules.test.js` (15 validation + parser cases) +
    `test/summarizer-enforcement.test.js` (stub-server end-to-end:
    good = 1 call, violating-then-good = 2 calls with the violation
    named in the retry prompt, violating-twice = refused, violating
    + failed retry = throws); `npm test` 19/19 pass, `npm run build`
    passes. Verified live on the dev server: real Verge Atom (10
    items, real Pollinations endpoint) → 10/10 summaries stored, 0
    rule-breaking by the validator, 10 model calls, 0 violation
    retries; re-lists → 0 new calls. Enforcement trigger via a stub
    model server (bad mode: 1-sentence + "shocking"): feed-add batch
    → 0 summaries stored, all 10 pending, attempts=2, 40 stub calls,
    40 "broke steering rules" log lines; stub flipped to good →
    manual retry returned 200 with a valid summary (1 call, 41
    total), re-lists → 0 new calls. Regression: duplicate 409,
    example.com 422, garbage 400, unknown DELETE 404, PATCH star 200,
    OPML 0 added / 2 skipped (dup + bad). Pushed to origin master
    directly per user instruction ("Push saja, tidak usah tanya lagi").

### Dedupe
- [x] 23. Link normalization + canonical-URL dedupe (Req 4)
  - _Done when:_ the same story in 2 feeds shows as 1 card.
  - _Done 2026-11-11:_ `normalizeLink` extended (task 17 gap fixed):
    `at_*` prefix (BBC `at_medium`/`at_campaign`), `utm_*`, `mc_`,
    `pk_`/`piwik_`/`matomo_`/`sc_` prefixes + fbclid/gclid/msclkid/
    twclid/igshid/`_ga`/`si`/HubSpot etc. — article-identity params
    (`?page=`, `?id=`, `?v=`) are KEPT, so different articles stay
    distinct (Req 4 AC3). `storeItems` (new, exported — task 27 refresh
    reuses it) dedupes by canonical URL at insert: a story arriving
    from a second feed inserts NO second row, the extra feed is
    recorded in the new `item_sources` table, and the survivor is left
    untouched — summary, read/star, publishedAt all kept (Req 4 AC4),
    so no second summary is ever generated. `listItemsWithSource`
    attaches `sources[]` per item and the `?feed=` filter matches a
    story under any feed that carried it (still one row); same-feed
    re-fetch still refreshes title/content via the (feedId, guid)
    upsert. `collapseDuplicateItems()` merges pre-task-23 duplicate
    rows (summary + read/star inherited); live dev DB had 0 dup
    groups. Tests: new `test/dedupe.test.js` (11 cases: normalization,
    cross-feed collapse, same-feed re-issue, re-fetch refresh, AC3,
    AC4, legacy collapse); `npm test` 30/30 pass, `npm run build`
    passes. Verified live on the dev server with a fresh test DB and
    real Verge Atom items served locally (3 stories): feed A added
    (3 items, 3 summaries, 3 model calls); feed B — same 3 stories,
    different guids, `?at_medium=RSS&at_campaign=feed-b&utm_source=`
    links — added 201 but total stayed 3 items, same IDs, summaries
    unchanged, still 3 model calls, each card's `sources` =
    ["The Verge", "The Verge (Mirror B)"]; `?feed=` (B) returns all
    3; restart kept 3 items + sources + summaries. Regression:
    duplicate 409, example.com 422, garbage 400, PATCH star 200,
    starred filter 1, OPML 0 added / 2 skipped, home 200. UI note:
    the API returns `sources[]` but no chips render yet — multi-source
    chips are task 24. Pushed to origin master directly per user
    instruction ("Push saja, tidak usah tanya lagi").
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
