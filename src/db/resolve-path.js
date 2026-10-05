'use strict'

const fs = require('fs')
const path = require('path')

const PROJECT_ROOT = '/Users/dinu/developer/workspace/ironman-lp2027'
const DEFAULT_DB_PATH = '/Users/dinu/developer/workspace/ironman-lp2027/data/ironman.db'

/**
 * Resolve the DB path in priority order:
 *   1. IMLP_DB_PATH environment variable
 *   2. "dbPath" key in config.json at project root
 *   3. Absolute fallback: data/ironman.db in this project
 *
 * Never builds the path from __dirname.
 */
function resolveDbPath() {
  if (process.env.IMLP_DB_PATH) return process.env.IMLP_DB_PATH

  const configFile = path.join(PROJECT_ROOT, 'config.json')
  if (fs.existsSync(configFile)) {
    try {
      const cfg = JSON.parse(fs.readFileSync(configFile, 'utf8'))
      if (cfg.dbPath) return cfg.dbPath
    } catch (_) {}
  }

  return DEFAULT_DB_PATH
}

/**
 * Resolve and verify the DB path.
 * Throws if the resolved path does not point to an existing file.
 */
function resolveAndVerifyDbPath() {
  const p = resolveDbPath()
  if (!fs.existsSync(p)) {
    throw new Error(`Database not found: ${p}`)
  }
  return p
}

module.exports = { resolveDbPath, resolveAndVerifyDbPath }
