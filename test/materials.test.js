/**
 * Tests de integración: Materials routes
 */

const request = require('supertest');
const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');
const app = require('../src/server');

let mongoServer;
let accessToken;

beforeAll(async () => {
  mongoServer = await MongoMemoryServer.create();
  await mongoose.connect(mongoServer.getUri());
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongoServer.stop();
});

beforeEach(async () => {
  // Limpiar y crear usuario fresco
  const collections = mongoose.connection.collections;
  for (const key in collections) {
    await collections[key].deleteMany({});
  }
  const res = await request(app).post('/api/auth/register').send({
    name: 'Test',
    email: 'mat@example.com',
    password: 'Password1',
  });
  accessToken = res.body.accessToken;
});

function auth() {
  return { Authorization: `Bearer ${accessToken}` };
}

// ─── GET /api/materials ───────────────────────────────────────────────────────

describe('GET /api/materials', () => {
  it('retorna array vacío si no hay materiales', async () => {
    const res = await request(app).get('/api/materials').set(auth());
    expect(res.status).toBe(200);
    expect(res.body.materials).toEqual([]);
  });

  it('requiere autenticación', async () => {
    const res = await request(app).get('/api/materials');
    expect(res.status).toBe(401);
  });
});

// ─── POST /api/materials ──────────────────────────────────────────────────────

describe('POST /api/materials', () => {
  it('crea un material y calcula unitPrice correctamente', async () => {
    const res = await request(app)
      .post('/api/materials')
      .set(auth())
      .send({ name: 'Hojas A5', totalCost: 1000, qty: 100 });

    expect(res.status).toBe(201);
    expect(res.body.material).toMatchObject({
      name: 'Hojas A5',
      totalCost: 1000,
      qty: 100,
      unitPrice: 10,
    });
    expect(res.body.material).toHaveProperty('_id');
  });

  it('rechaza qty 0 con 422', async () => {
    const res = await request(app)
      .post('/api/materials')
      .set(auth())
      .send({ name: 'Test', totalCost: 100, qty: 0 });
    expect(res.status).toBe(422);
  });

  it('rechaza totalCost negativo', async () => {
    const res = await request(app)
      .post('/api/materials')
      .set(auth())
      .send({ name: 'Test', totalCost: -50, qty: 10 });
    expect(res.status).toBe(422);
  });

  it('rechaza nombre vacío', async () => {
    const res = await request(app)
      .post('/api/materials')
      .set(auth())
      .send({ name: '', totalCost: 100, qty: 10 });
    expect(res.status).toBe(422);
  });
});

// ─── PUT /api/materials/:id ───────────────────────────────────────────────────

describe('PUT /api/materials/:id', () => {
  it('actualiza nombre y recalcula unitPrice', async () => {
    const create = await request(app)
      .post('/api/materials')
      .set(auth())
      .send({ name: 'Original', totalCost: 500, qty: 50 });
    const id = create.body.material._id;

    const res = await request(app)
      .put(`/api/materials/${id}`)
      .set(auth())
      .send({ name: 'Actualizado', totalCost: 1000, qty: 100 });

    expect(res.status).toBe(200);
    expect(res.body.material.name).toBe('Actualizado');
    expect(res.body.material.unitPrice).toBe(10);
  });

  it('retorna 404 si el material no pertenece al usuario', async () => {
    // Crear material con otro usuario
    const other = await request(app).post('/api/auth/register').send({
      email: 'other@example.com', password: 'Password2',
    });
    const otherToken = other.body.accessToken;
    const mat = await request(app)
      .post('/api/materials')
      .set('Authorization', `Bearer ${otherToken}`)
      .send({ name: 'Ajeno', totalCost: 100, qty: 10 });

    const res = await request(app)
      .put(`/api/materials/${mat.body.material._id}`)
      .set(auth())
      .send({ name: 'Robado' });
    expect(res.status).toBe(404);
  });
});

// ─── DELETE /api/materials/:id ────────────────────────────────────────────────

describe('DELETE /api/materials/:id', () => {
  it('elimina el material del usuario', async () => {
    const create = await request(app)
      .post('/api/materials')
      .set(auth())
      .send({ name: 'Para eliminar', totalCost: 200, qty: 20 });
    const id = create.body.material._id;

    const del = await request(app).delete(`/api/materials/${id}`).set(auth());
    expect(del.status).toBe(200);

    const list = await request(app).get('/api/materials').set(auth());
    expect(list.body.materials).toHaveLength(0);
  });

  it('retorna 422 si el id no es un MongoId válido', async () => {
    const res = await request(app).delete('/api/materials/no-es-id').set(auth());
    expect(res.status).toBe(422);
  });
});

// ─── POST /api/materials/merge ────────────────────────────────────────────────

describe('POST /api/materials/merge', () => {
  it('inserta materiales locales evitando duplicados por nombre', async () => {
    // Primero agregar uno
    await request(app)
      .post('/api/materials')
      .set(auth())
      .send({ name: 'Existente', totalCost: 100, qty: 10 });

    const res = await request(app)
      .post('/api/materials/merge')
      .set(auth())
      .send({
        materials: [
          { name: 'Existente', totalCost: 100, qty: 10, unitPrice: 10 },
          { name: 'Nuevo',     totalCost: 200, qty: 20, unitPrice: 10 },
        ],
      });

    expect(res.status).toBe(200);
    expect(res.body.added).toBe(1); // solo "Nuevo"
    expect(res.body.materialsAdded[0].name).toBe('Nuevo');
  });

  it('rechaza array vacío', async () => {
    const res = await request(app)
      .post('/api/materials/merge')
      .set(auth())
      .send({ materials: [] });
    expect(res.status).toBe(400);
  });
});
