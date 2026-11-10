'use strict';

/**
 * Express application assembly. This file wires the Boundary layer (routes +
 * static UI) together; it contains no business logic and no SQL.
 */
const path = require('path');
const express = require('express');
const helmet = require('helmet');
const session = require('express-session');
const config = require('./config/env');
const { pool } = require('./config/db');
const { loadUser } = require('./middleware/auth');
const { notFound, errorHandler } = require('./middleware/errorHandler');

function buildSessionStore() {
  const PgStore = require('connect-pg-simple')(session);
  return new PgStore({ pool, tableName: 'user_sessions', createTableIfMissing: false, pruneSessionInterval: config.isTest ? false : 900 });
}

function createApp({ sessionStore } = {}) {
  const app = express();
  app.disable('x-powered-by');
  if (config.cookieSecure) app.set('trust proxy', 1);

  app.use(helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        imgSrc: ["'self'", 'data:', 'blob:', 'https:'],
        styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
        fontSrc: ["'self'", 'https://fonts.gstatic.com'],
        scriptSrc: ["'self'"],
        connectSrc: ["'self'"],
        objectSrc: ["'none'"],
        frameAncestors: ["'none'"],
        upgradeInsecureRequests: config.cookieSecure ? [] : null,
      },
    },
    crossOriginEmbedderPolicy: false,
  }));

  app.use(express.json({ limit: '100kb' }));
  app.use(express.urlencoded({ extended: false, limit: '100kb' }));

  app.use(session({
    name: 'dm.sid',
    store: sessionStore === undefined ? buildSessionStore() : sessionStore,
    secret: config.sessionSecret,
    resave: false,
    saveUninitialized: false,
    rolling: true,
    cookie: {
      httpOnly: true,
      sameSite: 'strict',
      secure: config.cookieSecure,
      maxAge: 1000 * 60 * 60 * 8,
    },
  }));

  app.use('/api', loadUser);
  const version = (process.env.RENDER_GIT_COMMIT || process.env.GIT_COMMIT || 'dev').slice(0, 7);
  app.get('/api/health', (req, res) => res.json({ status: 'ok', version, time: new Date().toISOString() }));
  app.use('/api/auth', require('./boundary/routes/authRoutes'));
  app.use('/api/admin', require('./boundary/routes/adminRoutes'));
  app.use('/api/designer', require('./boundary/routes/designerRoutes'));
  app.use('/api/customer', require('./boundary/routes/customerRoutes'));
  app.use('/api/manager', require('./boundary/routes/managerRoutes'));
  app.use('/api', require('./boundary/routes/publicRoutes'));
  app.use('/api', notFound);

  // UI Boundary: static single-page application
  const publicDir = path.join(__dirname, '..', 'public');
  app.use('/uploads', express.static(config.uploadDir, { maxAge: '7d', index: false }));
  app.use(express.static(publicDir, { index: 'index.html' }));
  app.get('*', (req, res) => {
    // Only page routes fall back to the app shell; a missing image or script is a real 404
    if (path.extname(req.path)) return res.status(404).send('Not found');
    return res.sendFile(path.join(publicDir, 'index.html'));
  });

  app.use(errorHandler);
  return app;
}

module.exports = { createApp };
