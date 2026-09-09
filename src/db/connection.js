'use strict';

const Database = require('better-sqlite3');
const { applySchema } = require('./schema');

// Module-level cache keyed by db path so it's only opened once per process.
const _cache = new Map();

/**
 * Open (or return a cached) better-sqlite3 connection, apply schema, return it.
 * Tests can pass ':memory:' to get an isolated in-memory database.
 * @param {string} dbPath  Path to the SQLite file or ':memory:'
 * @returns {import('better-sqlite3').Database}
 */
function getDb(dbPath) {
  if (_cache.has(dbPath)) {
    return _cache.get(dbPath);
  }
  const db = new Database(dbPath);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  applySchema(db);
  _cache.set(dbPath, db);
  return db;
}

module.exports = { getDb };
