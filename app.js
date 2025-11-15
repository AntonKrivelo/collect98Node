require('dotenv').config();
const createError = require('http-errors');
const express = require('express');
const path = require('path');
const cookieParser = require('cookie-parser');
const logger = require('morgan');
const indexRouter = require('./routes/index');
const cors = require('cors');
const { createProxyMiddleware } = require('http-proxy-middleware');
const { startDb, client } = require('./database/db');
const authRouter = require('./routes/auth');
const usersRouter = require('./routes/users');
const categoriesRouter = require('./routes/categories');
const inventoriesRouter = require('./routes/inventories');
const salesforceRouter = require('./routes/salesforce');

const app = express();

startDb();

app.set('views', path.join(__dirname, 'views'));
app.set('view engine', 'jade');
app.use(cors());
app.use(logger('dev'));
app.use(express.json());
app.use(express.urlencoded({ extended: false }));
app.use(cookieParser());
app.use(express.static(path.join(__dirname, 'public')));

app.use('/', indexRouter);
app.use('/', authRouter);
app.use('/', usersRouter);
app.use('/', categoriesRouter);
app.use('/', inventoriesRouter);
app.use('/', salesforceRouter);

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

module.exports = app;
