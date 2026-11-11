// src/lib/ranking.js — digest ranking (Phase 3, task 25, Req 5).
// Pure functions, no I/O. The digest view (task 26) calls rankDigest()
// on the stored items; this module never touches the DB or the network.
//
// Design doc, "Ranking (digest top-10)":
//   Score = recency weight (decays over 24h) + source-diversity bonus.
//   Cap: at most 3 stories from any single feed in the top 10, so one
//   loud feed cannot dominate the digest.
//
// Concrete formula (this task):
//   recency(item) = 1 - ageHours / 24, linear, clamped to [0, 1].
//     A story published just now scores 1; one 12h old scores 0.5;
//     one 24h+ old scores 0 and is out of the digest window (Req 5
//     AC1: the digest covers the last 24h only). Undated items cannot
//     be ranked (no age) and are excluded; future-dated items (feed
//     clock skew) are clamped to 1, same as time.js shows the date.
//   diversity bonus = DIVERSITY_BONUS / (1 + alreadyPickedFromFeed).
//     The first story from a feed gets the full +0.25, the second
//     +0.125, the third +0.083 — so a slightly older story from a
//     fresh feed can outrank a newer story from a feed already in the
//     digest, but recency still dominates overall. The bonus is
//     applied greedily: each pick re-scores the remaining candidates
//     against the feeds already picked, so the ranking is a selection
//     order, not a fixed sort.
//   cap: once a feed has MAX_PER_FEED (3) stories picked, its remaining
//     stories are skipped. The cap counts the item's own feedId (the
//     primary feed); a multi-source story (task 23/24 dedupe) ranks
//     under its surviving feed only.
//   ties: publishedAt desc, then id asc — deterministic.
//
// rankDigest returns the picked items in rank order, each with
// `rankScore` (the effective score it was picked with) and `rank`
// (1-based) attached. Items are not mutated — the returned objects
// are shallow copies.

export const DIGEST_WINDOW_MS = 24 * 3600 * 1000;
export const DIGEST_LIMIT = 10;
export const MAX_PER_FEED = 3;
export const DIVERSITY_BONUS = 0.25;

// Recency weight of one item: 1 (just published) down to 0 (window old).
// Returns null when the item has no usable publishedAt (undated or
// unparseable) — such items are unrankable, not zero-ranked.
export function recencyScore(publishedAt, now = Date.now(), windowMs = DIGEST_WINDOW_MS) {
  if (!publishedAt) return null;
  const publishedMs = new Date(publishedAt).getTime();
  if (Number.isNaN(publishedMs)) return null;
  const nowMs = now instanceof Date ? now.getTime() : now;
  const ageMs = nowMs - publishedMs;
  if (ageMs <= 0) return 1; // future-dated (clock skew): freshest
  if (ageMs >= windowMs) return 0;
  return 1 - ageMs / windowMs;
}

// Rank the digest: the top `limit` stories from the last 24h.
// `items` are plain item objects ({ id, feedId, publishedAt, ... }).
// `now` may be a Date or epoch ms (defaults to now). Options override
// the digest constants — tests and task 26 use the defaults.
export function rankDigest(items, now = Date.now(), opts = {}) {
  const limit = opts.limit ?? DIGEST_LIMIT;
  const maxPerFeed = opts.maxPerFeed ?? MAX_PER_FEED;
  const windowMs = opts.windowMs ?? DIGEST_WINDOW_MS;
  if (limit <= 0 || maxPerFeed <= 0) return [];
  const nowMs = now instanceof Date ? now.getTime() : now;

  // Candidates: dated, inside the window. Undated items and items
  // older than the window are excluded, not ranked last — the digest
  // is defined as the last-24h stories (Req 5 AC1).
  const candidates = [];
  for (const item of items) {
    const recency = recencyScore(item.publishedAt, nowMs, windowMs);
    if (recency === null || recency <= 0) continue;
    candidates.push({ item, recency });
  }

  const picked = [];
  const pickedPerFeed = new Map();
  const remaining = [...candidates];
  while (picked.length < limit && remaining.length > 0) {
    let bestIdx = -1;
    let bestScore = -Infinity;
    for (let i = 0; i < remaining.length; i += 1) {
      const { item, recency } = remaining[i];
      const feedId = item.feedId ?? "";
      const already = pickedPerFeed.get(feedId) ?? 0;
      if (already >= maxPerFeed) continue;
      const effective = recency + DIVERSITY_BONUS / (1 + already);
      if (bestIdx === -1 || effective > bestScore) {
        bestIdx = i;
        bestScore = effective;
        continue;
      }
      if (effective === bestScore) {
        // Deterministic tie-break: newer first, then id ascending.
        const best = remaining[bestIdx];
        const t = new Date(item.publishedAt).getTime();
        const bt = new Date(best.item.publishedAt).getTime();
        if (t > bt || (t === bt && String(item.id) < String(best.item.id))) {
          bestIdx = i;
          bestScore = effective;
        }
      }
    }
    if (bestIdx === -1) break; // every remaining feed hit its cap
    const { item } = remaining.splice(bestIdx, 1)[0];
    const feedId = item.feedId ?? "";
    pickedPerFeed.set(feedId, (pickedPerFeed.get(feedId) ?? 0) + 1);
    picked.push({
      ...item,
      rankScore: bestScore,
      rank: picked.length + 1,
    });
  }
  return picked;
}
