/**
 * Tests de integración: Products (catálogo, imágenes, exportación)
 */
const os   = require('os');
const path = require('path');
const fs   = require('fs');

process.env.UPLOAD_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'calc-uploads-'));
process.env.PUBLIC_BASE_URL = 'https://mi-negocio.test';

const request = require('supertest');
const mongoose = require('mongoose');
const sharp = require('sharp');
const { MongoMemoryServer } = require('mongodb-memory-server');
const app = require('../src/server');

let mongoServer;
let accessToken;
let png;

beforeAll(async () => {
  mongoServer = await MongoMemoryServer.create();
  await mongoose.connect(mongoServer.getUri());
  png = await sharp({ create: { width: 2400, height: 1200, channels: 3, background: '#b741a1' } }).png().toBuffer();
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongoServer.stop();
  fs.rmSync(process.env.UPLOAD_DIR, { recursive: true, force: true });
});

beforeEach(async () => {
  for (const key in mongoose.connection.collections) {
    await mongoose.connection.collections[key].deleteMany({});
  }
  const res = await request(app).post('/api/auth/register').send({
    name: 'Test', email: 'prod@example.com', password: 'Password1',
  });
  accessToken = res.body.accessToken;
});

const auth = () => ({ Authorization: `Bearer ${accessToken}` });

async function crearMaterial(name = 'Harina', totalCost = 1000, qty = 10) {
  const res = await request(app).post('/api/materials').set(auth()).send({ name, totalCost, qty });
  return res.body.material;
}

async function crearProducto(extra = {}) {
  const mat = await crearMaterial();
  const res = await request(app).post('/api/products').set(auth()).send({
    name: 'Torta de chocolate',
    insumos: [{ materialId: mat._id, name: mat.name, unitPrice: mat.unitPrice, qty: 3 }],
    pctOtros: 10, pctGanancia: 50,
    ...extra,
  });
  return { mat, res };
}

describe('POST /api/products', () => {
  it('recalcula precios en el servidor usando el precio real del insumo', async () => {
    const mat = await crearMaterial(); // $100 por unidad
    const res = await request(app).post('/api/products').set(auth()).send({
      name: 'Torta',
      insumos: [{ materialId: mat._id, name: 'x', unitPrice: 0.01, qty: 3 }], // precio manipulado
      pctOtros: 10, pctGanancia: 50, pctDescuento: 10,
    });
    expect(res.status).toBe(201);
    const p = res.body.product;
    expect(p.insumos[0].unitPrice).toBe(100);
    expect(p.costoInsumos).toBe(300);
    expect(p.costoTotal).toBe(330);
    expect(p.precioVenta).toBe(495);
    expect(p.precioFinal).toBe(445.5);
    expect(p.slug).toBe('torta');
    expect(p.published).toBe(true);
  });

  it('aplica redondeo hacia arriba', async () => {
    const { res } = await crearProducto({ redondeo: 100 });
    expect(res.body.product.precioVenta).toBe(500);
    expect(res.body.product.ganancia).toBe(170);
  });

  it('rechaza producto sin insumos', async () => {
    const res = await request(app).post('/api/products').set(auth()).send({ name: 'X', insumos: [] });
    expect(res.status).toBe(422);
  });
});

describe('PUT / PATCH /api/products/:id', () => {
  it('PUT recalcula el costeo', async () => {
    const { mat, res } = await crearProducto();
    const id = res.body.product._id;
    const upd = await request(app).put(`/api/products/${id}`).set(auth()).send({
      name: 'Torta grande',
      insumos: [{ materialId: mat._id, name: mat.name, unitPrice: mat.unitPrice, qty: 6 }],
      pctOtros: 0, pctGanancia: 100,
    });
    expect(upd.status).toBe(200);
    expect(upd.body.product.name).toBe('Torta grande');
    expect(upd.body.product.precioVenta).toBe(1200);
  });

  it('PATCH actualiza datos de catálogo sin tocar precios', async () => {
    const { res } = await crearProducto();
    const id = res.body.product._id;
    const upd = await request(app).patch(`/api/products/${id}`).set(auth()).send({
      description: 'Húmeda, con ganache', category: 'Tortas', tags: ['chocolate', 'chocolate', ' cumple '],
      stock: 4, published: false, sku: 'TOR-01',
    });
    expect(upd.status).toBe(200);
    expect(upd.body.product.tags).toEqual(['chocolate', 'cumple']);
    expect(upd.body.product.stock).toBe(4);
    expect(upd.body.product.published).toBe(false);
    expect(upd.body.product.precioVenta).toBe(res.body.product.precioVenta);
  });

  it('retorna 422 con id inválido', async () => {
    const r = await request(app).get('/api/products/no-es-un-id').set(auth());
    expect(r.status).toBe(422);
  });
});

describe('Cascada de insumos', () => {
  it('actualizar un insumo recalcula el producto respetando redondeo', async () => {
    const { mat, res } = await crearProducto({ redondeo: 10 });
    await request(app).put(`/api/materials/${mat._id}`).set(auth()).send({ totalCost: 2000 });
    const p = (await request(app).get(`/api/products/${res.body.product._id}`).set(auth())).body.product;
    expect(p.costoInsumos).toBe(600);
    expect(p.precioVenta).toBe(990);
  });
});

describe('Imágenes', () => {
  it('sube, redimensiona, cambia portada y borra', async () => {
    const { res } = await crearProducto();
    const id = res.body.product._id;

    const up = await request(app).post(`/api/products/${id}/images`).set(auth())
      .attach('images', png, 'a.png').attach('images', png, 'b.png');
    expect(up.status).toBe(201);
    const imgs = up.body.product.images;
    expect(imgs).toHaveLength(2);
    expect(imgs[0].width).toBe(1600);
    expect(imgs[0].url).toMatch(/^\/uploads\/products\/.+\.jpg$/);

    const file = await request(app).get(imgs[0].url);
    expect(file.status).toBe(200);
    expect(file.headers['content-type']).toBe('image/jpeg');

    const cover = await request(app).patch(`/api/products/${id}/images/${imgs[1]._id}/cover`).set(auth());
    expect(cover.body.product.images[0]._id).toBe(imgs[1]._id);

    const del = await request(app).delete(`/api/products/${id}/images/${imgs[0]._id}`).set(auth());
    expect(del.body.product.images).toHaveLength(1);
    expect((await request(app).get(imgs[0].url)).status).toBe(404);
  });

  it('rechaza archivos que no son imágenes', async () => {
    const { res } = await crearProducto();
    const up = await request(app).post(`/api/products/${res.body.product._id}/images`).set(auth())
      .attach('images', Buffer.from('no soy una imagen'), { filename: 'x.png', contentType: 'image/png' });
    expect(up.status).toBe(422);
  });

  it('borrar el producto borra sus imágenes', async () => {
    const { res } = await crearProducto();
    const id = res.body.product._id;
    const up = await request(app).post(`/api/products/${id}/images`).set(auth()).attach('images', png, 'a.png');
    await request(app).delete(`/api/products/${id}`).set(auth());
    expect((await request(app).get(up.body.product.images[0].url)).status).toBe(404);
  });
});

describe('Imágenes guardadas en MongoDB (IMAGE_STORAGE=gridfs)', () => {
  beforeAll(() => { process.env.IMAGE_STORAGE = 'gridfs'; });
  afterAll(() => { delete process.env.IMAGE_STORAGE; });

  it('sube, sirve y borra imágenes desde la base', async () => {
    const { res } = await crearProducto();
    const id = res.body.product._id;
    const up = await request(app).post(`/api/products/${id}/images`).set(auth()).attach('images', png, 'a.png');
    expect(up.status).toBe(201);
    const img = up.body.product.images[0];

    const file = await request(app).get(img.url);
    expect(file.status).toBe(200);
    expect(file.headers['content-type']).toBe('image/jpeg');
    expect(file.headers['cache-control']).toMatch(/immutable/);
    expect((await request(app).get(img.thumbUrl)).headers['content-type']).toBe('image/webp');

    await request(app).delete(`/api/products/${id}`).set(auth());
    expect((await request(app).get(img.url)).status).toBe(404);
    expect(await mongoose.connection.db.collection('images.files').countDocuments()).toBe(0);
  });

  it('rechaza rutas manipuladas', async () => {
    expect((await request(app).get('/uploads/../../.env')).status).toBe(404);
  });
});

describe('GET /api/products/export', () => {
  it('exporta CSV para Tienda Nube', async () => {
    const { res } = await crearProducto({ pctDescuento: 10 });
    await request(app).patch(`/api/products/${res.body.product._id}`).set(auth())
      .send({ description: 'Rica; muy "húmeda"', stock: 3 });
    const r = await request(app).get('/api/products/export?format=tiendanube').set(auth());
    expect(r.status).toBe(200);
    expect(r.headers['content-disposition']).toMatch(/catalogo-tiendanube-.*\.csv/);
    const [header, row] = r.text.replace('﻿', '').trim().split('\r\n');
    expect(header.split(';')[0]).toBe('Identificador de URL');
    expect(row).toContain('torta-de-chocolate;Torta de chocolate');
    expect(row).toContain(';495.00;445.50;');
    expect(row).toContain('"Rica; muy ""húmeda"""');
  });

  it('JSON usa URLs absolutas de imágenes y filtra publicados', async () => {
    const { res } = await crearProducto();
    const id = res.body.product._id;
    await request(app).post(`/api/products/${id}/images`).set(auth()).attach('images', png, 'a.png');
    const r = await request(app).get('/api/products/export?format=json').set(auth());
    expect(JSON.parse(r.text).products[0].images[0].url).toMatch(/^https:\/\/mi-negocio\.test\/uploads\//);

    await request(app).patch(`/api/products/${id}`).set(auth()).send({ published: false });
    const r2 = await request(app).get('/api/products/export?format=json&onlyPublished=true').set(auth());
    expect(JSON.parse(r2.text).count).toBe(0);
  });

  it('payload de API de Tienda Nube incluye costo y precio promocional', async () => {
    await crearProducto({ pctDescuento: 10 });
    const r = await request(app).get('/api/products/export?format=tiendanube-api').set(auth());
    const [p] = JSON.parse(r.text);
    expect(p.name.es).toBe('Torta de chocolate');
    expect(p.variants[0]).toMatchObject({ price: '495.00', promotional_price: '445.50', cost: '330.00' });
  });

  it('rechaza formato desconocido', async () => {
    const r = await request(app).get('/api/products/export?format=xls').set(auth());
    expect(r.status).toBe(422);
  });
});
