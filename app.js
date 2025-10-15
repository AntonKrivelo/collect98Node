const createError = require('http-errors');
const express = require('express');
const path = require('path');
const cookieParser = require('cookie-parser');
const logger = require('morgan');
const indexRouter = require('./routes/index');
const usersRouter = require('./routes/users');
const cors = require('cors');
const { createProxyMiddleware } = require('http-proxy-middleware');

const pg = require('pg');
const bcrypt = require('bcrypt');

const config = {};

const client = new pg.Client(config);

const app = express();

app.set('views', path.join(__dirname, 'views'));
app.set('view engine', 'jade');

app.use(logger('dev'));
app.use(express.json());
app.use(express.urlencoded({ extended: false }));
app.use(cookieParser());
app.use(express.static(path.join(__dirname, 'public')));

app.use('/', indexRouter);
app.use('/users', usersRouter);

app.get('/products/:id', cors(), function (req, res, next) {
  res.json({ msg: 'This is CORS-enabled for a Single Route' });
});

app.use(function (req, res, next) {
  next(createError(404));
});

app.use(function (err, req, res, next) {
  res.locals.message = err.message;
  res.locals.error = req.app.get('env') === 'development' ? err : {};

  res.status(err.status || 500);
  res.json({ error: err.message });
});

app.use(
  '/',
  createProxyMiddleware({
    target: 'http://localhost:3000',
    changeOrigin: true,
  }),
);

const startDb = async () => {
  try {
    await client.connect();
    console.log('Connected to Postgres');

    await client.query(`CREATE EXTENSION IF NOT EXISTS pgcrypto;`);

    const createUsersTableQuery = `
      CREATE TABLE IF NOT EXISTS users (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        name TEXT NOT NULL,
        email TEXT UNIQUE NOT NULL,
        password_hash TEXT NOT NULL,
        role TEXT DEFAULT 'user',
        status TEXT DEFAULT 'unverified',
        last_login TIMESTAMP,
        created_at TIMESTAMP DEFAULT NOW()
      );
    `;
    await client.query(createUsersTableQuery);
    console.log('"users" table created or already exists');
  } catch (err) {
    console.error('Database setup error:', err);
    process.exit(1);
  }
};

module.exports = { startDb };

module.exports = app;
