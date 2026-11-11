// Home — reader: feed sidebar + story list + article view.
// Phase 2, task 17: real stories from /api/items (SQLite, newest first),
// replacing the scaffold sample data. Selecting a feed filters the list;
// adding/removing/importing a feed refreshes it via onFeedsChanged.
// Phase 2, task 18: opening a story saves the list scroll position and
// going back restores it, so the list state (filter + position) survives
// the round trip.
// Phase 2, task 19: opening a story marks it read (persisted in SQLite
// via PATCH /api/items/[id]); star and read/unread toggles persist too;
// "Starred only" filter (?starred=1) and the per-feed filter both work.
// Phase 2, task 21: one manual summary retry per story (POST
// /api/items/[id]/summarize), wired into StoryCard and ArticleView.

"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import FeedList from "@/components/FeedList";
import StoryCard from "@/components/StoryCard";
import ArticleView from "@/components/ArticleView";

export default function Home() {
  const [activeFeed, setActiveFeed] = useState(null);
  const [starredOnly, setStarredOnly] = useState(false);
  const [openStory, setOpenStory] = useState(null);
  const [items, setItems] = useState(null); // null = loading
  const [error, setError] = useState("");
  // Task 27: manual refresh state — the button POSTs /api/refresh
  // (polls all feeds, stores new items, queues summaries in the
  // background), then reloads the list. refreshInfo reports the
  // outcome; summaries land after the response and appear on the next
  // list reload (or the next refresh).
  const [refreshing, setRefreshing] = useState(false);
  const [refreshInfo, setRefreshInfo] = useState("");
  // Scroll position of the story list before an article was opened, so
  // "Back to list" can restore it (task 18).
  const listScrollYRef = useRef(0);

  const fetchItems = useCallback(async (feedId, starred) => {
    setError("");
    try {
      const params = new URLSearchParams();
      if (feedId) params.set("feed", feedId);
      if (starred) params.set("starred", "1");
      const query = params.toString();
      const res = await fetch(query ? `/api/items?${query}` : "/api/items");
      const data = await res.json().catch(() => ({}));
      setItems(Array.isArray(data.items) ? data.items : []);
    } catch {
      setError("Could not load stories — try again.");
      setItems([]);
    }
  }, []);

  useEffect(() => {
    fetchItems(activeFeed, starredOnly);
  }, [activeFeed, starredOnly, fetchItems]);

  // Task 27: manual refresh — POST /api/refresh polls every subscribed
  // feed and stores new items (dedupe at insert); summaries are queued
  // in the background by the route and land after the response, so the
  // list is reloaded now (new stories show immediately, summaries
  // appear as they are generated).
  const refreshFeeds = useCallback(async () => {
    setRefreshing(true);
    setRefreshInfo("");
    setError("");
    try {
      const res = await fetch("/api/refresh", { method: "POST" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data?.error || "Refresh failed — try again.");
        return;
      }
      const failed = (data.feeds || []).filter((f) => f.error);
      setRefreshInfo(
        `Refreshed ${data.feeds?.length ?? 0} feeds: ${data.totalInserted ?? 0} new stories` +
          (failed.length
            ? `, ${failed.length} feed${failed.length > 1 ? "s" : ""} failed (${failed[0].title})`
            : "") +
          ". Summaries are on their way.",
      );
      fetchItems(activeFeed, starredOnly);
    } catch {
      setError("Could not reach the server — try again.");
    } finally {
      setRefreshing(false);
    }
  }, [activeFeed, starredOnly, fetchItems]);

  // Persist a read/star change and reflect it in the list (and in the
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
      setItems((prev) =>
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

  // Phase 2, task 21: one manual summary retry per story — POST
// /api/items/[id]/summarize (a single model attempt, bounded by the
// 3-attempt cap). The updated item (summary stored, or one more failed
// attempt) is merged into the list and the open article; a failed retry
// shows the server's message instead of failing silently.
const retrySummary = useCallback(async (story) => {
  try {
    const res = await fetch(
      `/api/items/${encodeURIComponent(story.id)}/summarize`,
      { method: "POST" },
    );
    const data = await res.json().catch(() => ({}));
    if (data.item) {
      const updated = data.item;
      setItems((prev) =>
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
      // Opening a story marks it read (Req 2 AC3), persisted in SQLite.
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

  // Restore the list scroll position when returning from an article view.
  useEffect(() => {
    if (!openStory && listScrollYRef.current > 0) {
      window.scrollTo(0, listScrollYRef.current);
      listScrollYRef.current = 0;
    }
  }, [openStory]);

  const heading = starredOnly
    ? "Starred stories"
    : activeFeed && items?.length > 0
      ? items[0].source
      : activeFeed
        ? "This feed"
        : "All stories";

  return (
    <div className="layout">
      <FeedList
        activeFeed={activeFeed}
        onSelect={(id) => { setActiveFeed(id); setOpenStory(null); }}
        onFeedsChanged={() => fetchItems(activeFeed, starredOnly)}
      />
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
          <>
            <h2 style={{ marginTop: 0 }}>{heading}</h2>
            <p style={{ margin: "0 0 0.75rem" }}>
              <button
                type="button"
                onClick={() => setStarredOnly(false)}
                style={!starredOnly ? { borderColor: "var(--accent)" } : undefined}
              >
                All stories
              </button>{" "}
              <button
                type="button"
                onClick={() => setStarredOnly(true)}
                style={starredOnly ? { borderColor: "var(--accent)" } : undefined}
              >
                ★ Starred only
              </button>{" "}
              <button type="button" onClick={refreshFeeds} disabled={refreshing}>
                {refreshing ? "Refreshing…" : "↻ Refresh feeds"}
              </button>
            </p>
            {refreshInfo && (
              <p className="muted" style={{ margin: "0 0 0.75rem" }}>{refreshInfo}</p>
            )}
            {error && (
              <p role="alert" style={{ color: "#ff9d9d" }}>{error}</p>
            )}
            {items === null && <p className="muted">Loading stories…</p>}
            {items !== null && items.length === 0 && (
              <p className="muted">
                {starredOnly
                  ? "No starred stories yet — star one from a card or an article."
                  : "No stories yet — add a feed on the left (or pick a starter) and your newsroom will fill in."}
              </p>
            )}
            {items?.map((story) => (
              <StoryCard
                key={story.id}
                story={story}
                onOpen={openArticle}
                onToggleStar={toggleStar}
                onToggleRead={toggleRead}
                onRetrySummary={retrySummary}
              />
            ))}
          </>
        )}
      </main>
    </div>
  );
}
