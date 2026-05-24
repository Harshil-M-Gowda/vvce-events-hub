// src/config/db.js
const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  // If DATABASE_URL not set, use individual vars
  ...(process.env.DATABASE_URL
    ? {}
    : {
        host: process.env.DB_HOST || 'localhost',
        port: parseInt(process.env.DB_PORT) || 5432,
        database: process.env.DB_NAME || 'vvce_events',
        user: process.env.DB_USER || 'postgres',
        password: process.env.DB_PASSWORD,
      }),
  max: 20,                  // connection pool size
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
});

pool.on('connect', () => {
  if (process.env.NODE_ENV !== 'production') {
    console.log('📦 New DB client connected');
  }
});

pool.on('error', (err) => {
  console.error('❌ Unexpected DB client error:', err);
  process.exit(-1);
});

// Helper: run a query with optional params
const query = (text, params) => pool.query(text, params);

// Helper: get a client for transactions
const getClient = () => pool.connect();

module.exports = { query, getClient, pool };
