// test/starter-feeds.test.js — the 3 starter feeds the empty state offers
// (Phase 3, task 28, Req 6 AC4). Pure data, no I/O, no DB.

import test from "node:test";
import assert from "node:assert/strict";

import { STARTER_FEEDS } from "../src/lib/starter-feeds.js";

test("exactly three starter feeds", () => {
  assert.equal(STARTER_FEEDS.length, 3);
});

test("each starter has a title, a unique https URL and a blurb", () => {
  const urls = new Set();
  for (const feed of STARTER_FEEDS) {
    assert.equal(typeof feed.title, "string");
    assert.ok(feed.title.length > 0, "title must not be empty");
    assert.equal(typeof feed.url, "string");
    assert.ok(feed.url.startsWith("https://"), `${feed.url} must be https`);
    assert.ok(!urls.has(feed.url), `${feed.url} listed twice`);
    urls.add(feed.url);
    assert.equal(typeof feed.blurb, "string");
    assert.ok(feed.blurb.length > 0, "blurb must not be empty");
  }
});

test("the three starters are Hacker News, BBC News and The Verge", () => {
  const titles = STARTER_FEEDS.map((f) => f.title).sort();
  assert.deepEqual(titles, ["BBC News", "Hacker News", "The Verge"]);
  const urls = STARTER_FEEDS.map((f) => f.url);
  assert.ok(urls.some((u) => u.includes("ycombinator.com")));
  assert.ok(urls.some((u) => u.includes("bbci.co.uk")));
  assert.ok(urls.some((u) => u.includes("theverge.com")));
});
