const pg = require('pg');

const config = {
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  host: process.env.DB_HOST,
  port: process.env.DB_PORT,
  database: process.env.DB_NAME,
  ssl: {
    rejectUnauthorized: true,
    ca: process.env.DB_CA_CERT,
  },
};

const client = new pg.Client(config);

const startDb = async () => {
  try {
    await client.connect();
    console.log('Connected to Postgres');

    await client.query(`CREATE EXTENSION IF NOT EXISTS pgcrypto;`);

    const createUsersTableQuery = `
      CREATE TABLE IF NOT EXISTS users (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        name TEXT NOT NULL,
        email TEXT UNIQUE NOT NULL,
        password_hash TEXT NOT NULL,
        role TEXT DEFAULT 'user',
        status TEXT DEFAULT 'unverified',
        last_login TIMESTAMP,
        created_at TIMESTAMP DEFAULT NOW()
      );
    `;
    await client.query(createUsersTableQuery);
    console.log('"users" table created or already exists');
  } catch (err) {
    console.error('Database setup error:', err);
    process.exit(1);
  }
};

module.exports = { startDb, client };
