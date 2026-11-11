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
              </button>
            </p>
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
              />
            ))}
          </>
        )}
      </main>
    </div>
  );
}
