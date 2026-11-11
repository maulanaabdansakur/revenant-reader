// Starter feeds (task 28, Req 6 AC4) — the three feeds the empty state
// offers as one-click adds. Shared by FeedList (sidebar) and EmptyState
// (main area) so the two lists can never drift apart. Adding one goes
// through the normal POST /api/feeds path, so feed validation (task 13)
// and duplicate rejection (409, task 14) still apply.

export const STARTER_FEEDS = [
  {
    title: "Hacker News",
    url: "https://news.ycombinator.com/rss",
    blurb: "Tech, startups and the stories hackers argue about.",
  },
  {
    title: "BBC News",
    url: "https://feeds.bbci.co.uk/news/rss.xml",
    blurb: "World headlines, updated around the clock.",
  },
  {
    title: "The Verge",
    url: "https://www.theverge.com/rss/index.xml",
    blurb: "Tech, culture and the future, with sharp analysis.",
  },
];
