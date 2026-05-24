// migrations/run.js — Run all schema files in order
require('dotenv').config();
const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');

const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT) || 5432,
  database: process.env.DB_NAME || 'vvce_events',
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD,
});

const schemas = ['schema.sql', 'schema_v2.sql', 'schema_v3.sql'];

(async () => {
  const client = await pool.connect();
  try {
    for (const file of schemas) {
      const filePath = path.join(__dirname, file);
      if (!fs.existsSync(filePath)) { console.log(`⏭  Skipping ${file} (not found)`); continue; }
      console.log(`📄 Running ${file}...`);
      const sql = fs.readFileSync(filePath, 'utf8');
      await client.query(sql);
      console.log(`✅ ${file} applied`);
    }
    console.log('\n🎉 All migrations complete. System is ready (empty).');
  } catch (err) {
    console.error('❌ Migration failed:', err.message);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
})();
