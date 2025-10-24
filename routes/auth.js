const express = require('express');
const { client } = require('../database/db');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
require('dotenv').config();
const authenticate = require('../middleware/authenticate');
const router = express.Router();

router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ message: 'Login and password is required.' });
    }

    const result = await client.query('SELECT * FROM users WHERE email = $1', [email]);
    const user = result.rows[0];

    if (user.status === 'blocked') {
      return res.status(403).json({
        error: 'Account is blocked. Please contact administrator.',
      });
    }

    if (!user || !(await bcrypt.compare(password, user.password_hash))) {
      return res.status(401).json({ message: 'Invalid username or password' });
    }

    const token = jwt.sign(
      { id: user.id, email: user.email, role: user.role, status: user.status },
      process.env.JWT_SECRET,
      {
        expiresIn: '24h',
      },
    );

    res.json({
      ok: true,
      message: 'The login was completed successfully',
      token,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        status: user.status,
      },
    });
  } catch (error) {
    console.error('Error during authorization:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

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
    const values = [name.trim(), normalizedEmail, hashedPassword];
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
