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

module.exports = router;
