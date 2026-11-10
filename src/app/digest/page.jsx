// Digest view — daily top-10 ranked stories (last 24h).
// Scaffold: placeholder page. Phase 3 (task 26) wires it to /api/digest.

import Link from "next/link";

export default function DigestPage() {
  return (
    <div className="layout">
      <aside className="sidebar">
        <h1 className="brand">
          <span className="glyph">☠</span> Revenant Reader
        </h1>
        <p className="tagline">RSS, risen from the dead — an AI newsroom.</p>
        <p><Link href="/">← Back to reader</Link></p>
      </aside>
      <main className="main">
        <h2 style={{ marginTop: 0 }}>Daily digest — top 10</h2>
        <p className="muted">
          The ranked top-10 of the last 24 hours lands in Phase 3 (task 26).
          Ranking: recency first, then source diversity (max 3 stories per
          feed in the top 10).
        </p>
      </main>
    </div>
  );
}
