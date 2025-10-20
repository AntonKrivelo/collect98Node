const express = require('express');
const { client } = require('../database/db');

const router = express.Router();

router.get('/users', async (req, res) => {
  try {
    const query = `
      SELECT id, name, email, role, status, last_login, created_at
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

router.patch('/users/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { role, status } = req.body;

    if (!role && !status) {
      return res.status(400).json({ error: 'Provide at least one field: role or status' });
    }

    const validRoles = ['user', 'admin'];
    const validStatuses = ['unverified', 'verified', 'blocked'];

    if (role && !validRoles.includes(role)) {
      return res.status(400).json({ error: 'Invalid role value' });
    }
    if (status && !validStatuses.includes(status)) {
      return res.status(400).json({ error: 'Invalid status value' });
    }

    const fields = [];
    const values = [];
    let index = 1;

    if (role) {
      fields.push(`role = $${index++}`);
      values.push(role);
    }
    if (status) {
      fields.push(`status = $${index++}`);
      values.push(status);
    }

    values.push(id);

    const query = `
      UPDATE users
      SET ${fields.join(', ')}
      WHERE id = $${index}
      RETURNING id, name, email, role, status;
    `;

    const result = await client.query(query, values);

    if (result.rowCount === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    res.json({ message: 'User updated successfully', user: result.rows[0] });
  } catch (err) {
    console.error('Error updating user:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
