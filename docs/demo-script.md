# Revenant Reader — demo script (under 3 minutes)

Target runtime: **~2:35**. Record at the live demo URL
`http://167.179.88.69:3000` with the 3 starter feeds already subscribed
(Hacker News, BBC News, The Verge — 71 stories at script time). Every beat
below was verified live on that URL during the task 30 manual pass
(2026-11-11); expected results are the observed ones, not aspirations.

## Beats

### 0:00–0:12 — Opening shot (home)
- **On screen:** home page, sidebar with the 3 feeds, story list.
- **Say:** "RSS is dead — long live RSS. Revenant Reader is an AI
  newsroom: subscribe to feeds, and agent hooks summarize, dedupe, and
  rank every story."
- **Expected:** page loads, stories visible with a 2–3 sentence AI summary
  and a "Why it matters" line on each card.

### 0:12–0:32 — Add a feed
- **On screen:** paste `https://xkcd.com/rss.xml` into "Paste an RSS /
  Atom URL…" and click "+ Add feed".
- **Say:** "Adding a feed is one paste. The parser fetches it, stores the
  stories, and the summarizer starts in the background."
- **Expected:** feed appears in the sidebar (201); 4 new stories land in
  the list. (Delete the feed again after recording — see notes.)

### 0:32–0:58 — Read a story (article view)
- **On screen:** click the top story.
- **Say:** "Opening a story shows the full summary and marks it read —
  no separate read/unread bookkeeping."
- **Expected:** article view opens with summary + "Why it matters";
  returning to the list, the story shows as read. Star it, then open the
  Starred filter — it is the only story there.

### 0:58–1:18 — Refresh + dedupe
- **On screen:** click "↻ Refresh feeds".
- **Say:** "Refresh re-polls every feed. Re-fetched stories are deduped
  by canonical URL — a second fetch of the same 71 stories adds zero
  duplicates."
- **Expected:** "N new stories" appears (0 when nothing is new); the
  story count does not grow on a re-fetch.

### 1:18–1:44 — Digest
- **On screen:** open `/digest`.
- **Say:** "The digest is the day's top 10 from the last 24 hours,
  ranked by recency with a diversity bonus — at most 3 stories per
  feed, so one loud feed can't take over."
- **Expected:** 10 numbered cards (9 if the 24 h window is thin), ranks
  #1–#10, per-feed counts 3/3/2/2 or similar; opening one marks it read.

### 1:44–2:08 — Summaries that fail gracefully
- **On screen:** find a card showing the feed excerpt with "Summary
  pending" and a "Retry summary" button.
- **Say:** "The summarizer is a free keyless model, so it sometimes
  fails. The card never breaks — it falls back to the excerpt, and a
  retry is one click, bounded at 3 attempts."
- **Expected:** excerpt visible, retry button present; a retry either
  stores a summary or records one more attempt (502 path) — the card
  stays readable either way.

### 2:08–2:26 — Empty state (record separately, fresh profile)
- **On screen:** a fresh browser profile / empty database: "Your
  newsroom is empty — for now" with 3 starter-feed cards.
- **Say:** "Starting from nothing is one click per feed — Hacker News,
  BBC, The Verge."
- **Expected:** clicking a starter adds it (201) and stories start
  flowing. (This beat needs an empty database; record it against a
  throwaway `REVENANT_DB_PATH`, not the live demo DB.)

### 2:26–2:35 — Close
- **On screen:** repo URL + live demo URL.
- **Say:** "Built with Kiro — specs, hooks, and steering rules, so
  every summary follows the same rules. Revenant Reader: RSS, reborn."
- **Expected:** `github.com/maulanaabdansakur/revenant-reader` and the
  live URL on screen.

## Recording notes
- The digest count varies with the 24 h window (9–10 observed); narrate
  "top 10" and let the on-screen count speak for itself.
- After recording the add-feed beat, DELETE the xkcd feed again so the
  demo DB returns to the 3 starter feeds (DELETE cascades to its items).
- The timer refreshes every 30 min on its own; do not wait for it on
  camera — use the manual "Refresh feeds" button.
- Known live quirk, do not hide it: the free-tier summarizer returns
  HTTP 404 on roughly a third of calls, so a few cards legitimately show
  "Summary pending" — that is the designed fallback, not a recording
  error.
