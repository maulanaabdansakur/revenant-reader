// src/lib/time.js — relative time formatting for story cards.
// Phase 2, task 17. Pure function, no I/O: ISO date -> "5m ago",
// "3h ago", "2d ago", or a short date for older / undated items.

export function formatRelativeTime(iso) {
  if (!iso) return "Unknown time";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "Unknown time";
  const diffMs = Date.now() - date.getTime();
  if (diffMs < 0) {
    // Future-dated item (feed clock skew): show the date, not "in 2h".
    return date.toLocaleDateString(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  }
  const mins = Math.floor(diffMs / 60_000);
  if (mins < 1) return "Just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return date.toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}
