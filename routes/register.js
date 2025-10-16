const express = require('express');
const bcrypt = require('bcrypt');
const { client } = require('../database/db');

const router = express.Router();

router.post('/register', async (req, res) => {
  try {
    const { name, email, password } = req.body;

    if (!name || !email || !password) {
      return res.status(400).json({ ok: false, message: 'All fields is required.' });
    }

    const normalizedEmail = email.trim().toLowerCase();

    const { rowCount } = await client.query('SELECT 1 FROM users WHERE LOWER(email) = $1', [
      normalizedEmail,
    ]);

    if (rowCount > 0) {
      return res.status(409).json({ ok: false, message: 'Email already registered.' });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const insertQuery = `
      INSERT INTO users (name, email, password_hash)
      VALUES ($1, $2, $3)
      RETURNING id, name, email, role, status, created_at;
    `;
    const values = [name, email, hashedPassword];
    const result = await client.query(insertQuery, values);

    res.status(201).json({
      ok: true,
      message: 'Users success registered',
      user: result.rows[0],
    });
  } catch (err) {
    console.error('Error registration:', err);
    res.status(500).json({ ok: false, message: 'Error server', error: err.message });
  }
});

module.exports = router;
