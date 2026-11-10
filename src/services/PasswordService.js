'use strict';

const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const config = require('../config/env');

/** bcrypt hashing helpers. Plaintext passwords are never stored or returned. */
class PasswordService {
  static hash(plain) {
    return bcrypt.hash(plain, config.bcryptRounds);
  }

  static verify(plain, hash) {
    if (!plain || !hash) return Promise.resolve(false);
    return bcrypt.compare(plain, hash);
  }

  /** Random temporary password (letters + digits) used by admin reset / admin-created accounts. */
  static generateTemporary(length = 12) {
    const letters = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz';
    const digits = '23456789';
    const all = letters + digits;
    const pick = (set) => set[crypto.randomInt(set.length)];
    const chars = [pick(letters), pick(digits)];
    while (chars.length < length) chars.push(pick(all));
    for (let i = chars.length - 1; i > 0; i -= 1) {
      const j = crypto.randomInt(i + 1);
      [chars[i], chars[j]] = [chars[j], chars[i]];
    }
    return chars.join('');
  }
}

module.exports = PasswordService;
