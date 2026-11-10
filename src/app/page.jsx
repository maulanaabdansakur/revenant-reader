// Home — reader: feed sidebar + story list + article view.
// Scaffold: sample stories so the layout is demonstrable. Phase 2 replaces
// the sample data with /api/items and wires read/star state.

"use client";

import { useState } from "react";
import FeedList from "@/components/FeedList";
import StoryCard from "@/components/StoryCard";
import ArticleView from "@/components/ArticleView";

const SAMPLE_STORIES = [
  {
    id: "s1",
    feedId: "hn",
    source: "Hacker News",
    title: "RSS is not dead — it was just resting",
    url: "https://example.com/rss-not-dead",
    publishedAt: "2h ago",
    read: false,
    starred: false,
    summary:
      "A new wave of readers is bringing RSS back as a quiet alternative to algorithmic feeds. Developers cite open standards and user control as the main draw, and several small tools now add AI summaries on top.",
    whyItMatters: "It proves open protocols can come back when algorithms get tiring.",
    duplicateSources: ["Hacker News", "The Verge"],
  },
  {
    id: "s2",
    feedId: "bbc",
    source: "BBC News",
    title: "City library reopens its newspaper reading room",
    url: "https://example.com/library-reading-room",
    publishedAt: "5h ago",
    read: false,
    starred: true,
    summary:
      "After a two-year renovation, the city library has reopened its newspaper reading room with 40 titles on display. Visitors can browse print editions and a new digital archive going back to 1960.",
    whyItMatters: "Local archives like this are where tomorrow's research starts.",
    duplicateSources: ["BBC News"],
  },
  {
    id: "s3",
    feedId: "verge",
    source: "The Verge",
    title: "The humble feed reader gets an AI newsroom upgrade",
    url: "https://example.com/feed-reader-ai",
    publishedAt: "8h ago",
    read: true,
    starred: false,
    summary:
      "Feed readers are adding automatic summaries and cross-feed deduplication, turning a raw firehose of posts into a ranked daily digest. Early users say they now spend less time skimming and more time reading.",
    whyItMatters: "Summarization is the feature that makes RSS usable again for busy readers.",
    duplicateSources: ["The Verge"],
  },
];

export default function Home() {
  const [activeFeed, setActiveFeed] = useState(null);
  const [openStory, setOpenStory] = useState(null);

  const visible = activeFeed
    ? SAMPLE_STORIES.filter((s) => s.feedId === activeFeed)
    : SAMPLE_STORIES;

  return (
    <div className="layout">
      <FeedList activeFeed={activeFeed} onSelect={(id) => { setActiveFeed(id); setOpenStory(null); }} />
      <main className="main">
        {openStory ? (
          <ArticleView story={openStory} onBack={() => setOpenStory(null)} />
        ) : (
          <>
            <h2 style={{ marginTop: 0 }}>
              {activeFeed ? "Feed" : "All stories"} · today
            </h2>
            <p className="muted">
              Scaffold preview — real feeds, summaries, and dedupe arrive in
              Phase 2 (11–20 Nov).
            </p>
            {visible.map((story) => (
              <StoryCard key={story.id} story={story} onOpen={setOpenStory} />
            ))}
            {visible.length === 0 && (
              <p className="muted">No stories in this feed yet.</p>
            )}
          </>
        )}
      </main>
    </div>
  );
}
