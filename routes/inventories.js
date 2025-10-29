const express = require('express');
const { client } = require('../database/db');
const router = express.Router();

router.get('/inventories', async (req, res) => {
  try {
    const inventoriesQuery = `
      SELECT 
        i.id, 
        i.name, 
        i.created_at,
        i.user_id,
        u.name AS user_name,
        i.category_id,
        c.category AS category_name
      FROM inventories i
      LEFT JOIN users u ON i.user_id = u.id
      LEFT JOIN categories c ON i.category_id = c.id
      ORDER BY i.created_at DESC;
    `;
    const inventoriesResult = await client.query(inventoriesQuery);

    const inventories = inventoriesResult.rows;

    if (inventories.length === 0) {
      return res.status(200).json({ ok: true, total: 0, inventories: [] });
    }

    const inventoryIds = inventories.map((inv) => inv.id);
    const fieldsQuery = `
      SELECT 
        inventory_id,
        id AS field_id,
        field_name,
        field_type,
        is_visible
      FROM inventory_fields
      WHERE inventory_id = ANY($1)
      ORDER BY id;
    `;
    const fieldsResult = await client.query(fieldsQuery, [inventoryIds]);

    const fieldsByInventory = {};
    for (const field of fieldsResult.rows) {
      if (!fieldsByInventory[field.inventory_id]) fieldsByInventory[field.inventory_id] = [];
      fieldsByInventory[field.inventory_id].push(field);
    }

    const inventoriesWithFields = inventories.map((inv) => ({
      ...inv,
      fields: fieldsByInventory[inv.id] || [],
    }));

    res.status(200).json({
      ok: true,
      total: inventoriesWithFields.length,
      inventories: inventoriesWithFields,
    });
  } catch (err) {
    console.error('Error fetching inventories:', err.message);
    res.status(500).json({
      ok: false,
      message: 'Server error fetching inventories.',
      error: err.message,
    });
  }
});

router.get('/inventories/:userId', async (req, res) => {
  const { userId } = req.params;

  try {
    const inventoriesQuery = `
      SELECT 
        i.id, 
        i.name, 
        i.created_at,
        i.user_id,
        u.name AS user_name,
        i.category_id,
        c.category AS category_name
      FROM inventories i
      LEFT JOIN users u ON i.user_id = u.id
      LEFT JOIN categories c ON i.category_id = c.id
      WHERE i.user_id = $1
      ORDER BY i.created_at DESC;
    `;
    const inventoriesResult = await client.query(inventoriesQuery, [userId]);
    const inventories = inventoriesResult.rows;

    if (inventories.length === 0) {
      return res.status(404).json({ ok: false, message: 'No inventories found for this user.' });
    }

    const inventoryIds = inventories.map((inv) => inv.id);
    const fieldsQuery = `
      SELECT 
        inventory_id,
        id AS field_id,
        field_name,
        field_type,
        is_visible
      FROM inventory_fields
      WHERE inventory_id = ANY($1)
      ORDER BY id;
    `;
    const fieldsResult = await client.query(fieldsQuery, [inventoryIds]);

    const fieldsByInventory = {};
    for (const field of fieldsResult.rows) {
      if (!fieldsByInventory[field.inventory_id]) fieldsByInventory[field.inventory_id] = [];
      fieldsByInventory[field.inventory_id].push(field);
    }

    const inventoriesWithFields = inventories.map((inv) => ({
      ...inv,
      fields: fieldsByInventory[inv.id] || [],
    }));

    res.status(200).json({
      ok: true,
      total: inventoriesWithFields.length,
      inventories: inventoriesWithFields,
    });
  } catch (err) {
    console.error('Error fetching user inventories:', err.message);
    res.status(500).json({
      ok: false,
      message: 'Server error fetching user inventories.',
      error: err.message,
    });
  }
});

router.post('/categories', async (req, res) => {
  const { category } = req.body;

  if (!category) {
    return res.status(400).json({ ok: false, message: 'Category name is required.' });
  }

  try {
    const exists = await client.query('SELECT 1 FROM categories WHERE category = $1', [category]);
    if (exists.rows.length > 0) {
      return res.status(409).json({ ok: false, message: 'Category already exists.' });
    }

    const insert = await client.query(
      'INSERT INTO categories (category) VALUES ($1) RETURNING id, category',
      [category],
    );

    res.status(201).json({ ok: true, category: insert.rows[0] });
  } catch (err) {
    console.error('Error creating category:', err.message);
    res
      .status(500)
      .json({ ok: false, message: 'Server error creating category.', error: err.message });
  }
});

router.post('/inventories', async (req, res) => {
  const { userId, categoryId, name, fields } = req.body;

  if (!userId || !name) return res.status(400).json({ error: 'userId and name are required' });
  if (!categoryId) return res.status(400).json({ error: 'categoryId is required' });
  if (!Array.isArray(fields) || fields.length < 1)
    return res.status(400).json({ error: 'At least one field is required' });

  try {
    const categoryCheck = await client.query(`SELECT category FROM categories WHERE id = $1`, [
      categoryId,
    ]);
    if (categoryCheck.rowCount === 0) return res.status(404).json({ error: 'Category not found.' });

    const existingInventory = await client.query(
      `SELECT 1 FROM inventories WHERE user_id = $1 AND name = $2`,
      [userId, name],
    );
    if (existingInventory.rows.length > 0)
      return res.status(400).json({ error: 'This user already has an inventory with that name.' });

    const insertInventory = await client.query(
      `INSERT INTO inventories (name, user_id, category_id)
       VALUES ($1, $2, $3)
       RETURNING id, name, user_id, category_id, created_at`,
      [name, userId, categoryId],
    );

    const inventoryId = insertInventory.rows[0].id;

    const createdFields = await Promise.all(
      fields.map(async (field) => {
        const { field_name, field_type = 'string', is_visible = true } = field;
        const insertField = await client.query(
          `INSERT INTO inventory_fields (inventory_id, field_name, field_type, is_visible)
           VALUES ($1, $2, $3, $4)
           RETURNING id, field_name, field_type, is_visible`,
          [inventoryId, field_name, field_type, is_visible],
        );
        return insertField.rows[0];
      }),
    );

    return res.status(201).json({
      ok: true,
      message: 'Inventory created successfully.',
      inventory: {
        ...insertInventory.rows[0],
        category_name: categoryCheck.rows[0].category,
      },
      fields: createdFields,
    });
  } catch (error) {
    console.error('Inventory creation error:', error.message);
    return res.status(500).json({ error: 'Inventory creation error', details: error.message });
  }
});

module.exports = router;
