# Revenant Reader — RSS, reborn as an AI newsroom

**Kiroween 2026 — Resurrection category.** RSS is canonically dead tech:
declared dead a dozen times, abandoned by mainstream platforms, yet still
quietly powering the open web. Revenant Reader brings it back from the grave.

Subscribe to any RSS/Atom feed, and Kiro agent hooks automatically summarize,
deduplicate, and rank every new story — a clean modern reader UI with a
spooky-but-polished dark theme (graveyard-green accents) presents the result
as a daily AI newsroom.

## What it does (MVP)

1. **Add/remove RSS/Atom feeds** (URL + OPML import).
2. **Reader:** story list + article view, read/unread, starring.
3. **AI summary per story:** 2–3 sentences + one "why it matters" line,
   cached — never re-run on read.
4. **Dedupe:** the same story from multiple feeds collapses to one card.
5. **Daily digest:** top 10 ranked stories from the last 24 hours.
6. **Spooky-polished UI:** dark theme, graveyard-green accents, subtle
   animations.
7. **Deploy live** (Vercel first choice; Vultr box fallback).

Out of scope: user accounts/login, paywalls, mobile apps, podcast support,
full-text extraction beyond feeds.

## Tech

- **Next.js (App Router)** + React (plain JavaScript for the scaffold —
  TypeScript is a deferred decision for the core-build phase)
- Feed parsing: `rss-parser`
- Storage: SQLite (local dev) → Postgres (deployed)
- Summarizer: one free-tier LLM call per new item, cached
- Deploy: Vercel (first choice)

## How Kiro was used

This project was built spec-driven with Kiro:

- **`/.kiro/specs/revenant-reader/`** — `requirements.md`, `design.md`,
  `tasks.md`: the spec the whole build follows. Nothing is built that is not
  in the spec.
- **Agent hooks** — `.kiro/hooks/on-feed-item.md`: on every new feed item,
  automatically summarize + dedupe + rank, exactly once per item.
- **Steering** — `.kiro/steering/summaries.md`: summary length, tone, and
  no-clickbait rules enforced on every generated summary.
- **MCP** — `.kiro/mcp/feed-fetch.md`: documents the feed-fetch tool the
  agent uses during the build (fetch + parse RSS/Atom).

## Run locally

```bash
npm install
npm run dev      # http://localhost:3000
npm run build    # production build
npm start        # serve the production build
```

No API keys are needed for the scaffold. The summarizer key (if any) is read
from an environment variable in the core-build phase — never committed.

## Project status

- **8–10 Nov 2026:** scaffold + `/.kiro/` specs (this repo state).
- **11–20 Nov:** core build (feeds, reader, summaries, dedupe).
- **21–27 Nov:** digest view, polish, deploy live.
- **28 Nov–1 Dec:** demo video (< 3 min) + Devpost write-up.
- **Deadline:** 5 Dec 2026 05:00 WIB.

Built solo by Maulana Abdan Sakur for Kiroween 2026.
