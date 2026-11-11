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

## Ranking (digest top-10)

Score = recency weight (decays over 24h) + source-diversity bonus.
Cap: at most 3 stories from any single feed in the top 10, so one loud feed
cannot dominate the digest.

## Summarization

- One LLM call per new item, prompt built from title + feed excerpt/content.
- Rules enforced by `.kiro/steering/summaries.md`: 2–3 sentences, neutral
  tone, no clickbait, no invented facts, "why it matters" is one line.
- Result cached in the `summary` / `whyItMatters` columns; never re-run.
- On model failure: `summaryPending = true`, show feed excerpt instead.

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
task 27 (refresh scheduler) / task 29 (deploy) must confirm `waitUntil`
or a cron-driven refresh so summaries still land on Vercel.

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
