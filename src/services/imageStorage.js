/**
 * imageStorage.js — Procesa y guarda imágenes de productos.
 *
 * Interfaz: save(userId, buffer) → {key, url, thumbUrl, width, height}
 *           remove(key)
 *           serve  → middleware que sirve /uploads/<key>.jpg y <key>_thumb.webp
 *
 * Drivers (variable IMAGE_STORAGE):
 *  - disk   (default): carpeta local UPLOAD_DIR. Requiere disco persistente.
 *  - gridfs: dentro de MongoDB. Ideal para hostings gratis sin disco (Render free).
 */
const fs       = require('fs/promises');
const path     = require('path');
const crypto   = require('crypto');
const express  = require('express');
const mongoose = require('mongoose');
const sharp    = require('sharp');

const UPLOAD_ROOT = path.resolve(process.env.UPLOAD_DIR || path.join(__dirname, '../../uploads'));
const PUBLIC_PREFIX = '/uploads';

const MAIN_MAX_PX  = 1600; // Tienda Nube recomienda >= 1024px
const THUMB_MAX_PX = 480;
const FILE_RE = /^products\/[a-f0-9]{24}\/[a-f0-9]{24}(\.jpg|_thumb\.webp)$/;
const CACHE_HEADERS = {
  'Cache-Control': 'public, max-age=31536000, immutable',
  // Cross-origin para que tiendas y feeds externos puedan usarlas
  'Cross-Origin-Resource-Policy': 'cross-origin',
};

class InvalidImageError extends Error {
  constructor() { super('El archivo no es una imagen válida'); this.status = 422; }
}

// Se lee en cada llamada para poder cambiar de driver en los tests
const useGridFS = () => process.env.IMAGE_STORAGE === 'gridfs';

// ── Driver: disco ─────────────────────────────────────────────────────────────
const disk = {
  async write(file, buffer) {
    const full = path.join(UPLOAD_ROOT, file);
    await fs.mkdir(path.dirname(full), { recursive: true });
    await fs.writeFile(full, buffer);
  },
  async unlink(file) {
    await fs.unlink(path.join(UPLOAD_ROOT, file)).catch(err => {
      if (err.code !== 'ENOENT') throw err;
    });
  },
  serve: express.static(UPLOAD_ROOT, {
    immutable: true,
    maxAge: '365d',
    fallthrough: false,
    setHeaders: res => res.set('Cross-Origin-Resource-Policy', 'cross-origin'),
  }),
};

// ── Driver: GridFS (MongoDB) ──────────────────────────────────────────────────
const bucket = () => new mongoose.mongo.GridFSBucket(mongoose.connection.db, { bucketName: 'images' });

const gridfs = {
  write(file, buffer, contentType) {
    return new Promise((resolve, reject) => {
      bucket().openUploadStream(file, { metadata: { contentType } })
        .on('error', reject)
        .on('finish', resolve)
        .end(buffer);
    });
  },
  async unlink(file) {
    const files = await bucket().find({ filename: file }).toArray();
    await Promise.all(files.map(f => bucket().delete(f._id)));
  },
  async serve(req, res, next) {
    try {
      const file = req.path.slice(1);
      if (!FILE_RE.test(file)) return res.sendStatus(404);
      const [doc] = await bucket().find({ filename: file }).limit(1).toArray();
      if (!doc) return res.sendStatus(404);
      res.set({ ...CACHE_HEADERS, 'Content-Type': doc.metadata?.contentType, 'Content-Length': doc.length });
      bucket().openDownloadStream(doc._id).on('error', next).pipe(res);
    } catch (err) { next(err); }
  },
};

const driver = () => (useGridFS() ? gridfs : disk);

// ── API pública ───────────────────────────────────────────────────────────────
async function save(userId, buffer) {
  let meta;
  try {
    meta = await sharp(buffer).metadata();
  } catch {
    throw new InvalidImageError();
  }
  if (!meta.width || !meta.height) throw new InvalidImageError();

  const key = path.posix.join('products', String(userId), crypto.randomBytes(12).toString('hex'));

  // .rotate() aplica la orientación EXIF; sharp descarta metadatos (GPS, etc.)
  const base = sharp(buffer).rotate().flatten({ background: '#ffffff' });

  // Principal en JPEG: formato aceptado por todas las plataformas de venta
  const main = await base.clone()
    .resize(MAIN_MAX_PX, MAIN_MAX_PX, { fit: 'inside', withoutEnlargement: true })
    .jpeg({ quality: 82, mozjpeg: true })
    .toBuffer({ resolveWithObject: true });
  const thumb = await base.clone()
    .resize(THUMB_MAX_PX, THUMB_MAX_PX, { fit: 'inside', withoutEnlargement: true })
    .webp({ quality: 78 })
    .toBuffer();

  const d = driver();
  await d.write(`${key}.jpg`, main.data, 'image/jpeg');
  await d.write(`${key}_thumb.webp`, thumb, 'image/webp');

  return {
    key,
    url:      `${PUBLIC_PREFIX}/${key}.jpg`,
    thumbUrl: `${PUBLIC_PREFIX}/${key}_thumb.webp`,
    width:    main.info.width,
    height:   main.info.height,
  };
}

async function remove(key) {
  // Evitar path traversal con keys manipuladas
  if (!/^products\/[a-f0-9]{24}\/[a-f0-9]{24}$/.test(key)) return;
  const d = driver();
  await Promise.all([`${key}.jpg`, `${key}_thumb.webp`].map(f => d.unlink(f)));
}

function serve(req, res, next) {
  return driver().serve(req, res, next);
}

module.exports = { save, remove, serve, UPLOAD_ROOT, PUBLIC_PREFIX, InvalidImageError };
