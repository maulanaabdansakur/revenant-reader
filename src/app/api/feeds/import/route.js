// /api/feeds/import — OPML import (Phase 2, task 15; design doc API table).
// POST multipart/form-data with a `file` field holding an .opml file.
//   -> { added: [...feeds], skipped: [{ url, label, reason }...],
//        addedCount, skippedCount, total }
// Every outline URL is validated with the task 13 parser (fetchFeed) before
// it is stored; invalid URLs, non-feed URLs and already-subscribed URLs are
// reported in `skipped` with a reason each, never stored (Req 1 AC1-2, AC5).
// Storage is SQLite (src/lib/feeds-store.js, task 16): each added feed's
// parsed items are stored with it.

import { randomUUID } from "node:crypto";
import { fetchFeed, normalizeLink } from "@/lib/feed";
import { parseOpml } from "@/lib/opml";
import { listFeeds, findByUrl, addFeed } from "@/lib/feeds-store";

const MAX_FILE_BYTES = 1_000_000; // 1 MB — an OPML list is a few KB

export async function POST(request) {
  let form;
  try {
    form = await request.formData();
  } catch {
    return Response.json(
      { error: "Expected a multipart form upload with an OPML file." },
      { status: 400 },
    );
  }

  const file = form.get("file");
  if (!file || typeof file.text !== "function") {
    return Response.json(
      { error: "No OPML file was uploaded." },
      { status: 400 },
    );
  }
  if (file.size > MAX_FILE_BYTES) {
    return Response.json(
      { error: "That OPML file is too large (max 1 MB)." },
      { status: 400 },
    );
  }

  let outlines;
  try {
    outlines = parseOpml(await file.text());
  } catch (err) {
    return Response.json(
      { error: err instanceof Error ? err.message : "Could not read that OPML file." },
      { status: 400 },
    );
  }

  const added = [];
  const skipped = [];
  const seenInFile = new Set();

  for (const { url: rawUrl, label } of outlines) {
    const url = normalizeLink(rawUrl);
    if (!url) {
      skipped.push({ url: rawUrl, label, reason: "Not a valid http(s) URL." });
      continue;
    }
    // Same URL twice in one file counts as a duplicate, not a second feed.
    if (seenInFile.has(url)) {
      skipped.push({ url, label, reason: "Duplicate — already in this file." });
      continue;
    }
    seenInFile.add(url);

    const existing = findByUrl(url);
    if (existing) {
      skipped.push({
        url,
        label,
        reason: `Already subscribed to "${existing.title || url}".`,
      });
      continue;
    }

    let parsed;
    try {
      parsed = await fetchFeed(url);
    } catch (err) {
      skipped.push({
        url,
        label,
        reason: err instanceof Error ? err.message : "Could not fetch that feed.",
      });
      continue;
    }

    added.push(
      addFeed(
        {
          id: randomUUID(),
          url,
          title: parsed.title || label || url,
          siteUrl: parsed.siteUrl || url,
          addedAt: new Date().toISOString(),
          lastFetchedAt: new Date().toISOString(),
          lastError: null,
        },
        parsed.items,
      ),
    );
  }

  return Response.json({
    added,
    skipped,
    addedCount: added.length,
    skippedCount: skipped.length,
    total: outlines.length,
    feeds: listFeeds(),
  });
}
