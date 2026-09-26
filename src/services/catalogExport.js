/**
 * catalogExport.js — Convierte productos del catálogo a los formatos de
 * importación de plataformas de venta.
 *
 *  - tiendanubeCsv:  planilla de importación masiva de Tienda Nube (separador ";")
 *  - metaCsv:        feed de catálogo de Meta (Instagram / Facebook Shops),
 *                    también aceptado por Google Merchant Center
 *  - json:           catálogo normalizado, para integraciones propias
 *  - tiendanubeApiPayload: cuerpo listo para POST /v1/{store_id}/products
 *                    de la API de Tienda Nube (base de una sincronización directa)
 */
const { slugify } = require('../utils/slug');

const CURRENCY = process.env.CATALOG_CURRENCY || 'ARS';

const money = n => (Number(n) || 0).toFixed(2);
const hasDiscount = p => p.pctDescuento > 0 && p.precioFinal < p.precioVenta;

function absUrl(url, baseUrl) {
  if (!url) return '';
  if (/^https?:\/\//i.test(url)) return url;
  return baseUrl.replace(/\/+$/, '') + url;
}

function csvCell(value, sep) {
  const s = value === null || value === undefined ? '' : String(value);
  return /["\r\n]/.test(s) || s.includes(sep) ? `"${s.replace(/"/g, '""')}"` : s;
}

function toCsv(headers, rows, sep) {
  const lines = [headers, ...rows].map(r => r.map(v => csvCell(v, sep)).join(sep));
  // BOM para que Excel detecte UTF-8 (tildes y ñ)
  return '﻿' + lines.join('\r\n') + '\r\n';
}

// Asegura identificadores de URL únicos dentro de una misma exportación
function withUniqueSlugs(products) {
  const seen = new Map();
  return products.map(p => {
    const base = p.slug || slugify(p.name);
    const n = (seen.get(base) || 0) + 1;
    seen.set(base, n);
    return { ...p, slug: n === 1 ? base : `${base}-${n}` };
  });
}

// ── Tienda Nube: planilla CSV ────────────────────────────────────────────────

const TN_HEADERS = [
  'Identificador de URL', 'Nombre', 'Categorías',
  'Nombre de propiedad 1', 'Valor de propiedad 1',
  'Nombre de propiedad 2', 'Valor de propiedad 2',
  'Nombre de propiedad 3', 'Valor de propiedad 3',
  'Precio', 'Precio promocional', 'Peso (kg)', 'Alto (cm)', 'Ancho (cm)', 'Profundidad (cm)',
  'Stock', 'SKU', 'Código de barras', 'Mostrar en tienda', 'Envío sin cargo',
  'Descripción', 'Tags', 'Título para SEO', 'Descripción para SEO', 'Marca',
  'Producto Físico', 'MPN (Número de pieza del fabricante)', 'Sexo', 'Rango de edad', 'Costo',
];

function tiendanubeCsv(products) {
  const rows = withUniqueSlugs(products).map(p => {
    const d = p.dimensionsCm || {};
    return [
      p.slug, p.name, p.category || '',
      '', '', '', '', '', '',
      money(p.precioVenta), hasDiscount(p) ? money(p.precioFinal) : '',
      p.weightKg ?? '', d.height ?? '', d.width ?? '', d.depth ?? '',
      p.stock ?? '', p.sku || '', p.barcode || '',
      p.published ? 'SI' : 'NO', 'NO',
      p.description || '', (p.tags || []).join(','),
      p.name.slice(0, 70), (p.description || '').slice(0, 320), p.brand || '',
      'SI', '', '', '', money(p.costoTotal),
    ];
  });
  return toCsv(TN_HEADERS, rows, ';');
}

// ── Meta / Google Merchant: feed CSV ─────────────────────────────────────────

const META_HEADERS = [
  'id', 'title', 'description', 'availability', 'condition', 'price', 'sale_price',
  'link', 'image_link', 'additional_image_link', 'brand', 'product_type', 'inventory',
];

function metaCsv(products, { baseUrl, storeUrl }) {
  const rows = withUniqueSlugs(products).map(p => {
    const imgs = (p.images || []).map(i => absUrl(i.url, baseUrl));
    const inStock = p.stock === null || p.stock === undefined || p.stock > 0;
    return [
      p.sku || String(p._id),
      p.name.slice(0, 200),
      p.description || p.name,
      inStock ? 'in stock' : 'out of stock',
      'new',
      `${money(p.precioVenta)} ${CURRENCY}`,
      hasDiscount(p) ? `${money(p.precioFinal)} ${CURRENCY}` : '',
      storeUrl ? `${storeUrl.replace(/\/+$/, '')}/productos/${p.slug}/` : baseUrl,
      imgs[0] || '',
      imgs.slice(1, 10).join(','),
      p.brand || '',
      p.category || '',
      p.stock ?? '',
    ];
  });
  return toCsv(META_HEADERS, rows, ',');
}

// ── Tienda Nube: payload de API ──────────────────────────────────────────────

function tiendanubeApiPayload(p, { baseUrl, lang = 'es' }) {
  const d = p.dimensionsCm || {};
  const variant = {
    price: money(p.precioVenta),
    promotional_price: hasDiscount(p) ? money(p.precioFinal) : null,
    cost: money(p.costoTotal),
    stock_management: p.stock !== null && p.stock !== undefined,
    stock: p.stock ?? null,
    sku: p.sku || null,
    barcode: p.barcode || null,
    weight: p.weightKg ?? null,
    height: d.height ?? null,
    width: d.width ?? null,
    depth: d.depth ?? null,
  };
  return {
    name: { [lang]: p.name },
    description: { [lang]: p.description || '' },
    handle: { [lang]: p.slug || slugify(p.name) },
    published: !!p.published,
    brand: p.brand || null,
    tags: (p.tags || []).join(','),
    images: (p.images || []).map((img, i) => ({ src: absUrl(img.url, baseUrl), position: i + 1 })),
    variants: [variant],
  };
}

// ── JSON normalizado ─────────────────────────────────────────────────────────

function json(products, { baseUrl }) {
  return {
    generatedAt: new Date().toISOString(),
    currency: CURRENCY,
    count: products.length,
    products: withUniqueSlugs(products).map(p => ({
      id: String(p._id),
      slug: p.slug,
      name: p.name,
      description: p.description || '',
      category: p.category || '',
      tags: p.tags || [],
      brand: p.brand || '',
      sku: p.sku || '',
      barcode: p.barcode || '',
      published: !!p.published,
      price: Number(money(p.precioVenta)),
      promotionalPrice: hasDiscount(p) ? Number(money(p.precioFinal)) : null,
      cost: Number(money(p.costoTotal)),
      stock: p.stock ?? null,
      weightKg: p.weightKg ?? null,
      dimensionsCm: p.dimensionsCm || null,
      images: (p.images || []).map(i => ({
        url: absUrl(i.url, baseUrl), thumbnail: absUrl(i.thumbUrl, baseUrl),
        width: i.width, height: i.height, alt: i.alt || p.name,
      })),
      updatedAt: p.updatedAt,
    })),
  };
}

module.exports = { tiendanubeCsv, metaCsv, tiendanubeApiPayload, json, absUrl };
