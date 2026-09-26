# Calculadora de Costos — Sigma Design

Backend Node.js + MongoDB para gestión de materiales y cálculo de costos de productos.

## Stack

- **Backend:** Node.js, Express 4, Mongoose 7
- **Auth:** JWT (access + refresh tokens rotados, cookies httpOnly)
- **Seguridad:** Helmet, CORS, express-rate-limit, bcrypt (12 rounds), express-validator
- **DB:** MongoDB (colección `users` + colección `materials` separada)
- **Tests:** Jest + Supertest + mongodb-memory-server

## Setup local

```bash
# 1. Instalar dependencias
npm install

# 2. Configurar variables de entorno
cp .env.example .env
# Editar .env con tus valores

# 3. Correr en modo desarrollo
npm run dev

# 4. Correr tests
npm test
```

## Variables de entorno

| Variable              | Descripción                              | Default                                    |
|-----------------------|------------------------------------------|--------------------------------------------|
| `PORT`                | Puerto del servidor                      | `3000`                                     |
| `NODE_ENV`            | Entorno (`development` / `production`)   | `development`                              |
| `MONGODB_URI`         | URI de MongoDB                           | `mongodb://localhost:27017/calculadoracostos` |
| `ACCESS_TOKEN_SECRET` | Secreto para access tokens JWT           | —                                          |
| `REFRESH_TOKEN_SECRET`| Secreto para refresh tokens JWT          | —                                          |
| `FRONTEND_URL`        | Origen permitido por CORS                | `http://localhost:3000`                    |
| `PUBLIC_BASE_URL`     | URL pública del servidor. Se usa para los links absolutos a las fotos en las exportaciones (Tienda Nube / Meta necesitan poder descargarlas) | URL del request |
| `CATALOG_CURRENCY`    | Moneda de los feeds de catálogo          | `ARS`                                      |
| `UPLOAD_DIR`          | Carpeta de imágenes de productos         | `./uploads`                                |
| `TRUST_PROXY`         | Activar detrás de un proxy (Render, Nginx…) | —                                       |

## Endpoints API

### Auth
| Método | Ruta                    | Auth | Descripción                  |
|--------|-------------------------|------|------------------------------|
| POST   | `/api/auth/register`    | No   | Registrar nuevo usuario      |
| POST   | `/api/auth/login`       | No   | Iniciar sesión               |
| POST   | `/api/auth/refresh-token` | No | Renovar access token        |
| POST   | `/api/auth/logout`      | No   | Cerrar sesión                |
| GET    | `/api/auth/me`          | Sí   | Datos del usuario actual     |

### Materiales
| Método | Ruta                    | Auth | Descripción                  |
|--------|-------------------------|------|------------------------------|
| GET    | `/api/materials`        | Sí   | Listar materiales del usuario|
| POST   | `/api/materials`        | Sí   | Agregar material             |
| PUT    | `/api/materials/:id`    | Sí   | Actualizar material          |
| DELETE | `/api/materials/:id`    | Sí   | Eliminar material            |
| POST   | `/api/materials/merge`  | Sí   | Fusionar materiales locales  |

Actualizar un material recalcula en cascada el precio de todos los productos que lo usan.

### Productos / catálogo
El servidor recalcula siempre los precios a partir de los insumos (no confía en totales enviados por el cliente).
La fórmula vive en `src/shared/pricing.js` y la usan tanto el backend como el frontend (`/shared/pricing.js`).

| Método | Ruta                                        | Descripción                                      |
|--------|---------------------------------------------|--------------------------------------------------|
| GET    | `/api/products`                             | Listar productos del catálogo                    |
| POST   | `/api/products`                             | Crear producto (costeo + datos de catálogo)      |
| GET    | `/api/products/:id`                         | Obtener un producto                              |
| PUT    | `/api/products/:id`                         | Recalcular costeo (insumos, %, redondeo)         |
| PATCH  | `/api/products/:id`                         | Datos de catálogo (descripción, categoría, stock, SKU, visibilidad, medidas…) |
| DELETE | `/api/products/:id`                         | Eliminar producto y sus fotos                    |
| POST   | `/api/products/:id/images`                  | Subir fotos (multipart, campo `images`, máx. 8 × 8 MB) |
| PATCH  | `/api/products/:id/images/:imageId/cover`   | Usar la foto como portada                        |
| DELETE | `/api/products/:id/images/:imageId`         | Eliminar foto                                    |
| GET    | `/api/products/export?format=…`             | Exportar catálogo (`onlyPublished=true` opcional) |

Formatos de exportación: `tiendanube` (planilla CSV de importación), `meta` (feed CSV para Instagram/Facebook y Google Merchant; acepta `storeUrl`), `json` (catálogo normalizado) y `tiendanube-api` (payloads listos para `POST /products` de la API de Tienda Nube).

Las fotos se procesan con sharp: se corrige la orientación, se eliminan metadatos (GPS), se genera una principal JPEG de hasta 1600 px (formato aceptado por todas las plataformas) y una miniatura WebP. El almacenamiento está aislado en `src/services/imageStorage.js` para poder migrarlo a S3/Cloudinary.

## Arquitectura

```
src/
├── config/         → Conexión a MongoDB
├── controllers/    → Lógica de negocio (auth, materiales, productos)
├── middlewares/    → Auth JWT, error handler centralizado
├── models/         → Schemas Mongoose (User, Material, Product)
├── routes/         → Express routers
├── services/       → Almacenamiento de imágenes, exportadores de catálogo
├── shared/         → Fórmula de precios (backend + frontend)
├── utils/          → Logger, slugs
├── validators/     → Reglas express-validator
└── public/         → Frontend estático (HTML/CSS/JS vanilla)
test/
├── auth.test.js      → Tests de integración: auth
├── materials.test.js → Tests de integración: materiales
└── products.test.js  → Tests de integración: catálogo, fotos, exportación
```

## Instalar devDependencies para tests

```bash
npm install --save-dev jest supertest mongodb-memory-server
```
