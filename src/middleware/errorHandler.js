'use strict';

const AppError = require('../utils/AppError');

/** Wraps an async route handler so rejected promises reach the error handler. */
const asyncHandler = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

function notFound(req, res) {
  res.status(404).json({ error: 'The requested resource was not found.' });
}

// eslint-disable-next-line no-unused-vars
function errorHandler(err, req, res, next) {
  if (err instanceof AppError) {
    return res.status(err.status).json({ error: err.message, ...(err.details || {}) });
  }
  if (err && err.name === 'MulterError') {
    const msg = err.code === 'LIMIT_FILE_SIZE' ? 'Each image must be 5 MB or smaller.'
      : err.code === 'LIMIT_FILE_COUNT' ? 'Too many files uploaded (maximum 10).'
        : 'The upload could not be processed.';
    return res.status(400).json({ error: msg });
  }
  if (err && err.type === 'entity.parse.failed') return res.status(400).json({ error: 'Malformed JSON body.' });
  if (err && err.type === 'entity.too.large') return res.status(413).json({ error: 'Request body is too large.' });
  // PostgreSQL constraint violations that slipped past validation
  if (err && err.code === '23505') return res.status(409).json({ error: 'This record already exists.' });
  if (err && (err.code === '23503' || err.code === '23514' || err.code === '22P02')) {
    return res.status(400).json({ error: 'The request contains invalid data.' });
  }
  if (process.env.NODE_ENV !== 'test') console.error(err);
  return res.status(500).json({ error: 'Something went wrong. Please try again.' });
}

module.exports = { asyncHandler, notFound, errorHandler };
