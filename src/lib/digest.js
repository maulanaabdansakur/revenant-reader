// src/lib/digest.js — daily digest computation (Phase 3, task 26, Req 5).
// Kept out of the route file so the logic is unit-testable with a plain
// node import (the route uses the @/ alias, which node --test cannot
// resolve). The route is a one-call wrapper around getDigest().
//
// getDigest() ranks the stored items with rankDigest (task 25 — recency
// + source-diversity bonus, max 3 per feed) over listItemsWithSource()
// (same card shape as /api/items) and returns the digest payload:
// { stories, count, limit, windowHours }.

import { listItemsWithSource } from "./feeds-store.js";
import {
  rankDigest,
  DIGEST_LIMIT,
  DIGEST_WINDOW_MS,
} from "./ranking.js";

export function getDigest() {
  const stories = rankDigest(listItemsWithSource());
  return {
    stories,
    count: stories.length,
    limit: DIGEST_LIMIT,
    windowHours: DIGEST_WINDOW_MS / 3600 / 1000,
  };
}
