// ArticleView — full story view: title, source, time, summary,
// "why it matters", link to the original. Phase 2, task 17: relative time
// + excerpt fallback until summaries land (task 20). Full wiring is task 18.

import { formatRelativeTime } from "@/lib/time";

export default function ArticleView({ story, onBack }) {
  if (!story) return null;
  const body = story.summary || story.content || "";
  return (
    <article className="card rise-in">
      <p><button type="button" onClick={onBack}>← Back to list</button></p>
      <h2 style={{ marginTop: 0 }}>{story.title}</h2>
      <div className="meta">
        {story.source} · {formatRelativeTime(story.publishedAt)}
      </div>
      {body && <p>{body}</p>}
      {story.summary && story.whyItMatters && (
        <p className="why">Why it matters: {story.whyItMatters}</p>
      )}
      <p>
        <a href={story.url} target="_blank" rel="noreferrer">
          Read the original →
        </a>
      </p>
    </article>
  );
}
