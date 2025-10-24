const express = require('express');
const { client } = require('../database/db');
const authenticateAdmin = require('../middleware/authenticateAdmin');
require('dotenv').config();
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

module.exports = router;
