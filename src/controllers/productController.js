const { body, param, query, validationResult } = require('express-validator');
const multer   = require('multer');
const Product  = require('../models/Product');
const Material = require('../models/Material');
const { computeTotals, REDONDEOS } = require('../shared/pricing');
const imageStorage  = require('../services/imageStorage');
const catalogExport = require('../services/catalogExport');
const logger   = require('../utils/logger');

const MAX_IMAGES   = 8;
const MAX_IMAGE_MB = 8;

function handleValidation(req, res) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    res.status(422).json({ errors: errors.array().map(e => e.msg) });
    return true;
  }
  return false;
}

const idParam = param('id').isMongoId().withMessage('ID inválido');

// ── Validators ────────────────────────────────────────────────────────────────

const costingValidators = [
  body('name').isString().trim().notEmpty().withMessage('Nombre requerido').isLength({ max: 200 }),
  body('insumos').isArray({ min: 1, max: 200 }).withMessage('Debe haber al menos un insumo'),
  body('insumos.*.materialId').optional({ values: 'falsy' }).isMongoId(),
  body('insumos.*.name').isString().trim().notEmpty(),
  body('insumos.*.qty').isFloat({ gt: 0 }).withMessage('Las cantidades deben ser mayores a 0'),
  body('insumos.*.unitPrice').isFloat({ min: 0 }),
  body('pctOtros').optional().isFloat({ min: 0, max: 1000 }),
  body('pctGanancia').optional().isFloat({ min: 0, max: 10000 }),
  body('pctDescuento').optional().isFloat({ min: 0, max: 100 }),
  body('redondeo').optional().isIn(REDONDEOS.map(String).concat(REDONDEOS)),
  body('notas').optional().isString().isLength({ max: 500 }),
];

const catalogValidators = [
  body('name').optional().isString().trim().notEmpty().isLength({ max: 200 }),
  body('description').optional().isString().isLength({ max: 5000 }),
  body('category').optional().isString().trim().isLength({ max: 100 }),
  body('brand').optional().isString().trim().isLength({ max: 100 }),
  body('sku').optional().isString().trim().isLength({ max: 100 }),
  body('barcode').optional().isString().trim().isLength({ max: 50 }),
  body('tags').optional().isArray({ max: 30 }),
  body('tags.*').isString().trim().isLength({ max: 50 }),
  body('stock').optional({ values: 'null' }).isInt({ min: 0 }).withMessage('Stock inválido'),
  body('published').optional().isBoolean(),
  body('weightKg').optional({ values: 'null' }).isFloat({ min: 0 }),
  body('dimensionsCm.height').optional({ values: 'null' }).isFloat({ min: 0 }),
  body('dimensionsCm.width').optional({ values: 'null' }).isFloat({ min: 0 }),
  body('dimensionsCm.depth').optional({ values: 'null' }).isFloat({ min: 0 }),
];

const CATALOG_FIELDS = ['name', 'description', 'category', 'brand', 'sku', 'barcode',
  'tags', 'stock', 'published', 'weightKg', 'dimensionsCm'];

exports.saveValidators   = [...costingValidators, ...catalogValidators.slice(1)];
exports.updateValidators = [idParam, ...costingValidators];
exports.catalogValidators = [idParam, ...catalogValidators];
exports.idValidator = [idParam];

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Recalcula el costeo en el servidor. Los precios unitarios salen de la base
 * de insumos del usuario (fuente de verdad); si un insumo fue borrado se
 * conserva el precio guardado en el producto.
 */
async function buildCosting(userId, b) {
  const ids = b.insumos.map(i => i.materialId).filter(Boolean);
  const mats = ids.length
    ? await Material.find({ _id: { $in: ids }, userId }).select('name unitPrice').lean()
    : [];
  const byId = new Map(mats.map(m => [String(m._id), m]));

  const insumos = b.insumos.map(i => {
    const m = i.materialId && byId.get(String(i.materialId));
    return {
      materialId: m ? m._id : undefined,
      name:       m ? m.name : String(i.name).trim(),
      unitPrice:  m ? m.unitPrice : Number(i.unitPrice),
      qty:        Number(i.qty),
    };
  });

  return computeTotals({
    insumos,
    pctOtros: b.pctOtros, pctGanancia: b.pctGanancia,
    pctDescuento: b.pctDescuento, redondeo: b.redondeo,
  });
}

function pickCatalog(b) {
  const out = {};
  for (const f of CATALOG_FIELDS) if (b[f] !== undefined) out[f] = b[f];
  if (out.tags) out.tags = [...new Set(out.tags.map(t => t.trim()).filter(Boolean))];
  return out;
}

function baseUrlOf(req) {
  return process.env.PUBLIC_BASE_URL || process.env.RENDER_EXTERNAL_URL || `${req.protocol}://${req.get('host')}`;
}

// ── GET /api/products ─────────────────────────────────────────────────────────

exports.getProducts = async (req, res, next) => {
  try {
    const products = await Product.find({ userId: req.user.userId })
      .sort({ createdAt: -1 })
      .lean();
    res.json({ products });
  } catch (err) { next(err); }
};

// ── GET /api/products/:id ─────────────────────────────────────────────────────

exports.getProduct = async (req, res, next) => {
  if (handleValidation(req, res)) return;
  try {
    const product = await Product.findOne({ _id: req.params.id, userId: req.user.userId }).lean();
    if (!product) return res.status(404).json({ message: 'Producto no encontrado' });
    res.json({ product });
  } catch (err) { next(err); }
};

// ── POST /api/products ────────────────────────────────────────────────────────

exports.saveProduct = async (req, res, next) => {
  if (handleValidation(req, res)) return;
  try {
    const costing = await buildCosting(req.user.userId, req.body);
    const product = await Product.create({
      userId: req.user.userId,
      ...pickCatalog(req.body),
      name: req.body.name,
      notas: req.body.notas || '',
      ...costing,
    });
    logger.info(`Producto guardado: ${product._id} por usuario ${req.user.userId}`);
    res.status(201).json({ product });
  } catch (err) { next(err); }
};

// ── PUT /api/products/:id — recalcula el costeo ──────────────────────────────

exports.updateProduct = async (req, res, next) => {
  if (handleValidation(req, res)) return;
  try {
    const product = await Product.findOne({ _id: req.params.id, userId: req.user.userId });
    if (!product) return res.status(404).json({ message: 'Producto no encontrado' });

    const costing = await buildCosting(req.user.userId, req.body);
    product.set({ ...costing, name: req.body.name });
    if (req.body.notas !== undefined) product.notas = req.body.notas;
    await product.save();
    res.json({ product });
  } catch (err) { next(err); }
};

// ── PATCH /api/products/:id — datos de catálogo ──────────────────────────────

exports.updateCatalog = async (req, res, next) => {
  if (handleValidation(req, res)) return;
  try {
    const product = await Product.findOneAndUpdate(
      { _id: req.params.id, userId: req.user.userId },
      { $set: pickCatalog(req.body) },
      { new: true, runValidators: true }
    ).lean();
    if (!product) return res.status(404).json({ message: 'Producto no encontrado' });
    res.json({ product });
  } catch (err) { next(err); }
};

// ── DELETE /api/products/:id ──────────────────────────────────────────────────

exports.deleteProduct = async (req, res, next) => {
  if (handleValidation(req, res)) return;
  try {
    const result = await Product.findOneAndDelete({ _id: req.params.id, userId: req.user.userId });
    if (!result) return res.status(404).json({ message: 'Producto no encontrado' });
    await Promise.all(result.images.map(img => imageStorage.remove(img.key)))
      .catch(err => logger.warn(`No se pudieron borrar imágenes de ${result._id}: ${err.message}`));
    res.json({ message: 'Producto eliminado' });
  } catch (err) { next(err); }
};

// ── Imágenes ──────────────────────────────────────────────────────────────────

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_IMAGE_MB * 1024 * 1024, files: MAX_IMAGES },
  fileFilter: (req, file, cb) => {
    if (/^image\/(jpeg|png|webp|gif|avif|tiff)$/.test(file.mimetype)) return cb(null, true);
    const err = new Error('Formato no soportado. Usá JPG, PNG o WebP');
    err.status = 422;
    cb(err);
  },
});

exports.uploadMiddleware = (req, res, next) => {
  upload.array('images', MAX_IMAGES)(req, res, err => {
    if (err instanceof multer.MulterError) {
      const message = err.code === 'LIMIT_FILE_SIZE'
        ? `Cada imagen puede pesar hasta ${MAX_IMAGE_MB} MB`
        : `Máximo ${MAX_IMAGES} imágenes por producto`;
      return res.status(422).json({ message });
    }
    next(err);
  });
};

// POST /api/products/:id/images
exports.addImages = async (req, res, next) => {
  if (handleValidation(req, res)) return;
  try {
    if (!req.files?.length) return res.status(422).json({ message: 'No se recibieron imágenes' });

    const product = await Product.findOne({ _id: req.params.id, userId: req.user.userId });
    if (!product) return res.status(404).json({ message: 'Producto no encontrado' });
    if (product.images.length + req.files.length > MAX_IMAGES) {
      return res.status(422).json({ message: `Máximo ${MAX_IMAGES} imágenes por producto` });
    }

    const saved = [];
    try {
      for (const f of req.files) saved.push(await imageStorage.save(req.user.userId, f.buffer));
    } catch (err) {
      await Promise.all(saved.map(s => imageStorage.remove(s.key)));
      throw err;
    }

    product.images.push(...saved.map(s => ({ ...s, alt: product.name })));
    await product.save();
    res.status(201).json({ product: product.toObject() });
  } catch (err) { next(err); }
};

// DELETE /api/products/:id/images/:imageId
exports.deleteImage = async (req, res, next) => {
  if (handleValidation(req, res)) return;
  try {
    const product = await Product.findOne({ _id: req.params.id, userId: req.user.userId });
    const img = product?.images.id(req.params.imageId);
    if (!img) return res.status(404).json({ message: 'Imagen no encontrada' });

    const key = img.key;
    img.deleteOne();
    await product.save();
    await imageStorage.remove(key).catch(err => logger.warn(`Borrado de imagen ${key}: ${err.message}`));
    res.json({ product: product.toObject() });
  } catch (err) { next(err); }
};

// PATCH /api/products/:id/images/:imageId/cover — la pasa a portada
exports.setCover = async (req, res, next) => {
  if (handleValidation(req, res)) return;
  try {
    const product = await Product.findOne({ _id: req.params.id, userId: req.user.userId });
    const img = product?.images.id(req.params.imageId);
    if (!img) return res.status(404).json({ message: 'Imagen no encontrada' });

    const data = img.toObject();
    img.deleteOne();
    product.images.unshift(data);
    await product.save();
    res.json({ product: product.toObject() });
  } catch (err) { next(err); }
};

exports.imageValidators = [idParam, param('imageId').isMongoId().withMessage('ID inválido')];

// ── GET /api/products/export?format=… ─────────────────────────────────────────

const EXPORTS = {
  tiendanube:       { type: 'text/csv; charset=utf-8',        ext: 'csv',  name: 'catalogo-tiendanube' },
  meta:             { type: 'text/csv; charset=utf-8',        ext: 'csv',  name: 'catalogo-meta-google' },
  json:             { type: 'application/json; charset=utf-8', ext: 'json', name: 'catalogo' },
  'tiendanube-api': { type: 'application/json; charset=utf-8', ext: 'json', name: 'catalogo-tiendanube-api' },
};

exports.exportValidators = [
  query('format').isIn(Object.keys(EXPORTS)).withMessage('Formato de exportación inválido'),
  query('onlyPublished').optional().isBoolean(),
  query('storeUrl').optional({ values: 'falsy' }).isURL({ protocols: ['http', 'https'], require_protocol: true })
    .withMessage('URL de tienda inválida'),
];

exports.exportCatalog = async (req, res, next) => {
  if (handleValidation(req, res)) return;
  try {
    const filter = { userId: req.user.userId };
    if (req.query.onlyPublished === 'true') filter.published = true;
    const products = await Product.find(filter).select('-insumos').sort({ name: 1 }).lean();

    const opts = { baseUrl: baseUrlOf(req), storeUrl: req.query.storeUrl };
    const fmt = req.query.format;
    const out = {
      tiendanube:       () => catalogExport.tiendanubeCsv(products),
      meta:             () => catalogExport.metaCsv(products, opts),
      json:             () => JSON.stringify(catalogExport.json(products, opts), null, 2),
      'tiendanube-api': () => JSON.stringify(products.map(p => catalogExport.tiendanubeApiPayload(p, opts)), null, 2),
    }[fmt]();

    const { type, ext, name } = EXPORTS[fmt];
    const date = new Date().toISOString().slice(0, 10);
    res.set('Content-Type', type);
    res.set('Content-Disposition', `attachment; filename="${name}-${date}.${ext}"`);
    res.send(out);
  } catch (err) { next(err); }
};
