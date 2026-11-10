'use strict';

/**
 * Boundary middleware for image uploads (IDP photos, company logos).
 * Only JPEG/PNG/WebP up to 5 MB are accepted and files get random names.
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const multer = require('multer');
const config = require('../config/env');
const AppError = require('../utils/AppError');

const MIME_EXT = { 'image/jpeg': '.jpg', 'image/png': '.png', 'image/webp': '.webp' };
const MAX_BYTES = 5 * 1024 * 1024;

fs.mkdirSync(config.uploadDir, { recursive: true });

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, config.uploadDir),
  filename: (req, file, cb) => cb(null, `${crypto.randomBytes(16).toString('hex')}${MIME_EXT[file.mimetype]}`),
});

const upload = multer({
  storage,
  limits: { fileSize: MAX_BYTES, files: 10, fields: 40 },
  fileFilter: (req, file, cb) => {
    if (!MIME_EXT[file.mimetype]) return cb(AppError.badRequest('Only JPEG, PNG or WebP images are allowed.'));
    return cb(null, true);
  },
});

/** Deletes files of a failed request so rejected uploads leave nothing behind. */
function cleanupOnError(err, req, res, next) {
  const files = [].concat(req.files || [], req.file || []);
  files.forEach((f) => fs.promises.unlink(f.path).catch(() => {}));
  next(err);
}

/** Converts uploaded files to { url, caption } records. */
function uploadedPhotos(req, captions = []) {
  return (req.files || []).map((f, i) => ({ url: `/uploads/${f.filename}`, caption: captions[i] || '' }));
}

module.exports = { upload, cleanupOnError, uploadedPhotos, MAX_BYTES };
