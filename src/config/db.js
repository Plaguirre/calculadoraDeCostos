const mongoose = require('mongoose');
const logger = require('../utils/logger');

module.exports = async function connectDB() {
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    logger.error('MONGODB_URI no está configurado en .env');
    process.exit(1);
  }

  try {
    await mongoose.connect(uri);
    logger.info('MongoDB conectado correctamente');
  } catch (err) {
    logger.error(`Error conectando a MongoDB: ${err.message}`);
    process.exit(1);
  }

  mongoose.connection.on('error', (err) => {
    logger.error(`MongoDB error: ${err.message}`);
  });

  mongoose.connection.on('disconnected', () => {
    logger.warn('MongoDB desconectado');
  });
};
