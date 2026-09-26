const { body, param, validationResult } = require('express-validator');
const Material = require('../models/Material');
const Product  = require('../models/Product');
const logger   = require('../utils/logger');
const { computeTotals } = require('../shared/pricing');

function handleValidation(req, res) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    res.status(422).json({ errors: errors.array().map(e => e.msg) });
    return true;
  }
  return false;
}

// ── Validators ────────────────────────────────────────────────────────────────

exports.addMaterialValidators = [
  body('name').isString().trim().notEmpty().withMessage('Nombre requerido').isLength({ max: 200 }),
  body('totalCost').isFloat({ gt: 0 }).withMessage('Costo total debe ser mayor a 0'),
  body('qty').isInt({ gt: 0 }).withMessage('Cantidad debe ser un entero mayor a 0'),
];

exports.updateMaterialValidators = [
  param('id').isMongoId().withMessage('ID inválido'),
  body('name').optional().isString().trim().notEmpty().isLength({ max: 200 }),
  body('totalCost').optional().isFloat({ gt: 0 }).withMessage('Costo total debe ser mayor a 0'),
  body('qty').optional().isInt({ gt: 0 }).withMessage('Cantidad debe ser un entero mayor a 0'),
];

exports.deleteValidator = [
  param('id').isMongoId().withMessage('ID inválido'),
];

// ── GET /api/materials ────────────────────────────────────────────────────────

exports.getMaterials = async (req, res, next) => {
  try {
    const materials = await Material.find({ userId: req.user.userId })
      .sort({ createdAt: -1 })
      .lean();
    res.json({ materials });
  } catch (err) { next(err); }
};

// ── POST /api/materials ───────────────────────────────────────────────────────

exports.addMaterial = async (req, res, next) => {
  if (handleValidation(req, res)) return;
  try {
    const { name, totalCost, qty } = req.body;
    const unitPrice = parseFloat((Number(totalCost) / Number(qty)).toFixed(4));
    const material = await Material.create({
      userId: req.user.userId,
      name: String(name).trim(),
      totalCost: Number(totalCost),
      qty: Number(qty),
      unitPrice,
    });
    logger.info(`Material creado: ${material._id} por usuario ${req.user.userId}`);
    res.status(201).json({ material });
  } catch (err) { next(err); }
};

// ── PUT /api/materials/:id ────────────────────────────────────────────────────
// Actualiza el material Y recalcula en cascada todos los productos que lo usan.

exports.updateMaterial = async (req, res, next) => {
  if (handleValidation(req, res)) return;
  try {
    const { name, totalCost, qty } = req.body;

    const material = await Material.findOne({
      _id: req.params.id,
      userId: req.user.userId,
    });
    if (!material) return res.status(404).json({ message: 'Material no encontrado' });

    // Aplicar cambios
    if (name      !== undefined) material.name      = String(name).trim();
    if (totalCost !== undefined) material.totalCost = Number(totalCost);
    if (qty       !== undefined) material.qty       = Number(qty);
    material.unitPrice = parseFloat((material.totalCost / material.qty).toFixed(4));
    await material.save();

    // ── Recalcular en cascada los productos que usan este insumo ─────────────
    const matId = material._id.toString();

    const productos = await Product.find({
      userId: req.user.userId,
      'insumos.materialId': material._id,
    }).select('insumos pctOtros pctGanancia pctDescuento redondeo').lean();

    const ops = productos.map(prod => {
      const insumos = prod.insumos.map(ins =>
        ins.materialId && ins.materialId.toString() === matId
          ? { ...ins, name: material.name, unitPrice: material.unitPrice }
          : ins
      );
      const { pctOtros, pctGanancia, pctDescuento, redondeo, ...totals } =
        computeTotals({ ...prod, insumos });
      return { updateOne: { filter: { _id: prod._id }, update: { $set: totals } } };
    });

    if (ops.length) await Product.bulkWrite(ops);
    const actualizados = ops.length;

    if (actualizados > 0) {
      logger.info(`Cascada: ${actualizados} producto(s) recalculados tras actualizar insumo ${matId}`);
    }

    res.json({
      material,
      cascade: { productosActualizados: actualizados },
    });
  } catch (err) { next(err); }
};

// ── DELETE /api/materials/:id ─────────────────────────────────────────────────

exports.deleteMaterial = async (req, res, next) => {
  if (handleValidation(req, res)) return;
  try {
    const result = await Material.findOneAndDelete({
      _id: req.params.id,
      userId: req.user.userId,
    });
    if (!result) return res.status(404).json({ message: 'Material no encontrado' });
    logger.info(`Material eliminado: ${req.params.id} por usuario ${req.user.userId}`);
    res.json({ message: 'Material eliminado' });
  } catch (err) { next(err); }
};

// ── POST /api/materials/merge ─────────────────────────────────────────────────

exports.mergeMaterials = async (req, res, next) => {
  try {
    const payload = req.body.materials;
    if (!Array.isArray(payload) || payload.length === 0) {
      return res.status(400).json({ message: 'Se requiere un arreglo de materials' });
    }
    if (payload.length > 200) {
      return res.status(422).json({ message: 'Máximo 200 ítems por merge' });
    }

    const candidates = payload.map(item => {
      const name      = String(item.name || '').trim();
      const totalCost = Number(item.totalCost);
      const qty       = Number(item.qty);
      if (!name || name.length > 200 || totalCost <= 0 || !Number.isInteger(qty) || qty <= 0) return null;
      return { name, totalCost: parseFloat(totalCost.toFixed(2)), qty, unitPrice: parseFloat((totalCost / qty).toFixed(4)) };
    }).filter(Boolean);

    if (!candidates.length) return res.status(422).json({ message: 'No hay ítems válidos para fusionar' });

    const existing     = await Material.find({ userId: req.user.userId }).select('name').lean();
    const existingNames = new Set(existing.map(m => m.name.toLowerCase()));
    const toInsert     = candidates.filter(c => !existingNames.has(c.name.toLowerCase()));

    if (!toInsert.length) return res.json({ added: 0, materialsAdded: [] });

    const inserted = await Material.insertMany(toInsert.map(c => ({ ...c, userId: req.user.userId })));
    logger.info(`Merge: ${inserted.length} materiales agregados para usuario ${req.user.userId}`);
    res.json({ added: inserted.length, materialsAdded: inserted });
  } catch (err) { next(err); }
};
