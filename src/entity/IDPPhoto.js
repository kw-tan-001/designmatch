'use strict';

const db = require('../config/db');

/** Entity: IDPPhoto (table idp_photos). */
class IDPPhoto {
  static async countByIdp(idpId, client = db) {
    const { rows } = await client.query('SELECT COUNT(*)::int AS n FROM idp_photos WHERE idp_id = $1', [idpId]);
    return rows[0].n;
  }

  /** photos: [{ url, caption }] appended after existing photos. */
  static async addMany(idpId, photos, client = db) {
    if (!photos.length) return;
    const { rows } = await client.query(
      'SELECT COALESCE(MAX(sort_order), -1)::int AS m FROM idp_photos WHERE idp_id = $1', [idpId],
    );
    let order = rows[0].m + 1;
    for (const photo of photos) {
      await client.query(
        'INSERT INTO idp_photos (idp_id, url, caption, sort_order) VALUES ($1, $2, $3, $4)',
        [idpId, photo.url, photo.caption || '', order],
      );
      order += 1;
    }
  }

  /** Removes the given photos of an IDP and returns their URLs (for file cleanup). */
  static async deleteMany(idpId, photoIds, client = db) {
    if (!photoIds.length) return [];
    const { rows } = await client.query(
      'DELETE FROM idp_photos WHERE idp_id = $1 AND photo_id = ANY($2::int[]) RETURNING url',
      [idpId, photoIds],
    );
    return rows.map((r) => r.url);
  }

  static async urlsForIdp(idpId, client = db) {
    const { rows } = await client.query('SELECT url FROM idp_photos WHERE idp_id = $1', [idpId]);
    return rows.map((r) => r.url);
  }
}

module.exports = IDPPhoto;
