// Digest page — daily top-10 ranked stories (last 24h) (Phase 3,
// task 26, Req 5). Fetches GET /api/digest and renders the numbered
// DigestView. Opening a story opens the same ArticleView as the reader
// list and marks it read (Req 5 AC4) — the open/patch/retry callbacks
// mirror the home page (page.jsx, tasks 18/19/21): patchItem merges the
// updated item into the digest list and the open article, retrySummary
// does the same for a manual summary retry.

"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import DigestView from "@/components/DigestView";
import ArticleView from "@/components/ArticleView";

export default function DigestPage() {
  const [openStory, setOpenStory] = useState(null);
  const [stories, setStories] = useState(null); // null = loading
  const [count, setCount] = useState(0);
  const [limit, setLimit] = useState(10);
  const [error, setError] = useState("");
  // Task 27: manual feed refresh (same as the reader list) — POST
  // /api/refresh polls all feeds, then the digest is reloaded so new
  // stories can rank in.
  const [refreshingFeeds, setRefreshingFeeds] = useState(false);
  // Scroll position of the digest before an article was opened, so
  // "Back to digest" can restore it (same pattern as task 18).
  const listScrollYRef = useRef(0);

  const fetchDigest = useCallback(async () => {
    setError("");
    try {
      const res = await fetch("/api/digest");
      const data = await res.json().catch(() => ({}));
      setStories(Array.isArray(data.stories) ? data.stories : []);
      setCount(typeof data.count === "number" ? data.count : 0);
      setLimit(typeof data.limit === "number" ? data.limit : 10);
    } catch {
      setError("Could not load the digest — try again.");
      setStories([]);
    }
  }, []);

  useEffect(() => {
    fetchDigest();
  }, [fetchDigest]);

  const refreshFeeds = useCallback(async () => {
    setRefreshingFeeds(true);
    setError("");
    try {
      const res = await fetch("/api/refresh", { method: "POST" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data?.error || "Refresh failed — try again.");
        return;
      }
      fetchDigest();
    } catch {
      setError("Could not reach the server — try again.");
    } finally {
      setRefreshingFeeds(false);
    }
  }, [fetchDigest]);

  // Persist a read/star change and reflect it in the digest (and in the
  // open article view, when it is the same story).
  const patchItem = useCallback(async (id, patch) => {
    try {
      const res = await fetch(`/api/items/${encodeURIComponent(id)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.item) {
        setError(data?.error || "Could not save that change.");
        return;
      }
      const updated = data.item;
      setStories((prev) =>
        prev === null
          ? prev
          : prev.map((it) => (it.id === id ? { ...it, ...updated } : it)),
      );
      setOpenStory((prev) =>
        prev && prev.id === id ? { ...prev, ...updated } : prev,
      );
    } catch {
      setError("Could not reach the server — try again.");
    }
  }, []);

  // One manual summary retry per story (task 21 route), merged into the
  // digest list and the open article like patchItem above.
  const retrySummary = useCallback(async (story) => {
    try {
      const res = await fetch(
        `/api/items/${encodeURIComponent(story.id)}/summarize`,
        { method: "POST" },
      );
      const data = await res.json().catch(() => ({}));
      if (data.item) {
        const updated = data.item;
        setStories((prev) =>
          prev === null
            ? prev
            : prev.map((it) => (it.id === story.id ? { ...it, ...updated } : it)),
        );
        setOpenStory((prev) =>
          prev && prev.id === story.id ? { ...prev, ...updated } : prev,
        );
      }
      if (!res.ok) {
        setError(data?.error || "Summary retry failed — try again later.");
      }
    } catch {
      setError("Could not reach the server — try again.");
    }
  }, []);

  const openArticle = useCallback(
    (story) => {
      listScrollYRef.current = window.scrollY;
      setOpenStory(story);
      // Opening a story from the digest marks it read (Req 5 AC4),
      // same as from the reader list (Req 2 AC3).
      if (!story.read) patchItem(story.id, { read: true });
    },
    [patchItem],
  );

  const toggleStar = useCallback(
    (story) => patchItem(story.id, { starred: !story.starred }),
    [patchItem],
  );

  const toggleRead = useCallback(
    (story) => patchItem(story.id, { read: !story.read }),
    [patchItem],
  );

  // Restore the digest scroll position when returning from an article.
  useEffect(() => {
    if (!openStory && listScrollYRef.current > 0) {
      window.scrollTo(0, listScrollYRef.current);
      listScrollYRef.current = 0;
    }
  }, [openStory]);

  return (
    <div className="layout">
      <aside className="sidebar">
        <h1 className="brand">
          <span className="glyph">☠</span> Revenant Reader
        </h1>
        <p className="tagline">RSS, risen from the dead — an AI newsroom.</p>
        <p>
          <Link href="/">← Back to reader</Link>
        </p>
        <p className="toolbar">
          <button type="button" onClick={fetchDigest}>
            Refresh digest
          </button>
          <button type="button" onClick={refreshFeeds} disabled={refreshingFeeds}>
            {refreshingFeeds ? "Refreshing…" : "↻ Refresh feeds"}
          </button>
        </p>
      </aside>
      <main className="main">
        {openStory ? (
          <ArticleView
            story={openStory}
            onBack={() => setOpenStory(null)}
            onToggleStar={toggleStar}
            onToggleRead={toggleRead}
            onRetrySummary={retrySummary}
          />
        ) : (
          <DigestView
            stories={stories}
            count={count}
            limit={limit}
            loading={stories === null}
            error={error}
            onOpen={openArticle}
            onToggleStar={toggleStar}
            onToggleRead={toggleRead}
            onRetrySummary={retrySummary}
          />
        )}
      </main>
    </div>
  );
}
