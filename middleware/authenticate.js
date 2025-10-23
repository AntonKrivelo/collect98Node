const jwt = require('jsonwebtoken');
const client = require('../database/db');
require('dotenv').config();

const authenticate = async (req, res, next) => {
  const authHeader = req.headers['authorization'];

  const token = authHeader && authHeader.split(' ')[1];
  if (!token) {
    return res.status(401).json({ error: 'Token required' });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    const userResult = await client.query('SELECT id, blocked, status FROM users WHERE id = $1', [
      decoded.userId,
    ]);

    if (userResult.rows.length === 0) {
      return res.status(401).json({ error: 'User not found' });
    }

    const user = userResult.rows[0];

    if (user.status === 'blocked') {
      return res.status(403).json({
        error: 'Account is blocked. Please contact administrator.',
      });
    }

    req.user = user;
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
};

module.exports = authenticate;
