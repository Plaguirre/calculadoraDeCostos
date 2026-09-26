require('dotenv').config();
const express    = require('express');
const helmet     = require('helmet');
const cors       = require('cors');
const compression = require('compression');
const rateLimit  = require('express-rate-limit');
const cookieParser = require('cookie-parser');
const path       = require('path');

const connectDB       = require('./config/db');
const authRoutes      = require('./routes/authRoutes');
const materialRoutes  = require('./routes/materialRoutes');
const productRoutes   = require('./routes/productRoutes');
const errorHandler    = require('./middlewares/errorHandler');
const imageStorage    = require('./services/imageStorage');
const logger          = require('./utils/logger');

const app     = express();
const PORT    = process.env.PORT || 3000;
const NODE_ENV = process.env.NODE_ENV || 'development';

if (process.env.TRUST_PROXY) app.set('trust proxy', 1);

// ── Security ──────────────────────────────────────────────────────────────────
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      // blob: para previsualizar fotos antes de subirlas
      'img-src': ["'self'", 'data:', 'blob:'],
    },
  },
}));
app.use(compression());

// ── Static (antes del rate limit: no debe consumir cupo de la API) ───────────
app.use(express.static(path.join(__dirname, 'public'), { maxAge: NODE_ENV === 'production' ? '1h' : 0 }));
app.use('/shared', express.static(path.join(__dirname, 'shared')));
app.use('/sources', express.static(path.join(__dirname, '../sources')));

// Imágenes de productos (disco o MongoDB según IMAGE_STORAGE)
app.use(imageStorage.PUBLIC_PREFIX, imageStorage.serve);

// ── API ───────────────────────────────────────────────────────────────────────
// En Render, RENDER_EXTERNAL_URL tiene la URL pública del servicio
const allowedOrigins = (process.env.FRONTEND_URL || process.env.RENDER_EXTERNAL_URL || 'http://localhost:3000')
  .split(',').map(o => o.trim());

const api = express.Router();

api.use(cors({
  origin: (origin, cb) => {
    if (!origin && NODE_ENV !== 'production') return cb(null, true);
    if (!origin || allowedOrigins.includes(origin)) return cb(null, true);
    cb(new Error(`CORS: origin ${origin} no permitido`));
  },
  credentials: true,
}));

api.use(express.json({ limit: '1mb' }));
api.use(express.urlencoded({ extended: true, limit: '1mb' }));
api.use(cookieParser());

api.use(rateLimit({
  windowMs: 15 * 60 * 1000, max: 600,
  standardHeaders: true, legacyHeaders: false,
  message: { message: 'Demasiadas peticiones' },
}));

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, max: 20,
  standardHeaders: true, legacyHeaders: false,
  message: { message: 'Demasiados intentos de autenticación' },
});

// Solo login/registro: /me y /refresh-token se llaman en cada carga de página
api.use(['/auth/login', '/auth/register'], authLimiter);
api.use('/auth',      authRoutes);
api.use('/materials', materialRoutes);
api.use('/products',  productRoutes);
api.use((req, res) => res.status(404).json({ message: 'Ruta no encontrada' }));

app.use('/api', api);

app.get(/^(?!\/api).*/, (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.use(errorHandler);

// Solo conectar y escuchar al ejecutar directamente (los tests importan `app`)
if (require.main === module) {
  connectDB();
  app.listen(PORT, () => {
    logger.info(`Servidor corriendo en http://localhost:${PORT} [${NODE_ENV}]`);
  });
}

module.exports = app;
