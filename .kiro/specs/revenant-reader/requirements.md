# Revenant Reader — Requirements

**Project:** Revenant Reader — RSS, reborn as an AI newsroom
**Category:** Kiroween 2026 — Resurrection (bring dead tech back to life)
**Status:** Spec v1.0 — scaffold phase, 2026-11-08
**Owner:** Maulana Abdan Sakur (solo)

## Introduction

RSS is canonically dead technology: declared dead a dozen times, abandoned by
mainstream platforms, yet still quietly powering the open web. Revenant Reader
brings it back from the grave. Users subscribe to any RSS/Atom feed; Kiro
agent hooks automatically summarize, deduplicate, and rank every new story;
and a clean modern reader UI — dark, spooky-but-polished, graveyard-green
accents — presents the result as a daily AI newsroom.

## Glossary

- **Feed:** an RSS or Atom source identified by URL.
- **Story / Item:** one entry from a feed (title, link, published date, content/summary).
- **Summary:** a 2–3 sentence AI summary of a story plus one "why it matters" line.
- **Digest:** the daily top-10 ranked stories across all subscribed feeds.
- **Dedupe:** collapsing the same story arriving from multiple feeds into one card.
- **Rank:** an ordering score for stories (recency + freshness + source diversity).

## Requirements

### Requirement 1 — Feed management

**User Story:** As a reader, I want to add and remove RSS/Atom feeds, so I can
build my own newsroom from the sources I trust.

#### Acceptance Criteria

1. WHEN the user submits a valid RSS or Atom feed URL, THE System SHALL fetch
   and parse the feed, and add it to the feed list with its title.
2. WHEN the user submits an invalid URL or a URL that is not a feed, THE
   System SHALL show a clear error and SHALL NOT add the feed.
3. WHEN the user removes a feed, THE System SHALL remove it from the list and
   SHALL NOT fetch it again.
4. WHEN the user imports an OPML file, THE System SHALL add every valid feed
   URL found in it and report how many were added vs. skipped.
5. WHEN the user adds a feed that is already subscribed, THE System SHALL
   report it as a duplicate and SHALL NOT create a second entry.

### Requirement 2 — Reader: list and article view

**User Story:** As a reader, I want a clean list of stories and a readable
article view, so I can catch up quickly without opening ten tabs.

#### Acceptance Criteria

1. WHEN the reader loads, THE System SHALL display stories newest-first with
   title, source feed, published time, and read/unread state.
2. WHEN the user opens a story, THE System SHALL show the article view with
   title, source, published time, summary, and a link to the original.
3. WHEN the user opens a story, THE System SHALL mark it as read.
4. WHEN the user toggles the read state, THE System SHALL persist that state
   across reloads.
5. WHEN the user stars a story, THE System SHALL persist the starred state
   and THE System SHALL offer a starred-only filter.
6. WHEN the user filters by feed, THE System SHALL show only stories from
   that feed.

### Requirement 3 — AI summaries

**User Story:** As a reader, I want every story summarized in 2–3 sentences
with a "why it matters" line, so I can triage a full day's news in minutes.

#### Acceptance Criteria

1. WHEN a new story arrives, THE System SHALL generate a summary of 2–3
   sentences plus one "why it matters" line.
2. WHEN a summary exists, THE System SHALL display it on the story card and
   in the article view.
3. WHEN a story is re-read or re-listed, THE System SHALL reuse the cached
   summary and SHALL NOT call the model again.
4. WHEN the summary model is unavailable, THE System SHALL fall back to the
   feed-provided excerpt and mark the story as "summary pending".
5. WHEN a summary is generated, THE System SHALL follow the rules in
   `.kiro/steering/summaries.md` (length, neutral tone, no clickbait).

### Requirement 4 — Deduplication

**User Story:** As a reader, I want the same story from multiple feeds to
appear once, so my list is not cluttered with repeats.

#### Acceptance Criteria

1. WHEN the same story (same canonical link, or same normalized title from a
   different feed) arrives, THE System SHALL collapse it into one card.
2. WHEN stories are collapsed, THE System SHALL show all sources that
   carried the story on the single card.
3. WHEN two stories share a title but link to different articles, THE System
   SHALL keep them as separate cards.
4. WHEN a duplicate is detected after a summary exists, THE System SHALL keep
   the existing summary and SHALL NOT generate a second one.

### Requirement 5 — Daily digest

**User Story:** As a reader, I want a daily top-10 digest, so I can read the
day's most important stories in one sitting.

#### Acceptance Criteria

1. WHEN the user opens the digest view, THE System SHALL show the top 10
   ranked stories from the last 24 hours.
2. WHEN stories are ranked, THE System SHALL rank by recency first, then by
   source diversity (no single feed dominates the top 10).
3. WHEN fewer than 10 stories exist in the last 24 hours, THE System SHALL
   show all available stories and state the count.
4. WHEN the user opens a story from the digest, THE System SHALL mark it
   read, same as from the reader list.

### Requirement 6 — Spooky-polished UI

**User Story:** As a reader, I want a dark, polished, faintly haunted reading
experience, so the app feels like RSS risen from the dead — not like a
graveyard of gray boxes.

#### Acceptance Criteria

1. WHEN the app loads, THE System SHALL render a dark theme with
   graveyard-green accents, defined as CSS variables in the theme file.
2. WHEN the user reads on a small screen, THE System SHALL keep the list and
   article view usable (responsive layout, no horizontal scrolling).
3. WHEN new summaries appear, THE System SHALL animate them in subtly
   (fade/slide, no flashing or shaking).
4. WHEN the user has no feeds yet, THE System SHALL show an inviting empty
   state with three suggested starter feeds.

### Requirement 7 — Live deployment

**User Story:** As the developer, I want the app deployed live with a public
URL, so judges can try it without installing anything.

#### Acceptance Criteria

1. WHEN the app is deployed, THE System SHALL be reachable at a public URL
   with the reader, feeds, and digest all functional.
2. WHEN the deployment is updated, THE System SHALL keep existing feed
   subscriptions and read/star state intact.

## Non-Goals (out of scope — do not build)

- User accounts / login / multi-user sync.
- Paywalls or subscriptions.
- Mobile apps (web only).
- Podcast support.
- Full-text extraction beyond what feeds provide.
