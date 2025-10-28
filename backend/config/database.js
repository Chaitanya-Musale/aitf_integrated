const { Pool } = require('pg');
const path = require('path');

// Load .env from the correct path
require('dotenv').config({ 
  path: path.resolve(__dirname, '../.env') 
});

// Cloud SQL connection configuration
const isProduction = process.env.NODE_ENV === 'production';

const pool = new Pool(
  isProduction
    ? {
        // Cloud SQL Proxy connection (Unix socket)
        host: `/cloudsql/aitf-474614:asia-south1:aitf-team-c`,
        database: process.env.DB_NAME,
        user: process.env.DB_USER,
        password: String(process.env.DB_PASSWORD),
      }
    : {
        // Local development connection
        host: process.env.DB_HOST,
        port: parseInt(process.env.DB_PORT) || 5432,
        database: process.env.DB_NAME,
        user: process.env.DB_USER,
        password: String(process.env.DB_PASSWORD),
      }
);

// Test database connection
pool.on('connect', () => {
  console.log('Connected to PostgreSQL database');
});

pool.on('error', (err) => {
  console.error('Database connection error:', err);
});

module.exports = pool;