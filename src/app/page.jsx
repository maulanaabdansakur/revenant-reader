// Home — reader: feed sidebar + story list + article view.
// Phase 2, task 17: real stories from /api/items (SQLite, newest first),
// replacing the scaffold sample data. Selecting a feed filters the list;
// adding/removing/importing a feed refreshes it via onFeedsChanged.
// Read/star toggling is task 19; the article view is task 18.

"use client";

import { useCallback, useEffect, useState } from "react";
import FeedList from "@/components/FeedList";
import StoryCard from "@/components/StoryCard";
import ArticleView from "@/components/ArticleView";

export default function Home() {
  const [activeFeed, setActiveFeed] = useState(null);
  const [openStory, setOpenStory] = useState(null);
  const [items, setItems] = useState(null); // null = loading
  const [error, setError] = useState("");

  const fetchItems = useCallback(async (feedId) => {
    setError("");
    try {
      const url = feedId
        ? `/api/items?feed=${encodeURIComponent(feedId)}`
        : "/api/items";
      const res = await fetch(url);
      const data = await res.json().catch(() => ({}));
      setItems(Array.isArray(data.items) ? data.items : []);
    } catch {
      setError("Could not load stories — try again.");
      setItems([]);
    }
  }, []);

  useEffect(() => {
    fetchItems(activeFeed);
  }, [activeFeed, fetchItems]);

  const heading =
    activeFeed && items?.length > 0
      ? items[0].source
      : activeFeed
        ? "This feed"
        : "All stories";

  return (
    <div className="layout">
      <FeedList
        activeFeed={activeFeed}
        onSelect={(id) => { setActiveFeed(id); setOpenStory(null); }}
        onFeedsChanged={() => fetchItems(activeFeed)}
      />
      <main className="main">
        {openStory ? (
          <ArticleView story={openStory} onBack={() => setOpenStory(null)} />
        ) : (
          <>
            <h2 style={{ marginTop: 0 }}>{heading}</h2>
            {error && (
              <p role="alert" style={{ color: "#ff9d9d" }}>{error}</p>
            )}
            {items === null && <p className="muted">Loading stories…</p>}
            {items !== null && items.length === 0 && (
              <p className="muted">
                No stories yet — add a feed on the left (or pick a starter)
                and your newsroom will fill in.
              </p>
            )}
            {items?.map((story) => (
              <StoryCard key={story.id} story={story} onOpen={setOpenStory} />
            ))}
          </>
        )}
      </main>
    </div>
  );
}
