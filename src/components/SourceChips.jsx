"use client";

// SourceChips — multi-source chips for a collapsed story (Phase 2,
// task 24, Req 4 AC2). `sources` is the `sources[]` array the API
// returns (own feed first, then every additional feed that carried the
// story — see listItemSources in src/lib/feeds-store.js). The card
// meta line already shows the primary source, so the chips list only
// the additional ones; when there is just one source nothing renders.

export default function SourceChips({ sources, label = "Also in" }) {
  const extra = (sources || []).slice(1);
  if (extra.length === 0) return null;
  return (
    <p className="chips" style={{ margin: "0.35rem 0 0" }}>
      <span className="muted" style={{ fontSize: "0.85rem" }}>
        {label}:{" "}
      </span>
      {extra.map((source) => (
        <span key={source.feedId} className="chip" title={source.title}>
          {source.siteUrl ? (
            <a href={source.siteUrl} target="_blank" rel="noreferrer">
              {source.title}
            </a>
          ) : (
            source.title
          )}
        </span>
      ))}
    </p>
  );
}
