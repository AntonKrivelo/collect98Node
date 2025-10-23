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
        status TEXT DEFAULT 'active',
        last_login TIMESTAMP,
        created_at TIMESTAMP DEFAULT NOW()
      );
    `;
    await client.query(createUsersTableQuery);
    console.log('Table "users" created or already exists');

    const createCategoryTableQuery = `
      CREATE TABLE IF NOT EXISTS category (
        id SERIAL PRIMARY KEY UNIQUE,
        name TEXT UNIQUE NOT NULL
      );
    `;
    await client.query(createCategoryTableQuery);
    console.log('Table "category" created or already exists');

    const createInventoryTableQuery = `
      CREATE TABLE IF NOT EXISTS inventory (
        id SERIAL PRIMARY KEY,
        name TEXT NOT NULL,
        category_id INT REFERENCES category(id) ON DELETE SET NULL,
        created_by UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
        created_at TIMESTAMP DEFAULT NOW()
      );
    `;
    await client.query(createInventoryTableQuery);
    console.log('Table "inventory" created or already exists');

    const createInventoryField = `
      CREATE TABLE IF NOT EXISTS inventory_field (
        id SERIAL PRIMARY KEY,
        inventory_id INT REFERENCES inventory(id) ON DELETE CASCADE,
        field_name TEXT NOT NULL,
        field_type TEXT NOT NULL,
        is_visible BOOLEAN DEFAULT TRUE
      );
    `;
    await client.query(createInventoryField);
    console.log('Table "inventory_field" created or already exists');

    const createInventoryItem = `
      CREATE TABLE IF NOT EXISTS inventory_item (
        id SERIAL PRIMARY KEY,
        inventory_id INT REFERENCES inventory(id) ON DELETE CASCADE,
        category_id INT REFERENCES category(id) ON DELETE SET NULL,
        values JSONB NOT NULL,
        created_at TIMESTAMP DEFAULT NOW()
      );
    `;
    await client.query(createInventoryItem);
    console.log('Table "inventory_item" created or already exists');

    console.log('All tables created successfully!');
  } catch (err) {
    console.error('Database setup error:', err);
    process.exit(1);
  }
};

module.exports = { startDb, client };
