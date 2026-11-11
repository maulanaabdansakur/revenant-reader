// src/lib/db.js — SQLite database singleton (Phase 2, task 16).
//
// Uses the Node 24 built-in `node:sqlite` (DatabaseSync) — zero new
// dependencies, no native build. The database file lives at
// `data/revenant-reader.db` under the project root (overridable with
// REVENANT_DB_PATH) and is gitignored; the schema is created on first use
// (CREATE TABLE IF NOT EXISTS), so a fresh checkout just works.
//
// This is the LOCAL store. For deploy, the design doc's migration path is
// Postgres (see .kiro/specs/revenant-reader/design.md "Persistence") — the
// store interface in src/lib/feeds-store.js stays the same, only this
// module's implementation would swap to `pg`.

import { DatabaseSync } from "node:sqlite";
import fs from "node:fs";
import path from "node:path";

const DB_PATH =
  process.env.REVENANT_DB_PATH ||
  path.join(process.cwd(), "data", "revenant-reader.db");

let db = null;

export function getDb() {
  if (db) return db;
  fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
  db = new DatabaseSync(DB_PATH);
  // WAL: readers don't block the writer (dev server + build overlap);
  // foreign keys ON so deleting a feed cascades to its items.
  db.exec("PRAGMA journal_mode = WAL;");
  db.exec("PRAGMA foreign_keys = ON;");
  db.exec(`
    CREATE TABLE IF NOT EXISTS feeds (
      id            TEXT PRIMARY KEY,
      url           TEXT NOT NULL UNIQUE,
      title         TEXT NOT NULL,
      siteUrl       TEXT NOT NULL,
      addedAt       TEXT NOT NULL,
      lastFetchedAt TEXT,
      lastError     TEXT
    );
    CREATE TABLE IF NOT EXISTS items (
      id             TEXT PRIMARY KEY,
      feedId         TEXT NOT NULL REFERENCES feeds(id) ON DELETE CASCADE,
      guid           TEXT NOT NULL,
      canonicalUrl   TEXT NOT NULL,
      title          TEXT NOT NULL,
      content        TEXT NOT NULL DEFAULT '',
      publishedAt    TEXT,
      read           INTEGER NOT NULL DEFAULT 0,
      starred        INTEGER NOT NULL DEFAULT 0,
      summary        TEXT,
      whyItMatters   TEXT,
      summaryPending INTEGER NOT NULL DEFAULT 0,
      summaryAttempts INTEGER NOT NULL DEFAULT 0,
      duplicateOf    TEXT,
      UNIQUE (feedId, guid)
    );
    CREATE INDEX IF NOT EXISTS items_feedId_idx ON items(feedId);
    CREATE INDEX IF NOT EXISTS items_canonicalUrl_idx ON items(canonicalUrl);
    CREATE INDEX IF NOT EXISTS items_publishedAt_idx ON items(publishedAt);
  `);
  // Task 20: track how many summary attempts an item has had so the
  // on-feed-item hook can retry on refresh (max 3 attempts, then leave
  // it pending). Added as a migration so existing DBs pick it up:
  // ALTER fails when the column already exists — that is the expected
  // steady state, so the error is swallowed.
  try {
    db.exec(
      "ALTER TABLE items ADD COLUMN summaryAttempts INTEGER NOT NULL DEFAULT 0",
    );
  } catch {
    // Column already exists.
  }
  return db;
}

export function dbPath() {
  return DB_PATH;
}
