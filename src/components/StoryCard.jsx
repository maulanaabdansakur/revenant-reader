// StoryCard — one story in the reader list: title, source, time, summary,
// "why it matters", read/unread dot, star toggle, duplicate-source chips.
// Phase 2 wires read/star state to /api/items. Scaffold: static sample data.

export default function StoryCard({ story, onOpen }) {
  return (
    <article className="card rise-in">
      <h3>
        {story.read ? null : <span className="unread-dot" title="Unread" />}
        <a
          href="#"
          onClick={(e) => {
            e.preventDefault();
            onOpen(story);
          }}
        >
          {story.title}
        </a>
      </h3>
      <div className="meta">
        {story.source} · {story.publishedAt}
        {story.duplicateSources?.length > 1
          ? ` · also in: ${story.duplicateSources.slice(1).join(", ")}`
          : ""}
      </div>
      <p style={{ margin: "0.25rem 0" }}>{story.summary}</p>
      <p className="why">Why it matters: {story.whyItMatters}</p>
      <p style={{ margin: "0.5rem 0 0" }}>
        <button type="button" onClick={() => onOpen(story)}>Read</button>{" "}
        <button type="button" onClick={() => alert("Starring lands in Phase 2 (task 19).")}>
          {story.starred ? "★ Starred" : "☆ Star"}
        </button>
      </p>
    </article>
  );
}
