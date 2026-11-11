# Revenant Reader — Design

**Project:** Revenant Reader — RSS, reborn as an AI newsroom
**Category:** Kiroween 2026 — Resurrection
**Status:** Design v1.0 — scaffold phase, 2026-11-08

## Overview

Revenant Reader is a single-page reader app. The client renders the feed list,
story list, and article view; a small server layer (Next.js API routes, or
serverless functions on the deploy target) fetches and parses feeds, stores
items, and calls the summarizer. Summaries are generated once per story and
cached — the model is never called twice for the same story.

```
┌───────────────────────────────────────────────────────────┐
│  Browser (Next.js App Router)                             │
│  ┌──────────┐  ┌──────────────┐  ┌─────────────────────┐ │
│  │ FeedList │  │ StoryList    │  │ ArticleView         │ │
│  │ (sidebar)│  │ (cards)      │  │ (summary + link)    │ │
│  └──────────┘  └──────────────┘  └─────────────────────┘ │
│  Theme: dark, graveyard-green CSS variables               │
└───────────────────────┬───────────────────────────────────┘
                        │ fetch (REST)
┌───────────────────────┴───────────────────────────────────┐
│  Server (Next.js API routes / serverless)                 │
│  /api/feeds   — add/remove/list, OPML import              │
│  /api/items   — list, read/unread, star                   │
│  /api/digest  — top-10 ranked stories (last 24h)          │
│  /api/refresh — poll feeds, run on-feed-item hook         │
└───────────────────────┬───────────────────────────────────┘
                        │
┌───────────────────────┴───────────────────────────────────┐
│  Data + external services                                 │
│  SQLite (local/dev) → Postgres (deployed)                 │
│  Feed parser (rss-parser)                                 │
│  Summarizer: free-tier LLM via one call per new item      │
└───────────────────────────────────────────────────────────┘
```

## Components

### FeedList (sidebar)

- Lists subscribed feeds with unread counts.
- Add-feed form (URL input) + OPML import button.
- Remove-feed action per feed.
- "All feeds" + per-feed filter; "Starred" filter; "Digest" view link.

### StoryList (main column)

- Story cards: title, source feed, relative time, summary (2–3 sentences),
  "why it matters" line, read/unread dot, star toggle, duplicate-source chips.
- Newest-first ordering. Infinite scroll or "load more" (decide in core build).
- Empty state: three suggested starter feeds when no feeds exist.

### ArticleView

- Full story: title, source, published time, summary, "why it matters",
  link to original article, star toggle, mark read/unread.
- Opens on card click; back returns to the list (state preserved).

### DigestView

- Top-10 ranked stories of the last 24h, numbered, with the same card layout.
- Shows a count when fewer than 10 stories exist.

## Data model

### Feed

| Field        | Type     | Notes                          |
|--------------|----------|--------------------------------|
| id           | string   | uuid                           |
| url          | string   | unique, the feed URL           |
| title        | string   | from feed metadata             |
| siteUrl      | string   | feed's home page               |
| addedAt      | datetime |                                |
| lastFetchedAt| datetime | nullable                       |
| lastError    | string   | nullable, last fetch failure   |

### Item (story)

| Field        | Type     | Notes                                |
|--------------|----------|--------------------------------------|
| id           | string   | uuid                                 |
| feedId       | string   | FK → Feed                            |
| guid         | string   | feed-provided id, unique per feed    |
| canonicalUrl | string   | link, normalized (trailing slash, utm stripped) |
| title        | string   | normalized (trimmed, whitespace collapsed) |
| content      | string   | feed content/summary, as provided    |
| publishedAt  | datetime |                                      |
| read         | boolean  | default false                        |
| starred      | boolean  | default false                        |
| summary      | string   | nullable until generated             |
| whyItMatters | string   | nullable until generated             |
| summaryPending | boolean | true when model unavailable          |
| duplicateOf  | string   | nullable; id of the surviving card   |

## Persistence (task 16, implemented 2026-11-11)

Local dev uses **SQLite** via Node 24's built-in `node:sqlite`
(`DatabaseSync`, zero new dependencies, no native build). The file lives at
`data/revenant-reader.db` (gitignored, overridable with `REVENANT_DB_PATH`);
schema (`feeds` + `items`, FK cascade on feed delete) is created on first
use in `src/lib/db.js`. All data access goes through the small store
interface in `src/lib/feeds-store.js` (`listFeeds` / `findByUrl` /
`addFeed` / `removeFeed` + `listItems` / `countItems`) — the API routes
and UI never touch SQL directly.

**Migration path to Postgres for deploy:** swap only `src/lib/db.js` for a
`pg` Pool (`DATABASE_URL` env) and keep every store function signature.
The SQL maps 1:1 with three mechanical changes: `?` placeholders become
`$1, $2, …`; `INTEGER 0/1` booleans become `BOOLEAN`; `TEXT` ISO dates
become `TIMESTAMPTZ` (store `new Date().toISOString()` either way). The
`ON CONFLICT (feedId, guid) DO UPDATE` upsert is valid Postgres as-is.
Do NOT ship the SQLite file to deploy: serverless filesystems are
ephemeral (a redeploy wipes `data/`), so the deployed target must set
`DATABASE_URL` to a hosted Postgres (Neon/Supabase free tier) — that is
the task 29 deploy decision, not this task.

## Dedupe algorithm

1. Normalize the link: strip `utm_*` params, trailing slash, fragment.
2. If an item with the same `canonicalUrl` exists → duplicate; attach the
   new feed as an additional source on the surviving card.
3. Else normalize the title (lowercase, collapse whitespace, strip
   punctuation) and compare against items from the last 72h; if an exact
   normalized-title match exists AND the other item's feed is different →
   duplicate (same story syndicated).
4. Otherwise the item is new → run the on-feed-item hook (summarize + rank).

**Implemented — task 23 (2026-11-11), link dedupe only; title dedupe is
task 24.** Step 1 now strips more than `utm_*`: `normalizeLink`
(`src/lib/feed.js`) also strips the `at_*` prefix (BBC `at_medium` /
`at_campaign`), `mc_` / `pk_` / `piwik_` / `matomo_` / `sc_` prefixes,
and fbclid / gclid / msclkid / twclid / igshid / `_ga` / `si` /
HubSpot params — while keeping article-identity params (`?page=`,
`?id=`, `?v=`), so different articles never collapse (Req 4 AC3).
Step 2 runs at INSERT time in `storeItems` (`src/lib/feeds-store.js`):
a duplicate canonical URL inserts no second row; the extra feed is
recorded in the `item_sources` table (itemId, feedId) and the surviving
row is left untouched — its summary is kept and no second summary is
generated (Req 4 AC4). `GET /api/items` returns `sources[]` per item
and the `?feed=` filter matches a story under any feed that carried
it. `collapseDuplicateItems()` merges rows that duplicated before
task 23 (summary + read/star inherited). The `duplicateOf` column on
items is unused by this step — the survivor/dup relationship lives in
`item_sources` instead.

**Implemented — task 24 (2026-11-11), title dedupe + chips.** Step 3
also runs at INSERT time in `storeItems`, after the URL check:
`normalizeTitle` now strips punctuation too (lowercase, strip
non-letter/digit, collapse whitespace), so "City Unveils New Park!"
and "city unveils new park" compare equal. A story collapses onto an
existing row only when ALL of these hold: the normalized titles
match, the other row's feed is DIFFERENT, and the two `publishedAt`
values are within 72h of each other (pairwise difference — so
syndication is caught whenever the second feed is added, not only
within 72h of now). The survivor is the earliest-inserted match and
is left untouched (summary/read/star kept, Req 4 AC4); the new feed
is recorded in `item_sources`. The boundary, per Req 4 AC3: same
title + different URL in the SAME feed stays two cards (a feed
re-using a title for different articles); same title outside the 72h
window stays two cards; either item undated never title-collapses
(the window cannot be checked); an empty title never collapses. A
same-(feedId, guid) re-fetch is upserted BEFORE either dedupe check,
so a re-fetched item whose URL changed is never wrongly collapsed
onto another feed's row. `collapseTitleDuplicates()` merges rows
that duplicated by title before task 24 (same boundary, same state
merge). Chips: `src/components/SourceChips.jsx` renders the
additional sources as pills ("Also in" on cards, "Also carried by"
in the article view) from the API's `sources[]`; a single-source
story renders nothing. Tests: `test/title-dedupe.test.js` (8 cases);
`npm test` 38/38 pass.

## Ranking (digest top-10)

Score = recency weight (decays over 24h) + source-diversity bonus.
Cap: at most 3 stories from any single feed in the top 10, so one loud feed
cannot dominate the digest.

**Implemented — task 25 (2026-11-11), `src/lib/ranking.js` (pure, no I/O).**
Concrete formula: `recency = 1 − ageHours / 24` (linear, clamped to
[0, 1]; undated items are unrankable and excluded; future-dated items
clamp to 1). The diversity bonus is applied greedily during selection:
each pick re-scores the remaining candidates as `recency +
DIVERSITY_BONUS / (1 + alreadyPickedFromFeed)` (bonus 0.25: first story
from a feed +0.25, second +0.125, third +0.083), so a slightly older
story from a fresh feed can outrank a newer story from a feed already
in the digest, while recency still dominates overall. Once a feed has
3 stories picked (`MAX_PER_FEED`), its remaining stories are skipped
(cap counts the item's own feedId; a multi-source story ranks under
its surviving feed only). The digest covers the last 24h only
(`DIGEST_WINDOW_MS`); `rankDigest(items, now, opts)` returns the top
10 (`DIGEST_LIMIT`) in rank order, each with `rankScore` (the effective
score it was picked with) and 1-based `rank` attached. Ties break by
publishedAt desc, then id asc. Tests: `test/ranking.test.js` (14
cases: recency values, ordering, bonus, cap, window, ties, no-mutation);
`npm test` 52/52 pass. Verified live on the real dev DB (91 items, 4
feeds, 81 within 24h): top 10 = BBC 3, Hacker News 3, Verge 2, Ars 2 —
all 4 feeds represented, max 3 per feed, scores non-increasing; Hacker
News had 24 items within 24h but only 3 made the top 10. The digest
VIEW is task 26 — this task is the ranking logic only (no `/api/digest`
route yet).

## Summarization

- One LLM call per new item, prompt built from title + feed excerpt/content.
- Rules enforced by `.kiro/steering/summaries.md`: 2–3 sentences, neutral
  tone, no clickbait, no invented facts, "why it matters" is one line.
- Result cached in the `summary` / `whyItMatters` columns; never re-run.
- On model failure: `summaryPending = true`, show feed excerpt instead.

**Enforcement (task 22, 2026-11-11):** the prompt is not enforcement —
`src/lib/summary-rules.js` (`validateSummary`) checks every parsed
result mechanically: 2–3 sentences, one-line non-empty "why it matters",
banned clickbait words (with the steering doc's "breaking"-wire
exception), no question hooks, no direct reader address, plain text
only (no markdown), and every number / quoted phrase must appear in
the source (the checkable part of "never invent facts"). A result that
breaks a rule is retried once with a firmer prompt that NAMES the
violations; if the retry still breaks a rule, the call throws and NO
summary is stored — the story stays `summaryPending` and the excerpt is
shown. Rules no machine can check (stating a cause, labelling opinion
pieces, headline-claim matching) stay prompt-only and are listed as
`NOT_CHECKABLE` in the module. Tests: `test/summary-rules.test.js`
(validation units + parser) and `test/summarizer-enforcement.test.js`
(stub-server end-to-end), run with `npm test` (Node built-in runner,
zero new dependencies).

**Provider (task 20, decided 2026-11-11): Pollinations.ai text API —
keyless, no signup, $0.** `GET https://text.pollinations.ai/<url-encoded
prompt>?model=openai` (model `openai`, `&private=true`). No API key is
used; `SUMMARIZER_API_KEY` in `.env.example` is reserved for a future
provider swap. Overridable via `SUMMARIZER_BASE_URL` /
`SUMMARIZER_MODEL` / `SUMMARIZER_TIMEOUT_MS` (60s) /
`SUMMARIZER_CONCURRENCY` (2). Verified live: ~2–30s per call, output
follows the strict `WHY IT MATTERS:` format; a burst of 10 concurrent
calls 404s ~60% (rate limit) — the batch therefore runs at concurrency
2 with one sequential retry round after 15s, which recovered 6/6 failed
items in testing. A summary shorter than 2 sentences is retried once
with a firmer prompt (max 2 calls per item). Summarization runs in the
background after feed add / OPML import (the POST never waits); on
serverless the background work may be cut off after the response —
**resolved in task 27 (refresh scheduler): the summarize phase runs
via Next.js `after()` — see "Refresh" below.**

## Refresh (task 27, implemented 2026-11-11)

`POST /api/refresh` (and `GET`, the Vercel Cron entry point — cron jobs
can only issue GETs) polls every subscribed feed and runs the
on-feed-item hook per new item. Two phases, in `src/lib/refresh.js`:

- **Fetch phase** (in-request, fast): all feeds fetched concurrently
  (10s cap each), new items stored via `storeItems` (dedupe at insert,
  tasks 23/24), `lastFetchedAt`/`lastError` recorded per feed (new
  `updateFeedFetchState` in the store). One dead feed never stops the
  others. Returns `{ refreshedAt, feeds: [{ feedId, title, url,
  fetched, inserted, duplicates, error }], totalInserted,
  totalDuplicates, errors, summariesQueued: true }`. `inserted` counts
  brand-new rows (measured by item count before/after — `storeItems`
  also counts re-fetch upserts as "inserted", so its number is not
  used for the report). A refresh already in progress returns 409.
- **Summarize phase** (after the response, via Next.js `after()` from
  `next/server`): runs `runSummariesForFeed` per feed, sequentially
  (rate-limit safety — task 20), so previously unsummarized items get
  summaries too, not only brand-new arrivals. That is the backfill for
  the 91 pre-task-20 rows: each refresh retries them (attempts < 3)
  until they land. `after()` keeps the work alive on serverless
  instead of being cut off with the response — this resolves the task
  20 caveat for the refresh path. (Feed-add / OPML-import still use
  plain fire-and-forget; the refresh route is the reliable path.)
- **Timer:** `src/instrumentation.js` (`register()`, plain JS — no
  tsconfig in this project) starts a `setInterval` on long-running
  servers (dev + `next start`): every `REFRESH_INTERVAL_MINUTES`
  (default 30, `0` disables) it runs `refreshAndSummarize()`. No
  refresh at boot. Guarded against the build phase (`NEXT_PHASE ===
  "phase-production-build"`) so `next build` never starts a timer.
- **Deploy:** on Vercel the in-process timer does NOT fire reliably
  (serverless instances freeze between requests) — deploy uses Vercel
  Cron hitting `GET /api/refresh` instead (Hobby allows once-daily;
  the in-process timer covers the long-running Vultr fallback).
  Refreshing is idempotent and touches no user data, so the cron GET
  needs no secret. The timer and the route share one module-level
  lock, so manual / timer / cron refreshes can never overlap (the
  summarizer must never be called twice for the same item).
- **Manual refresh:** "↻ Refresh feeds" buttons on the reader list
  (home page header) and the digest sidebar — POST `/api/refresh`,
  then reload the list/digest and report "N new stories" (summaries
  land after the response and appear on the next reload).
- **Observation (pre-existing, not changed):** the intra-batch retry
  round in `runSummariesForFeed` (task 20) does not re-check the
  3-attempt cap, so one batch can push an item from 2 to 4 attempts
  (the cap is enforced at selection time in
  `listUnsummaryizedItems`). With the default 30-min timer this is
  harmless — a hopeless item exhausts after ~2 ticks and is never
  selected again — so the behavior was left as-is.

## Theming

Dark theme via CSS variables (`src/app/globals.css`):

- `--bg`: near-black `#0b0f0c`
- `--surface`: `#121712`
- `--accent`: graveyard green `#7ee787`-ish (tune in polish phase)
- `--text`, `--muted`: off-white / gray-green
- Subtle animations: card fade-in on new summary; no flashing.

## API surface (scaffold)

| Route            | Method | Purpose                              |
|------------------|--------|--------------------------------------|
| `/api/feeds`     | GET    | list feeds                           |
| `/api/feeds`     | POST   | add feed by URL                      |
| `/api/feeds/[id]`| DELETE | remove feed                          |
| `/api/feeds/import` | POST | OPML import                          |
| `/api/items`     | GET    | list items (filters: feed, read, starred) |
| `/api/items/[id]`| PATCH  | read/unread, star                    |
| `/api/digest`    | GET    | top-10 ranked stories, last 24h      |
| `/api/refresh`   | POST   | poll all feeds, run on-feed-item hook|

## Testing strategy

- Unit: link/title normalization + dedupe logic (pure functions, no I/O).
- Integration: feed parsing against saved sample RSS/Atom fixtures.
- Manual: add 3 real feeds → summaries appear → filter/rank → digest shows
  top 10 (this is also the demo-video script).
- No mainnet / paid services involved; the only external calls are feed
  fetches and the free-tier summarizer.

## Decisions deferred to core build (11–20 Nov)

- SQLite vs. Postgres for the deployed target — **decided in task 16**:
  SQLite locally, Postgres on deploy (see "Persistence" above).
- Which free-tier LLM endpoint to use for summaries (decide by cost = $0
  and reliability; API key, if any, via environment variable — never committed).
  **Decided in task 20 (2026-11-11): Pollinations.ai text API, keyless,
  $0 — see "Summarization" above.**
- Vercel vs. Vultr-box deploy (Vercel first choice; Vultr is the proven
  fallback from VeriBrief).
