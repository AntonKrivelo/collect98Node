const express = require('express');
const { client } = require('../database/db');
const authenticateAdmin = require('../middleware/authenticateAdmin');
require('dotenv').config();
const router = express.Router();

router.get('/users', async (req, res) => {
  try {
    const query = `
      SELECT id, name, email, role, status, last_login, created_at, salesforce_integration
      FROM users
      ORDER BY created_at DESC;
    `;
    const result = await client.query(query);

    res.status(200).json({ users: result.rows });
  } catch (err) {
    console.error('Error fetching users:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.get('/users/:id', async (req, res) => {
  const { id } = req.params;

  try {
    const userQuery = `
      SELECT id, name, email, role, status, created_at, last_login, salesforce_integration
      FROM users
      WHERE id = $1;
    `;
    const userResult = await client.query(userQuery, [id]);

    if (userResult.rows.length === 0) {
      return res.status(404).json({
        ok: false,
        message: 'users is not defined',
      });
    }

    const user = userResult.rows[0];

    const inventoriesQuery = `
      SELECT 
        i.id, 
        i.name, 
        i.created_at,
        i.category_id,
        c.category AS category_name
      FROM inventories i
      LEFT JOIN categories c ON i.category_id = c.id
      WHERE i.user_id = $1
      ORDER BY i.created_at DESC;
    `;
    const inventoriesResult = await client.query(inventoriesQuery, [id]);
    const inventories = inventoriesResult.rows;

    if (inventories.length === 0) {
      return res.status(200).json({
        ok: true,
        user,
        inventories: [],
      });
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
      WHERE inventory_id = ANY($1);
    `;
    const fieldsResult = await client.query(fieldsQuery, [inventoryIds]);

    const fieldsByInventory = {};
    for (const field of fieldsResult.rows) {
      if (!fieldsByInventory[field.inventory_id]) fieldsByInventory[field.inventory_id] = [];
      fieldsByInventory[field.inventory_id].push(field);
    }

    const itemsQuery = `
      SELECT 
        id,
        inventory_id,
        values,
        created_at
      FROM inventory_items
      WHERE inventory_id = ANY($1)
      ORDER BY created_at DESC;
    `;
    const itemsResult = await client.query(itemsQuery, [inventoryIds]);

    const itemsByInventory = {};
    for (const item of itemsResult.rows) {
      if (!itemsByInventory[item.inventory_id]) itemsByInventory[item.inventory_id] = [];
      itemsByInventory[item.inventory_id].push(item);
    }

    const inventoriesWithData = inventories.map((inv) => ({
      ...inv,
      fields: fieldsByInventory[inv.id] || [],
      items: itemsByInventory[inv.id] || [],
    }));

    res.status(200).json({
      ok: true,
      user,
      total_inventories: inventoriesWithData.length,
      inventories: inventoriesWithData,
    });
  } catch (err) {
    console.error('Error is get users:', err.message);
    res.status(500).json({
      ok: false,
      message: 'Server error when receiving user data',
      error: err.message,
    });
  }
});

router.delete('/users/:id', async (req, res) => {
  try {
    const { id } = req.params;
    if (!id) {
      return res.status(400).json({ ok: false, message: 'User id not specified' });
    }
    const checkUser = await client.query('SELECT 1 FROM users WHERE id = $1', [id]);
    if (checkUser.rowCount === 0) {
      return res.status(404).json({ ok: false, message: 'Users is not.' });
    }
    await client.query('DELETE FROM users WHERE id = $1', [id]);
    res.json({ ok: true, message: 'user delete successfully.', userId: id });
  } catch (err) {
    console.error('Error is delete user.', err);
    res.status(500).json({ ok: false, message: 'Error server.', error: err.message });
  }
});

router.delete('/users', authenticateAdmin, async (req, res) => {
  try {
    const { ids } = req.body;

    if (!Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({ ok: false, message: 'User IDs must be provided as an array.' });
    }

    const check = await client.query('SELECT id FROM users WHERE id = ANY($1)', [ids]);
    if (check.rowCount === 0) {
      return res.status(404).json({ ok: false, message: 'No users found with provided IDs.' });
    }

    await client.query('DELETE FROM users WHERE id = ANY($1)', [ids]);

    res.json({
      ok: true,
      message: `Deleted ${ids.length} user(s) successfully.`,
      deletedIds: ids,
    });
  } catch (err) {
    console.error('Error deleting multiple users:', err);
    res
      .status(500)
      .json({ ok: false, message: 'Server error while deleting users.', error: err.message });
  }
});

router.patch('/users', authenticateAdmin, async (req, res) => {
  const { users } = req.body;

  if (!Array.isArray(users) || users.length === 0) {
    return res.status(400).json({ error: 'Invalid request: users must be a non-empty array.' });
  }

  const validRoles = ['admin', 'user'];
  const validStatuses = ['unverified', 'verified', 'blocked', 'active'];

  try {
    for (const user of users) {
      if (!user.id || (!validRoles.includes(user.role) && !validStatuses.includes(user.status))) {
        return res.status(400).json({
          error: `Invalid data for user ${user.id || 'unknown'}`,
        });
      }

      if (validRoles.includes(user.role)) {
        await client.query('UPDATE users SET role = $2 WHERE id = $1', [user.id, user.role]);
      }

      if (validStatuses.includes(user.status)) {
        await client.query('UPDATE users SET status = $2 WHERE id = $1', [user.id, user.status]);
      }

      if (validRoles.includes(user.role) && validStatuses.includes(user.status)) {
        await client.query('UPDATE users SET role = $2, status = $3 WHERE id = $1', [
          user.id,
          user.role,
          user.status,
        ]);
      }
    }

    res.status(200).json({ message: 'Users updated successfully.' });
  } catch (err) {
    console.error('Error updating users:', err);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

router.patch('/users/:id', express.json(), async (req, res) => {
  const { id } = req.params;
  const { salesforce_integration } = req.body;

  if (salesforce_integration === undefined) {
    return res.status(400).json({
      error: 'Field "salesforce_integration" is required',
    });
  }

  try {
    const query = `
      UPDATE users
      SET salesforce_integration = $2
      WHERE id = $1
      RETURNING id, name, email, role, status, salesforce_integration, created_at, last_login;
    `;

    const result = await client.query(query, [id, salesforce_integration]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    return res.status(200).json({
      ok: true,
      message: 'User updated successfully',
      user: result.rows[0],
    });
  } catch (err) {
    console.error('Error updating user:', err.message);
    return res.status(500).json({
      error: 'Server error updating user',
      details: err.message,
    });
  }
});

module.exports = router;
