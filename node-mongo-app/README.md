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

## Arquitectura

```
src/
├── config/         → Conexión a MongoDB
├── controllers/    → Lógica de negocio (auth, materiales)
├── middlewares/    → Auth JWT, error handler centralizado
├── models/         → Schemas Mongoose (User, Material)
├── routes/         → Express routers
├── utils/          → Logger
├── validators/     → Reglas express-validator
└── public/         → Frontend estático (HTML/CSS/JS vanilla)
test/
├── auth.test.js      → Tests de integración: auth
└── materials.test.js → Tests de integración: materiales
```

## Instalar devDependencies para tests

```bash
npm install --save-dev jest supertest mongodb-memory-server
```
