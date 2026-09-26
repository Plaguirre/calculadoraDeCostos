const mongoose = require('mongoose');
const { slugify } = require('../utils/slug');

const insumoUsadoSchema = new mongoose.Schema(
  {
    materialId: { type: mongoose.Schema.Types.ObjectId, ref: 'Material' },
    name:       { type: String, required: true, trim: true },
    unitPrice:  { type: Number, required: true },
    qty:        { type: Number, required: true },
    subtotal:   { type: Number, required: true },
  },
  { _id: false }
);

// La primera imagen del array es la portada
const imageSchema = new mongoose.Schema({
  key:      { type: String, required: true },  // identificador en el storage
  url:      { type: String, required: true },  // imagen principal (JPEG, apta para tiendas)
  thumbUrl: { type: String, required: true },  // miniatura WebP para la UI
  width:    Number,
  height:   Number,
  alt:      { type: String, trim: true, maxlength: 200 },
});

const productSchema = new mongoose.Schema(
  {
    userId:        { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    name:          { type: String, required: true, trim: true, maxlength: 200 },

    // ── Costeo ──────────────────────────────────────────────────────────────
    insumos:       [insumoUsadoSchema],
    costoInsumos:  { type: Number, required: true },
    pctOtros:      { type: Number, default: 0 },
    montOtros:     { type: Number, default: 0 },
    costoTotal:    { type: Number, required: true },
    pctGanancia:   { type: Number, default: 0 },
    ganancia:      { type: Number, default: 0 },
    precioVenta:   { type: Number, required: true },
    pctDescuento:  { type: Number, default: 0 },
    precioFinal:   { type: Number, required: true },
    redondeo:      { type: Number, default: 0 },
    notas:         { type: String, trim: true, maxlength: 500 },

    // ── Catálogo (campos alineados con Tienda Nube / Meta / Google) ─────────
    slug:          { type: String, trim: true, maxlength: 220 },
    description:   { type: String, trim: true, maxlength: 5000, default: '' },
    category:      { type: String, trim: true, maxlength: 100, default: '' },
    tags:          [{ type: String, trim: true, maxlength: 50 }],
    brand:         { type: String, trim: true, maxlength: 100, default: '' },
    sku:           { type: String, trim: true, maxlength: 100, default: '' },
    barcode:       { type: String, trim: true, maxlength: 50, default: '' },
    stock:         { type: Number, min: 0, default: null }, // null = stock ilimitado
    published:     { type: Boolean, default: true },
    images:        { type: [imageSchema], default: [] },
    weightKg:      { type: Number, min: 0, default: null },
    dimensionsCm:  {
      height: { type: Number, min: 0, default: null },
      width:  { type: Number, min: 0, default: null },
      depth:  { type: Number, min: 0, default: null },
    },

    // IDs en plataformas externas, para sincronización futura
    integrations: {
      tiendanube: {
        productId: String,
        variantId: String,
        syncedAt:  Date,
      },
    },
  },
  { timestamps: true }
);

productSchema.index({ userId: 1, createdAt: -1 });
productSchema.index({ userId: 1, slug: 1 });

productSchema.pre('validate', function (next) {
  if (!this.slug) this.slug = slugify(this.name);
  next();
});

module.exports = mongoose.model('Product', productSchema);
