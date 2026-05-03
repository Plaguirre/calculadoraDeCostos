const { body, validationResult } = require('express-validator');

const registerRules = [
  body('name')
    .optional()
    .isString()
    .trim()
    .isLength({ min: 2, max: 100 })
    .withMessage('El nombre debe tener entre 2 y 100 caracteres'),
  body('email')
    .isEmail()
    .withMessage('Email inválido')
    .normalizeEmail(),
  body('password')
    .isLength({ min: 8 })
    .withMessage('La contraseña debe tener al menos 8 caracteres')
    .matches(/\d/)
    .withMessage('La contraseña debe contener al menos un número')
    .matches(/[A-Za-z]/)
    .withMessage('La contraseña debe contener al menos una letra'),
];

const loginRules = [
  body('email').isEmail().withMessage('Email inválido').normalizeEmail(),
  body('password').notEmpty().withMessage('Contraseña requerida'),
];

function validate(req, res, next) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(422).json({ errors: errors.array().map((e) => e.msg) });
  }
  next();
}

module.exports = { registerRules, loginRules, validate };
