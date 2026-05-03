require('dotenv').config();
const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const cookieParser = require('cookie-parser');
const path = require('path');

const connectDB = require('./config/db');
const authRoutes = require('./routes/authRoutes');
const materialRoutes = require('./routes/materialRoutes');
const errorHandler = require('./middlewares/errorHandler');
const logger = require('./utils/logger');

const app = express();
const PORT = process.env.PORT || 3000;
const NODE_ENV = process.env.NODE_ENV || 'development';

// ─── Security middlewares ────────────────────────────────────────────────────
app.use(helmet());

// CORS
const allowedOrigins = (process.env.FRONTEND_URL || 'http://localhost:3000')
  .split(',')
  .map((o) => o.trim());

app.use(
  cors({
    origin: (origin, callback) => {
      // Permitir requests sin origin (ej. curl, Postman en dev) solo en desarrollo
      if (!origin && NODE_ENV !== 'production') return callback(null, true);
      if (allowedOrigins.includes(origin)) return callback(null, true);
      callback(new Error(`CORS: origin ${origin} no permitido`));
    },
    credentials: true,
  })
);

// Body parsing
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true, limit: '1mb' }));
app.use(cookieParser());

// Rate limiting global
const globalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 200,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: 'Demasiadas peticiones, intenta más tarde' },
});
app.use(globalLimiter);

// Rate limiting estricto para auth
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: 'Demasiados intentos de autenticación' },
});

// ─── Database ────────────────────────────────────────────────────────────────
connectDB();

// ─── API Routes ──────────────────────────────────────────────────────────────
app.use('/api/auth', authLimiter, authRoutes);
app.use('/api/materials', materialRoutes);

// ─── Static frontend ─────────────────────────────────────────────────────────
app.use(express.static(path.join(__dirname, 'public')));

// SPA fallback — cualquier ruta no-api sirve index.html
app.get(/^(?!\/api).*/, (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// ─── Error handler ───────────────────────────────────────────────────────────
app.use(errorHandler);

// ─── Start ───────────────────────────────────────────────────────────────────
app.listen(PORT, () => {
  logger.info(`Servidor corriendo en http://localhost:${PORT} [${NODE_ENV}]`);
});

module.exports = app; // para tests
