const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');
require('dotenv').config();
const { logger } = require('./utils/logger');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

const setupDatabase = async () => {
  try {
  logger.info('Database setup start');
    
    // Read and execute the complete schema
    const schemaSQL = fs.readFileSync(path.join(__dirname, 'schema-complete.sql'), 'utf8');
    await pool.query(schemaSQL);
    
  logger.info('Database setup completed');
    
    // Test the connection
    const result = await pool.query('SELECT NOW()');
  logger.debug('Database connection test successful', { now: result.rows[0].now });
    
    // Show table count
    const tables = await pool.query(`
      SELECT count(*) as table_count 
      FROM information_schema.tables 
      WHERE table_schema = 'public'
    `);
  logger.info('Database tables created', { count: tables.rows[0].table_count });
    
  } catch (error) {
    logger.error('Database setup error', { error: error.message });
  } finally {
    await pool.end();
  }
};

setupDatabase();