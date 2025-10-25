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
      CREATE TABLE IF NOT EXISTS categories (
        id SERIAL PRIMARY KEY,
        category TEXT UNIQUE NOT NULL
    );
    `;
    await client.query(createCategoryTableQuery);
    console.log('Table "category" created or already exists');

    const createInventoriesTableQuery = `
      CREATE TABLE IF NOT EXISTS inventories (
        id SERIAL PRIMARY KEY,
        name TEXT NOT NULL,
        user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        category_id INT REFERENCES categories(id) ON DELETE SET NULL,
        created_at TIMESTAMP DEFAULT NOW(), 
        CONSTRAINT unique_user_inventory UNIQUE (user_id, name)
);

    `;
    await client.query(createInventoriesTableQuery);
    console.log('Table "inventories" created or already exists');

    const createInventoryFields = `
      CREATE TABLE IF NOT EXISTS inventory_fields (
        id SERIAL PRIMARY KEY,
        inventory_id INT NOT NULL REFERENCES inventories(id) ON DELETE CASCADE,
        field_name TEXT NOT NULL,
        field_type TEXT NOT NULL, -- string | number | boolean | date
        is_visible BOOLEAN DEFAULT TRUE,
        CONSTRAINT unique_inventory_field UNIQUE (inventory_id, field_name)
);
    `;
    await client.query(createInventoryFields);
    console.log('Table "inventory_field" created or already exists');

    const createInventoryItems = `
     CREATE TABLE IF NOT EXISTS inventory_items (
        id SERIAL PRIMARY KEY,
        inventory_id INT NOT NULL REFERENCES inventories(id) ON DELETE CASCADE,
        values JSONB NOT NULL, -- ключи = field_name, значения = реальные данные
        created_at TIMESTAMP DEFAULT NOW()
    );
    `;
    await client.query(createInventoryItems);
    console.log('Table "inventory_item" created or already exists');

    console.log('All tables created successfully!');
  } catch (err) {
    console.error('Database setup error:', err);
    process.exit(1);
  }
};

module.exports = { startDb, client };
