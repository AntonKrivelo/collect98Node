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

router.get('/inventories/:inventoryId/items', async (req, res) => {
  const { inventoryId } = req.params;

  try {
    const invRes = await client.query(`SELECT * FROM inventories WHERE id = $1`, [inventoryId]);
    if (invRes.rows.length === 0) {
      return res.status(404).json({ error: 'Inventory not found' });
    }

    const itemsRes = await client.query(
      `SELECT id, inventory_id, values, created_at
       FROM inventory_items
       WHERE inventory_id = $1
       ORDER BY created_at DESC`,
      [inventoryId],
    );

    res.status(200).json({
      inventory_id: inventoryId,
      items: itemsRes.rows,
    });
  } catch (err) {
    console.error('Error loading inventory items:', err);
    res.status(500).json({ error: 'server error' });
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
        fields: createdFields,
      },
    });
  } catch (error) {
    console.error('Inventory creation error:', error.message);
    return res.status(500).json({ error: 'Inventory creation error', details: error.message });
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
      `SELECT field_name, field_type FROM inventory_fields WHERE inventory_id = $1`,
      [inventoryId],
    );
    const fieldTypes = {};
    fieldsRes.rows.forEach((f) => {
      fieldTypes[f.field_name] = f.field_type;
    });

    const invalidFields = Object.keys(values).filter((field) => !(field in fieldTypes));
    if (invalidFields.length > 0) {
      return res.status(400).json({ error: `Invalid fields: ${invalidFields.join(', ')}` });
    }

    const invalidTypeFields = Object.entries(values).filter(([key, value]) => {
      const expectedType = fieldTypes[key];
      if (expectedType === 'string') return typeof value !== 'string';
      if (expectedType === 'number') return typeof value !== 'number';
      return false;
    });

    if (invalidTypeFields.length > 0) {
      const fields = invalidTypeFields.map(([key]) => key).join(', ');
      return res.status(400).json({ error: `Invalid value types for fields: ${fields}` });
    }

    const insertItem = await client.query(
      `INSERT INTO inventory_items (inventory_id, values)
       VALUES ($1, $2::jsonb)
       RETURNING id, inventory_id, values, created_at`,
      [inventoryId, JSON.stringify(values)],
    );

    res.status(201).json({ item: insertItem.rows[0] });
  } catch (err) {
    console.error('Error adding element:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.delete('/inventories/:inventoryId', async (req, res) => {
  const { inventoryId } = req.params;
  const { userId } = req.body;

  if (!userId) return res.status(400).json({ message: 'userId required' });

  try {
    const {
      rows: [user],
    } = await client.query(`SELECT role FROM users WHERE id = $1`, [userId]);
    if (!user) return res.status(403).json({ message: 'User not found' });

    const {
      rows: [inventory],
    } = await client.query(`SELECT user_id FROM inventories WHERE id = $1`, [inventoryId]);
    if (!inventory) return res.status(404).json({ message: 'Inventory not found' });

    if (inventory.user_id !== userId && user.role !== 'admin') {
      return res.status(403).json({ message: 'Access denied' });
    }

    await client.query(`DELETE FROM inventories WHERE id = $1`, [inventoryId]);

    return res.status(200).json({ message: 'Inventory and all related data removed' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
});

router.delete('/inventories/:inventoryId/items', async (req, res) => {
  const { inventoryId } = req.params;
  const { userId, itemIds } = req.body;

  if (!userId || !Array.isArray(itemIds) || itemIds.length === 0) {
    return res.status(400).json({ message: 'userId and itemIds required' });
  }

  try {
    const {
      rows: [user],
    } = await client.query(`SELECT role FROM users WHERE id = $1`, [userId]);
    if (!user) return res.status(403).json({ message: 'User not found' });

    const {
      rows: [inventory],
    } = await client.query(`SELECT user_id FROM inventories WHERE id = $1`, [inventoryId]);
    if (!inventory) return res.status(404).json({ message: 'Inventory not found' });

    if (inventory.user_id !== userId && user.role !== 'admin') {
      return res.status(403).json({ message: 'Access denied' });
    }

    const deleteResult = await client.query(
      `DELETE FROM inventory_items WHERE id = ANY($1::int[]) AND inventory_id = $2 RETURNING id`,
      [itemIds, inventoryId],
    );

    return res.status(200).json({
      message: 'Items removed successfully',
      deletedCount: deleteResult.rowCount,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;
