const express = require('express');
const { client } = require('../database/db');

const router = express.Router();

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

module.exports = router;
