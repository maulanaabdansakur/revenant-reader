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

- SQLite vs. Postgres for the deployed target (SQLite first for local dev).
- Which free-tier LLM endpoint to use for summaries (decide by cost = $0
  and reliability; API key, if any, via environment variable — never committed).
- Vercel vs. Vultr-box deploy (Vercel first choice; Vultr is the proven
  fallback from VeriBrief).
