# Agent hook — on-feed-item

**Trigger:** a new story item arrives from any subscribed feed (after fetch +
parse, before it is shown in the reader).
**Purpose:** summarize + dedupe + rank, automatically, exactly once per item.

## Steps (in order)

### 1. Normalize
- Canonicalize the link: strip `utm_*` params, trailing slash, fragment.
- Normalize the title: trim, collapse whitespace, lowercase for comparison.
- Parse `publishedAt`; fall back to fetch time if the feed omits it.

### 2. Dedupe (see design.md)
- If an item with the same `canonicalUrl` exists → no second row is
  inserted; the new feed is recorded as an additional source
  (`item_sources` table, task 23). **Stop here — do not summarize.**
- Else if an item from a different feed in the last 72h has the same
  normalized title → same handling. **Stop here.**
- Otherwise the item is new → continue.

### 3. Summarize
- Build the prompt from the item's title + feed excerpt/content, following
  `.kiro/steering/summaries.md` (2–3 sentences + one "why it matters" line,
  neutral tone, no clickbait, no invented facts).
- One model call per item. Store the result in `summary` / `whyItMatters`.
- On model failure: set `summaryPending = true`, show the feed excerpt,
  and retry on the next refresh (max 3 attempts, then leave as pending).

### 4. Rank
- Compute the digest score: recency weight (decays over 24h) + a small
  source-diversity bonus. Store it on the item; the digest view reads the
  top 10 by score with a max-3-per-feed cap.

## Invariants

- The hook never runs twice for the same item (guard on `guid` + `feedId`).
- A duplicate never triggers a summary call (saves model calls and keeps
  one canonical summary per story).
- The hook never blocks the feed refresh: failures are recorded on the item
  (`summaryPending`) and the refresh continues.
- No user data leaves the server except the story text sent to the
  summarizer for that one call.
