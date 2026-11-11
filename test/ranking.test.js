// test/ranking.test.js — digest ranking (Phase 3, task 25, Req 5 +
// design doc, "Ranking (digest top-10)").
// Run with `npm test` (node --test). Pure functions, no I/O, no DB.

import test from "node:test";
import assert from "node:assert/strict";

import {
  DIGEST_WINDOW_MS,
  DIGEST_LIMIT,
  MAX_PER_FEED,
  DIVERSITY_BONUS,
  recencyScore,
  rankDigest,
} from "../src/lib/ranking.js";

const HOUR = 3600 * 1000;
const NOW = new Date("2026-11-11T07:20:00.000Z").getTime();
const iso = (ms) => new Date(ms).toISOString();

function item(id, feedId, ageHours) {
  return {
    id,
    feedId,
    title: `Story ${id}`,
    publishedAt: iso(NOW - ageHours * HOUR),
  };
}

// --- recencyScore ----------------------------------------------------------

test("recencyScore: just published scores 1, 12h scores 0.5, 24h+ scores 0", () => {
  assert.equal(recencyScore(iso(NOW), NOW), 1);
  assert.equal(recencyScore(iso(NOW - 12 * HOUR), NOW), 0.5);
  assert.equal(recencyScore(iso(NOW - 6 * HOUR), NOW), 0.75);
  assert.equal(recencyScore(iso(NOW - 24 * HOUR), NOW), 0);
  assert.equal(recencyScore(iso(NOW - 48 * HOUR), NOW), 0);
});

test("recencyScore: future-dated (clock skew) clamps to 1", () => {
  assert.equal(recencyScore(iso(NOW + 2 * HOUR), NOW), 1);
});

test("recencyScore: undated or invalid dates are unrankable (null)", () => {
  assert.equal(recencyScore(null, NOW), null);
  assert.equal(recencyScore(undefined, NOW), null);
  assert.equal(recencyScore("", NOW), null);
  assert.equal(recencyScore("not-a-date", NOW), null);
});

// --- rankDigest: ordering ---------------------------------------------------

test("rankDigest orders newest first when all stories share one feed", () => {
  const ranked = rankDigest(
    [item("old", "feed-a", 10), item("new", "feed-a", 1), item("mid", "feed-a", 5)],
    NOW,
  );
  assert.deepEqual(
    ranked.map((r) => r.id),
    ["new", "mid", "old"],
  );
  assert.ok(ranked[0].rankScore > ranked[1].rankScore);
  assert.ok(ranked[1].rankScore > ranked[2].rankScore);
  assert.deepEqual(
    ranked.map((r) => r.rank),
    [1, 2, 3],
  );
});

test("rankDigest attaches rankScore and 1-based rank", () => {
  const ranked = rankDigest([item("a", "feed-a", 1)], NOW);
  assert.equal(ranked.length, 1);
  assert.equal(ranked[0].rank, 1);
  // Fresh story from a fresh feed: recency ~0.958 + full bonus 0.25.
  assert.ok(Math.abs(ranked[0].rankScore - (1 - 1 / 24 + DIVERSITY_BONUS)) < 1e-9);
});

// --- rankDigest: diversity bonus --------------------------------------------

test("diversity bonus: an older story from a fresh feed outranks a newer story from a picked feed", () => {
  // Feed A: 1h and 2h old. Feed B: 3h old.
  // Pick 1: A(1h) = 0.958 + 0.25 = 1.208 (highest).
  // Pick 2: A(2h) = 0.917 + 0.125 = 1.042 vs B(3h) = 0.875 + 0.25 = 1.125
  //   → B wins the second slot despite being older.
  const ranked = rankDigest(
    [item("a1", "feed-a", 1), item("a2", "feed-a", 2), item("b1", "feed-b", 3)],
    NOW,
  );
  assert.deepEqual(
    ranked.map((r) => r.id),
    ["a1", "b1", "a2"],
  );
});

test("diversity bonus shrinks per pick from the same feed", () => {
  const ranked = rankDigest(
    [item("a1", "feed-a", 1), item("a2", "feed-a", 1), item("a3", "feed-a", 1)],
    NOW,
  );
  const recency = 1 - 1 / 24;
  assert.ok(Math.abs(ranked[0].rankScore - (recency + DIVERSITY_BONUS)) < 1e-9);
  assert.ok(Math.abs(ranked[1].rankScore - (recency + DIVERSITY_BONUS / 2)) < 1e-9);
  assert.ok(Math.abs(ranked[2].rankScore - (recency + DIVERSITY_BONUS / 3)) < 1e-9);
});

// --- rankDigest: per-feed cap -------------------------------------------------

test("cap: one loud feed contributes at most 3 stories to the top 10", () => {
  const loud = Array.from({ length: 10 }, (_, i) => item(`loud-${i}`, "feed-loud", 0.5 + i * 0.2));
  const quiet = [item("q1", "feed-quiet", 2), item("q2", "feed-quiet", 3)];
  const ranked = rankDigest([...loud, ...quiet], NOW);
  assert.equal(ranked.length, 5); // 3 loud + 2 quiet
  assert.equal(ranked.filter((r) => r.feedId === "feed-loud").length, 3);
  assert.equal(ranked.filter((r) => r.feedId === "feed-quiet").length, 2);
  // The 3 loud picks are the 3 newest loud stories.
  assert.deepEqual(
    ranked.filter((r) => r.feedId === "feed-loud").map((r) => r.id),
    ["loud-0", "loud-1", "loud-2"],
  );
});

test("cap: with 4 feeds of 10 fresh stories each, the top 10 holds at most 3 per feed", () => {
  const items = [];
  for (const feed of ["f1", "f2", "f3", "f4"]) {
    for (let i = 0; i < 10; i += 1) items.push(item(`${feed}-${i}`, feed, 0.5 + i * 0.1));
  }
  const ranked = rankDigest(items, NOW);
  assert.equal(ranked.length, DIGEST_LIMIT);
  for (const feed of ["f1", "f2", "f3", "f4"]) {
    const n = ranked.filter((r) => r.feedId === feed).length;
    assert.ok(n <= MAX_PER_FEED, `${feed} has ${n} stories, over the cap`);
    assert.ok(n >= 2, `${feed} has only ${n} stories — diversity bonus should spread picks`);
  }
});

// --- rankDigest: window + exclusions -------------------------------------------

test("window: stories older than 24h and undated stories are excluded", () => {
  const ranked = rankDigest(
    [
      item("fresh", "feed-a", 1),
      item("old", "feed-a", 25),
      item("edge", "feed-a", 23.9),
      { id: "undated", feedId: "feed-a", title: "No date", publishedAt: null },
      { id: "bad-date", feedId: "feed-a", title: "Bad date", publishedAt: "garbage" },
    ],
    NOW,
  );
  assert.deepEqual(
    ranked.map((r) => r.id),
    ["fresh", "edge"],
  );
});

test("rankDigest: empty input ranks empty; limit is honoured", () => {
  assert.deepEqual(rankDigest([], NOW), []);
  const many = Array.from({ length: 20 }, (_, i) => item(`s${i}`, `feed-${i % 5}`, 1 + i * 0.1));
  assert.equal(rankDigest(many, NOW).length, DIGEST_LIMIT);
  assert.equal(rankDigest(many, NOW, { limit: 5 }).length, 5);
  assert.deepEqual(rankDigest(many, NOW, { limit: 0 }), []);
});

test("rankDigest: deterministic tie-break — same time, lower id first", () => {
  const ranked = rankDigest(
    [item("b", "feed-a", 2), item("a", "feed-b", 2), item("c", "feed-c", 2)],
    NOW,
  );
  // All three have the same recency and each is the first pick from
  // its feed (same bonus), so the tie-break decides: id ascending.
  assert.deepEqual(
    ranked.map((r) => r.id),
    ["a", "b", "c"],
  );
});

test("rankDigest does not mutate the input items", () => {
  const items = [item("a", "feed-a", 1), item("b", "feed-b", 2)];
  const before = JSON.stringify(items);
  rankDigest(items, NOW);
  assert.equal(JSON.stringify(items), before);
  assert.equal("rankScore" in items[0], false);
});

test("constants match the design doc (24h window, top 10, max 3 per feed)", () => {
  assert.equal(DIGEST_WINDOW_MS, 24 * 3600 * 1000);
  assert.equal(DIGEST_LIMIT, 10);
  assert.equal(MAX_PER_FEED, 3);
});
