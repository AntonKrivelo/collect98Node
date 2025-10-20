const express = require('express');
require('dotenv').config();
const authenticateAdmin = require('../middleware/authenticateAdmin');

const router = express.Router();

router.patch('/admin/update-users', authenticateAdmin, async (req, res) => {
  const { users } = req.body;

  if (!Array.isArray(users) || users.length === 0) {
    return res.status(400).json({ error: 'Invalid request: users must be a non-empty array.' });
  }

  const validRoles = ['admin', 'user'];
  const validStatuses = ['unverified', 'verified', 'blocked'];

  try {
    for (const user of users) {
      if (!user.id || !validRoles.includes(user.role) || !validStatuses.includes(user.status)) {
        return res.status(400).json({
          error: `Invalid data for user ${user.id || 'unknown'}`,
        });
      }

      await client.query('UPDATE users SET role = $2, status = $3 WHERE id = $1', [
        user.id,
        user.role,
        user.status,
      ]);
    }

    res.status(200).json({ message: 'Users updated successfully.' });
  } catch (err) {
    console.error('Error updating users:', err);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

module.exports = router;
