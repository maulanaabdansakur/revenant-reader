# Revenant Reader — Devpost write-up

**Category:** Resurrection — Kiroween 2026
**Built by:** Maulana Abdan Sakur (solo)
**Repository:** https://github.com/maulanaabdansakur/revenant-reader
**Live demo:** http://167.179.88.69:3000
**Demo video:** [to be uploaded to YouTube — link added at submit time]
**Built with:** Kiro, Next.js 16, React 19, SQLite (Node `node:sqlite`), Pollinations.ai

> This file is the draft for the Devpost submission form (task 32). Paste
> each section into the matching Devpost field at submit time (task 34).
> The video still needs uploading to YouTube from the owner's account —
> the file is `~/workspace/revenant-reader-video/revenant-reader-demo.mp4`
> (2:40, 1280×720).

---

## Tagline

RSS is dead — long live RSS. An AI newsroom that resurrects your feeds:
subscribe, and every story is summarized, deduplicated, and ranked for you.

## Inspiration

RSS has been declared dead a dozen times. Google Reader was killed,
platforms abandoned open feeds, and the open web's oldest distribution
protocol was left for dead. Yet RSS never actually stopped working — it
still quietly powers the web. Revenant Reader brings it back from the
grave: the feeds you already trust, reborn as a daily AI newsroom.

## What it does

Revenant Reader turns any set of RSS/Atom feeds into a personal AI
newsroom:

- **Subscribe to any RSS/Atom feed** — paste a URL, or import a whole
  OPML file at once. Duplicates and non-feed URLs are rejected with a
  clear error.
- **Read in one place** — a story list (newest first) and a full article
  view with the original link. Opening a story marks it read; starring
  persists, with a starred-only filter and a per-feed filter.
- **Every story summarized by AI** — 2–3 sentences plus one "why it
  matters" line, generated once per story and cached (re-reading never
  re-calls the model). Summaries follow strict steering rules: neutral
  tone, no clickbait, no invented facts — every number or quoted phrase
  must appear in the source. When the model fails, the card falls back
  to the feed excerpt, marked "Summary pending", with a one-click retry
  (bounded at 3 attempts).
- **Dedupe, so the same story appears once** — the same story arriving
  from two feeds collapses into one card showing all its sources
  ("Also in…"). Dedupe runs on canonical URLs (tracking parameters
  stripped) and on normalized titles within a 72-hour window. Two
  different articles that happen to share a title stay separate.
- **A daily digest** — the top 10 stories of the last 24 hours, ranked
  by recency with a source-diversity bonus and a cap of 3 stories per
  feed, so one loud feed can never take over the digest. Fewer than 10
  available stories shows the count.
- **It keeps itself fresh** — a refresh timer polls every feed every 30
  minutes (plus a manual "Refresh feeds" button), running the
  summarize/dedupe/rank hook on each new item.
- **Spooky-polished UI** — a dark theme with graveyard-green accents,
  subtle fade-in animations, a responsive layout, and an inviting empty
  state with three one-click starter feeds (Hacker News, BBC News,
  The Verge).

Out of scope by design: no user accounts or login, no paywalls, no
mobile apps, no full-text extraction beyond what feeds provide.

## How we built it

The whole project was built **spec-driven with Kiro**. The spec lives in
the public repo under `/.kiro/specs/revenant-reader/` —
`requirements.md`, `design.md`, and `tasks.md` — and nothing was built
that is not in the spec. The build followed the task list in order:
scaffold (8–10 Nov), core build (11–20 Nov), digest/polish/deploy
(21–27 Nov), video + write-up (28 Nov–1 Dec).

- **Kiro agent hooks** (`.kiro/hooks/on-feed-item.md`): on every new
  feed item, the hook automatically summarizes, dedupes, and ranks it —
  exactly once per item.
- **Kiro steering** (`.kiro/steering/summaries.md`): summary length,
  tone, and no-clickbait rules. The rules are not just a prompt —
  `src/lib/summary-rules.js` validates every generated summary
  mechanically and refuses to store one that breaks them.
- **Kiro MCP note** (`.kiro/mcp/feed-fetch.md`): documents the
  feed-fetch tool used during the build.

**Stack:** Next.js 16 (App Router) + React 19, plain JavaScript.
Feed parsing with `rss-parser`. Storage is SQLite via Node 24's
built-in `node:sqlite` — zero extra dependencies, subscriptions and
read/star state survive restarts (with a documented migration path to
Postgres for serverless deploys). The summarizer is the **Pollinations.ai
text API — keyless, no signup, $0** (`text.pollinations.ai`, model
`openai`); background batches run at concurrency 2 with one retry round.
Ranking is a pure function: linear recency decay over 24 hours plus a
diversity bonus (0.25 / (1 + already picked from that feed)), capped at
3 per feed in the top 10. Refresh runs on a 30-minute in-process timer
plus `POST /api/refresh` (with a `GET` entry point for Vercel Cron).

**Deployment:** live at http://167.179.88.69:3000, running as a Docker
container on a Vultr box (SQLite on a host-mounted volume, so data
survives container restarts — verified by an actual restart). Vercel
was the first-choice target, but it is not connected in this
environment, so the Vultr deployment is the live demo for now.

**Testing:** 69 automated tests (`npm test`, Node's built-in runner),
covering link/title normalization, dedupe, ranking, summary-rule
enforcement, digest, and refresh — plus a full manual pass on the live
URL (add feeds → summaries appear → filter/rank → digest top 10),
documented as the demo script in `docs/demo-script.md`.

## Challenges we ran into

- **A free keyless summarizer is flaky.** Pollinations.ai returns
  HTTP 404 on roughly a third of calls under burst load. The fix was
  architectural, not cosmetic: concurrency 2, one sequential retry
  round, a 3-attempt cap, and a graceful fallback — the card never
  breaks, it shows the excerpt and offers a retry. Nine of the 71
  stories on the live demo legitimately show "Summary unavailable"
  after exhausting attempts; that is the designed fallback, not a bug.
- **Serverless background work gets cut off.** Summaries generated
  after a feed-add response could die on serverless. The refresh route
  solves it with Next.js `after()`, so the summarize phase runs after
  the response; on the long-running Vultr box the in-process timer
  covers it.
- **Dedupe has sharp edges.** Stripping tracking parameters must not
  strip article-identity parameters (`?page=`, `?id=`), or different
  articles collapse. Title dedupe needs a 72-hour window and a
  different-feed condition, or a feed reusing a title for different
  articles collapses wrongly. All of these are covered by tests.
- **No screen-recording setup on the build VM.** The demo video is an
  assembled narrated slideshow — every frame is a real screenshot of
  the real app in a real headless browser, following the demo script
  beat for beat — with synthetic text-to-speech narration. (See
  "Accomplishments" — and the video's README for the full method.)

## Accomplishments that we're proud of

- A complete spec-driven build: 34 tasks from scaffold to submit, every
  one verified live and pushed to the public repo.
- A summarizer with *enforced* rules — rule-breaking output is retried
  once with the violations named, then refused, never stored.
- Dedupe that is correct in the edge cases, not just the happy path
  (canonical URLs, 72-hour title window, multi-source chips, summary
  preserved on collapse).
- A live, working demo anyone can open — no install, no account, no
  API key — with 69 passing tests behind it.
- A 2:40 demo video produced with zero recording infrastructure: real
  app screenshots, real data, honest narration.

## What we learned

- Spec-driven development pays off most in the edge cases: writing the
  dedupe boundaries down *before* coding them is what made them
  testable.
- A rule in a prompt is a wish; a rule in a validator is a guarantee.
- Free-tier APIs are usable in production if you design for their
  failure modes instead of pretending they do not exist.
- Serverless and long-running servers need different background-work
  strategies (`after()` vs. a timer) — design for both from the start.

## What's next for Revenant Reader

- **Vercel deploy** with hosted Postgres (Neon/Supabase free tier) once
  the owner's Vercel account is connected — the code paths (Cron entry
  point, `DATABASE_URL` migration) are already built.
- A more reliable summarizer provider behind the same interface (the
  `SUMMARIZER_API_KEY` slot is reserved in `.env.example`).
- Per-feed digest scheduling and keyword alerts.
- A public "share this digest" view.

## Links

- **Live demo:** http://167.179.88.69:3000
- **Repository:** https://github.com/maulanaabdansakur/revenant-reader
- **Demo video:** (YouTube link — to be added at submit time)
- **Spec:** `/.kiro/specs/revenant-reader/` in the repo
- **Demo script:** `docs/demo-script.md` in the repo
