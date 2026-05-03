/**
 * Tests de integración: Auth routes
 * Requiere: jest, supertest, mongodb-memory-server
 * Instalar: npm install --save-dev jest supertest @shelf/jest-mongodb mongodb-memory-server
 */

const request = require('supertest');
const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');
const app = require('../src/server');

let mongoServer;

beforeAll(async () => {
  mongoServer = await MongoMemoryServer.create();
  const uri = mongoServer.getUri();
  await mongoose.connect(uri);
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongoServer.stop();
});

afterEach(async () => {
  // Limpiar collections entre tests
  const collections = mongoose.connection.collections;
  for (const key in collections) {
    await collections[key].deleteMany({});
  }
});

// ─── Helper ───────────────────────────────────────────────────────────────────

async function registerUser(data = {}) {
  const defaults = {
    name: 'Test User',
    email: 'test@example.com',
    password: 'Password1',
  };
  return request(app).post('/api/auth/register').send({ ...defaults, ...data });
}

// ─── Register ─────────────────────────────────────────────────────────────────

describe('POST /api/auth/register', () => {
  it('debe registrar un usuario válido y retornar accessToken', async () => {
    const res = await registerUser();
    expect(res.status).toBe(201);
    expect(res.body).toHaveProperty('accessToken');
    expect(typeof res.body.accessToken).toBe('string');
  });

  it('debe rechazar si falta el email', async () => {
    const res = await registerUser({ email: undefined });
    expect(res.status).toBe(422);
    expect(res.body).toHaveProperty('errors');
  });

  it('debe rechazar contraseña sin número', async () => {
    const res = await registerUser({ password: 'sinNumero' });
    expect(res.status).toBe(422);
  });

  it('debe rechazar contraseña menor a 8 caracteres', async () => {
    const res = await registerUser({ password: 'Ab1' });
    expect(res.status).toBe(422);
  });

  it('debe rechazar email duplicado con 409', async () => {
    await registerUser();
    const res = await registerUser();
    expect(res.status).toBe(409);
    expect(res.body.message).toMatch(/ya registrado/i);
  });
});

// ─── Login ────────────────────────────────────────────────────────────────────

describe('POST /api/auth/login', () => {
  beforeEach(async () => {
    await registerUser();
  });

  it('debe retornar accessToken con credenciales correctas', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'test@example.com', password: 'Password1' });
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('accessToken');
  });

  it('debe rechazar contraseña incorrecta con 401', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'test@example.com', password: 'wrongpass' });
    expect(res.status).toBe(401);
  });

  it('debe rechazar email inexistente con 401', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'noexiste@example.com', password: 'Password1' });
    expect(res.status).toBe(401);
  });
});

// ─── Me ──────────────────────────────────────────────────────────────────────

describe('GET /api/auth/me', () => {
  it('debe retornar datos del usuario con token válido', async () => {
    const regRes = await registerUser();
    const token = regRes.body.accessToken;

    const res = await request(app)
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.user).toHaveProperty('email', 'test@example.com');
    expect(res.body.user).not.toHaveProperty('password');
    expect(res.body.user).not.toHaveProperty('refreshTokens');
  });

  it('debe rechazar sin token con 401', async () => {
    const res = await request(app).get('/api/auth/me');
    expect(res.status).toBe(401);
  });

  it('debe rechazar token inválido con 401', async () => {
    const res = await request(app)
      .get('/api/auth/me')
      .set('Authorization', 'Bearer tokeninvalido');
    expect(res.status).toBe(401);
  });
});
