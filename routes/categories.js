const express = require('express');
const { client } = require('../database/db');
require('dotenv').config();
const router = express.Router();

router.get('/categories', async (req, res) => {
  try {
    const query = `
      SELECT id, category
      FROM categories      
      `;
    const result = await client.query(query);
    res.status(200).json({ category: result.rows });
  } catch (err) {
    console.error('Error fetching category:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.post('/categories', async (req, res) => {
  try {
    const { category } = req.body;
    if (!category) {
      return res.status(400).json({ ok: false, message: 'All fields is required.' });
    }

    const fixNameCategory = category.trim().toLowerCase();

    const { rowCount } = await client.query('SELECT 1 FROM categories WHERE LOWER(category) = $1', [
      fixNameCategory,
    ]);

    if (rowCount > 0) {
      return res
        .status(409)
        .json({ ok: false, message: 'A category with that name already exists.' });
    }
    const insertQuery = `
      INSERT INTO categories (category)
      VALUES ($1)
      RETURNING id, category;
    `;

    const values = [category];
    const result = await client.query(insertQuery, values);
    res.status(201).json({
      ok: true,
      message: 'The category was successfully created',
      category: result.rows[0],
    });
  } catch {
    console.error('Error created category:', err);
    res.status(500).json({ ok: false, message: 'Error server', error: err.message });
  }
});

module.exports = router;
