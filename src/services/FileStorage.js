'use strict';

const fs = require('fs');
const path = require('path');
const config = require('../config/env');

/** Removes locally stored uploads (only files under /uploads/ - never external URLs). */
class FileStorage {
  static removeLocal(urls = []) {
    urls.forEach((url) => {
      if (typeof url !== 'string' || !url.startsWith('/uploads/')) return;
      const name = path.basename(url);
      const file = path.join(config.uploadDir, name);
      fs.promises.unlink(file).catch(() => {});
    });
  }

  static urlFor(filename) {
    return `/uploads/${filename}`;
  }
}

module.exports = FileStorage;
