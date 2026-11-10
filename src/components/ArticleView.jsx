// ArticleView — full story view: title, source, time, summary,
// "why it matters", link to the original. Phase 2 wires it to real items.

export default function ArticleView({ story, onBack }) {
  if (!story) return null;
  return (
    <article className="card rise-in">
      <p><button type="button" onClick={onBack}>← Back to list</button></p>
      <h2 style={{ marginTop: 0 }}>{story.title}</h2>
      <div className="meta">
        {story.source} · {story.publishedAt}
      </div>
      <p>{story.summary}</p>
      <p className="why">Why it matters: {story.whyItMatters}</p>
      <p>
        <a href={story.url} target="_blank" rel="noreferrer">
          Read the original →
        </a>
      </p>
    </article>
  );
}
