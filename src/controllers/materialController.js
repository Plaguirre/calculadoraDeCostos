const { body, param, validationResult } = require('express-validator');
const Material = require('../models/Material');
const logger = require('../utils/logger');

// ─── helpers ────────────────────────────────────────────────────────────────

function handleValidation(req, res) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    res.status(422).json({ errors: errors.array().map((e) => e.msg) });
    return true;
  }
  return false;
}

// ─── validators ─────────────────────────────────────────────────────────────

exports.addMaterialValidators = [
  body('name')
    .isString()
    .trim()
    .notEmpty()
    .withMessage('Nombre requerido')
    .isLength({ max: 200 })
    .withMessage('Nombre demasiado largo'),
  body('totalCost')
    .isFloat({ gt: 0 })
    .withMessage('Costo total debe ser mayor a 0'),
  body('qty')
    .isInt({ gt: 0 })
    .withMessage('Cantidad debe ser un entero mayor a 0'),
];

exports.updateMaterialValidators = [
  param('id').isMongoId().withMessage('ID inválido'),
  body('name')
    .optional()
    .isString()
    .trim()
    .notEmpty()
    .withMessage('Nombre requerido')
    .isLength({ max: 200 })
    .withMessage('Nombre demasiado largo'),
  body('totalCost')
    .optional()
    .isFloat({ gt: 0 })
    .withMessage('Costo total debe ser mayor a 0'),
  body('qty')
    .optional()
    .isInt({ gt: 0 })
    .withMessage('Cantidad debe ser un entero mayor a 0'),
];

exports.deleteValidator = [
  param('id').isMongoId().withMessage('ID inválido'),
];

// ─── controllers ────────────────────────────────────────────────────────────

/**
 * GET /api/materials
 * Retorna todos los materiales del usuario autenticado.
 */
exports.getMaterials = async (req, res, next) => {
  try {
    const materials = await Material.find({ userId: req.user.userId })
      .sort({ createdAt: -1 })
      .lean();
    res.json({ materials });
  } catch (err) {
    next(err);
  }
};

/**
 * POST /api/materials
 * Crea un nuevo material para el usuario autenticado.
 */
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
  } catch (err) {
    next(err);
  }
};

/**
 * PUT /api/materials/:id
 * Actualiza un material existente del usuario autenticado.
 */
exports.updateMaterial = async (req, res, next) => {
  if (handleValidation(req, res)) return;
  try {
    const { name, totalCost, qty } = req.body;

    const material = await Material.findOne({
      _id: req.params.id,
      userId: req.user.userId,
    });

    if (!material) {
      return res.status(404).json({ message: 'Material no encontrado' });
    }

    if (name !== undefined) material.name = String(name).trim();
    if (totalCost !== undefined) material.totalCost = Number(totalCost);
    if (qty !== undefined) material.qty = Number(qty);

    // Recalcular unitPrice si alguno de los valores cambió
    const cost = material.totalCost;
    const quantity = material.qty;
    material.unitPrice = parseFloat((cost / quantity).toFixed(4));

    await material.save();
    res.json({ material });
  } catch (err) {
    next(err);
  }
};

/**
 * DELETE /api/materials/:id
 * Elimina un material del usuario autenticado.
 */
exports.deleteMaterial = async (req, res, next) => {
  if (handleValidation(req, res)) return;
  try {
    const result = await Material.findOneAndDelete({
      _id: req.params.id,
      userId: req.user.userId,
    });

    if (!result) {
      return res.status(404).json({ message: 'Material no encontrado' });
    }

    logger.info(`Material eliminado: ${req.params.id} por usuario ${req.user.userId}`);
    res.json({ message: 'Material eliminado' });
  } catch (err) {
    next(err);
  }
};

/**
 * POST /api/materials/merge
 * Fusiona materiales locales (localStorage) al backend al hacer login.
 * Solo agrega items que no existan ya (por nombre exacto, case-insensitive).
 */
exports.mergeMaterials = async (req, res, next) => {
  try {
    const payload = req.body.materials;
    if (!Array.isArray(payload) || payload.length === 0) {
      return res.status(400).json({ message: 'Se requiere un arreglo de materials' });
    }

    // Limitar cantidad para evitar abuso
    if (payload.length > 200) {
      return res.status(422).json({ message: 'Máximo 200 ítems por merge' });
    }

    // Validar y limpiar cada item
    const candidates = payload
      .map((item) => {
        const name = String(item.name || '').trim();
        const totalCost = Number(item.totalCost);
        const qty = Number(item.qty);
        if (!name || name.length > 200 || totalCost <= 0 || !Number.isInteger(qty) || qty <= 0) {
          return null;
        }
        return {
          name,
          totalCost: parseFloat(totalCost.toFixed(2)),
          qty,
          unitPrice: parseFloat((totalCost / qty).toFixed(4)),
        };
      })
      .filter(Boolean);

    if (candidates.length === 0) {
      return res.status(422).json({ message: 'No hay ítems válidos para fusionar' });
    }

    // Obtener nombres existentes del usuario (evitar duplicados por nombre)
    const existing = await Material.find({ userId: req.user.userId })
      .select('name')
      .lean();
    const existingNames = new Set(existing.map((m) => m.name.toLowerCase()));

    const toInsert = candidates.filter((c) => !existingNames.has(c.name.toLowerCase()));
    if (toInsert.length === 0) {
      return res.json({ added: 0, materialsAdded: [] });
    }

    const docs = toInsert.map((c) => ({ ...c, userId: req.user.userId }));
    const inserted = await Material.insertMany(docs);

    logger.info(`Merge: ${inserted.length} materiales agregados para usuario ${req.user.userId}`);
    res.json({ added: inserted.length, materialsAdded: inserted });
  } catch (err) {
    next(err);
  }
};
