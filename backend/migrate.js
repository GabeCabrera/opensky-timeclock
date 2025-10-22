#!/usr/bin/env node
/**
 * Migration Runner
 * -----------------
 * Lightweight SQL migration system (no external dependency):
 *   - Migration files: backend/migrations/NNNN_description.sql (NNNN zero-padded sequence preferred)
 *   - Execution order: lexical sort, so use numeric prefixes.
 *   - Idempotence: Each filename recorded in schema_migrations; only new files run.
 *   - Transaction: Each file runs inside its own transaction for atomicity.
 *
 * Design Trade-offs:
 *   - Simplicity: Avoids adding a full migration library while still preventing drift.
 *   - No Down Migrations: Current scope only tracks "up". For destructive changes, add explicit
 *     safety checks (e.g., column existence) or create a new migration to revert.
 *   - Parallelism: Not required; sequential execution reduces lock contention risk.
 *
 * Future Enhancements:
 *   - Add checksum verification to detect edited historical migrations.
 *   - Introduce "down" scripts if rollback becomes a frequent need.
 *   - CLI options (dry-run, specific target version) via argument parsing.
 */
const fs = require('fs');
const path = require('path');
const pool = require('./config/database');
const { logger } = require('./utils/logger');

async function ensureTable() {
  await pool.query(`CREATE TABLE IF NOT EXISTS schema_migrations (id SERIAL PRIMARY KEY, filename TEXT UNIQUE NOT NULL, applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)`);
}

async function getApplied() {
  const res = await pool.query('SELECT filename FROM schema_migrations');
  return new Set(res.rows.map(r => r.filename));
}

async function applyMigration(file) {
  const full = path.join(__dirname, 'migrations', file);
  const sql = fs.readFileSync(full, 'utf8');
  await pool.query('BEGIN');
  try {
    await pool.query(sql);
    await pool.query('INSERT INTO schema_migrations (filename) VALUES ($1)', [file]);
    await pool.query('COMMIT');
    logger.info('Migration applied', { file });
  } catch (e) {
    await pool.query('ROLLBACK');
    logger.error('Migration failed', { file, error: e.message });
    throw e;
  }
}

async function runMigrations({ closePool = false } = {}) {
  await ensureTable();
  const applied = await getApplied();
  const dir = path.join(__dirname, 'migrations');
  if (!fs.existsSync(dir)) {
    logger.debug('No migrations directory; skipping');
    if (closePool) await pool.end();
    return;
  }
  const files = fs.readdirSync(dir).filter(f => /^(\d+)_.*\.sql$/.test(f)).sort();
  for (const f of files) {
    if (!applied.has(f)) {
      await applyMigration(f);
    }
  }
  if (closePool) await pool.end();
}

module.exports = { runMigrations };

// If executed directly via CLI
if (require.main === module) {
  runMigrations({ closePool: true }).catch(e => {
    console.error('Migration run failed:', e);
    process.exit(1);
  });
}
