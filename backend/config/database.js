/**
 * Database Pool Configuration
 * ---------------------------
 * - Centralizes Postgres connection creation.
 * - Auto-detects Neon ( *.neon.tech ) and enforces SSL; local dev can disable via DISABLE_DB_SSL=true.
 * - Performs a lightweight connectivity probe at startup (SELECT NOW()) for early visibility.
 * - Emits pool-level error events (e.g., idle client errors) to stderr.
 *
 * If connection churn / backpressure becomes an issue, consider:
 *   - Setting max pool size & idle timeout explicitly
 *   - Adding pg-native for performance or prepared statements caching
 *   - Introducing circuit breaker / retry strategy in higher-level data access utilities
 */
const { Pool } = require('pg');
require('dotenv').config();
const { logger } = require('../utils/logger');

// Neon requires SSL; allow override via DISABLE_DB_SSL for local dev with a local Postgres.
const useSSL = (() => {
  if (process.env.DISABLE_DB_SSL === 'true') return false;
  // Force SSL if connection string looks like Neon or if in production
  if (/\.neon\.tech/i.test(process.env.DATABASE_URL || '')) return { rejectUnauthorized: false };
  if (process.env.NODE_ENV === 'production') return { rejectUnauthorized: false };
  return false;
})();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: useSSL
});

pool.on('error', (err) => {
  logger.error('PG pool error', { error: err.message });
});

async function verifyConnection() {
  if (!process.env.DATABASE_URL) {
    console.warn('Warning: DATABASE_URL is not set. Database operations will fail.');
    return;
  }
  try {
    const res = await pool.query('SELECT NOW() as now');
    logger.info('Database connection verified', { at: res.rows[0].now });
  } catch (e) {
    logger.error('Database connectivity check failed', { error: e.message });
  }
}

verifyConnection();

module.exports = pool;