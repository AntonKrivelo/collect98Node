const express = require('express');
const { client } = require('../database/db');
require('dotenv').config();
const router = express.Router();

router.get('/categories', async (req, res) => {
  try {
    const query = `
      SELECT id, category
      FROM categories      
      `;
    const result = await client.query(query);
    res.status(200).json({ category: result.rows });
  } catch (err) {
    console.error('Error fetching category:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.post('/categories', async (req, res) => {
  try {
    const { category } = req.body;
    if (!category) {
      return res.status(400).json({ ok: false, message: 'All fields is required.' });
    }

    const fixNameCategory = category.trim().toLowerCase();

    const { rowCount } = await client.query('SELECT 1 FROM categories WHERE LOWER(category) = $1', [
      fixNameCategory,
    ]);

    if (rowCount > 0) {
      return res
        .status(409)
        .json({ ok: false, message: 'A category with that name already exists.' });
    }
    const insertQuery = `
      INSERT INTO categories (category)
      VALUES ($1)
      RETURNING id, category;
    `;

    const values = [category];
    const result = await client.query(insertQuery, values);
    res.status(201).json({
      ok: true,
      message: 'The category was successfully created',
      category: result.rows[0],
    });
  } catch {
    console.error('Error created category:', err);
    res.status(500).json({ ok: false, message: 'Error server', error: err.message });
  }
});

router.post('/inventories/:inventoryId', async (req, res) => {
  const { inventoryId } = req.params;
  const { userId, values } = req.body;

  if (!inventoryId || !userId || !values) {
    return res.status(400).json({ error: 'Missing required parameters' });
  }

  try {
    const invRes = await client.query(`SELECT user_id FROM inventories WHERE id = $1`, [
      inventoryId,
    ]);
    if (invRes.rows.length === 0) {
      return res.status(404).json({ error: 'Inventory not found' });
    }

    const inventoryOwner = invRes.rows[0].user_id;
    if (inventoryOwner !== userId) {
      return res.status(403).json({ error: 'Access denied' });
    }

    const fieldsRes = await client.query(
      `SELECT field_name FROM inventory_fields WHERE inventory_id = $1`,
      [inventoryId],
    );
    const validFields = fieldsRes.rows.map((f) => f.field_name);

    const invalidFields = Object.keys(values).filter((field) => !validFields.includes(field));
    if (invalidFields.length > 0) {
      return res.status(400).json({ error: `Invalid fields: ${invalidFields.join(', ')}` });
    }

    const insertItem = await client.query(
      `INSERT INTO inventory_items (inventory_id, values)
       VALUES ($1, $2::jsonb)
       RETURNING id, inventory_id, values, created_at`,
      [inventoryId, JSON.stringify(values)],
    );

    res.status(201).json({ item: insertItem.rows[0] });
  } catch (err) {
    console.error('Error is added element.:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
