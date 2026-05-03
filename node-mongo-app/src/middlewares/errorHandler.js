const logger = require('../utils/logger');

// eslint-disable-next-line no-unused-vars
module.exports = (err, req, res, next) => {
  const status = err.status || err.statusCode || 500;
  const message = status < 500 ? err.message : 'Error interno del servidor';

  // Log completo solo en errores de servidor
  if (status >= 500) {
    logger.error(`[${req.method}] ${req.path} → ${err.message}\n${err.stack}`);
  }

  res.status(status).json({ message });
};
