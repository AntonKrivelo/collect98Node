const express = require('express');
require('dotenv').config();
const { client } = require('../database/db');
const authenticate = require('../middleware/authenticate');

const router = express.Router();

router.get('/me', authenticate, async (req, res) => {
  try {
    const userResult = await client.query('SELECT * FROM users WHERE id = $1', [req.user.id]);
    const user = userResult.rows[0];

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    const { password_hash, ...safeUser } = user;
    res.status(200).json({ user: safeUser });
  } catch (err) {
    console.error('Fetch /me error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
