'use strict';

/**
 * Central configuration. Reads environment variables once so that no other
 * module touches process.env directly.
 */
try {
  // dotenv is optional at runtime (CI provides real env vars)
  require('dotenv').config();
} catch (_) { /* ignore */ }

const isTest = process.env.NODE_ENV === 'test';

module.exports = {
  isTest,
  isProduction: process.env.NODE_ENV === 'production',
  port: Number(process.env.PORT) || 3000,
  databaseUrl: isTest
    ? (process.env.TEST_DATABASE_URL || 'postgres://postgres:postgres@localhost:5432/designmatch_test')
    : (process.env.DATABASE_URL || 'postgres://postgres:postgres@localhost:5432/designmatch'),
  sessionSecret: process.env.SESSION_SECRET || 'dev-only-session-secret-change-me',
  timezone: process.env.APP_TIMEZONE || 'Asia/Singapore',
  cookieSecure: process.env.COOKIE_SECURE === 'true',
  bcryptRounds: isTest ? 4 : 10,
  uploadDir: process.env.UPLOAD_DIR || require('path').join(__dirname, '..', '..', 'public', 'uploads'),
};
