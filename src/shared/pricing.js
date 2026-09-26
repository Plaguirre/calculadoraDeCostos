/**
 * pricing.js — Fórmula de precios compartida entre backend (Node) y frontend
 * (servido en /shared/pricing.js). Única fuente de verdad del cálculo.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.Pricing = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  // Múltiplos permitidos para redondear el precio de venta (0 = sin redondeo)
  var REDONDEOS = [0, 1, 10, 50, 100, 500, 1000];

  function round(n, d) {
    var f = Math.pow(10, d === undefined ? 4 : d);
    return Math.round((Number(n) || 0) * f) / f;
  }

  // Redondea hacia arriba para no perder margen
  function ceilTo(n, step) {
    if (!step) return round(n);
    return Math.ceil(round(n, 6) / step) * step;
  }

  /**
   * @param {{insumos: {unitPrice:number, qty:number}[], pctOtros?:number,
   *          pctGanancia?:number, pctDescuento?:number, redondeo?:number}} input
   */
  function computeTotals(input) {
    var pctOtros     = Number(input.pctOtros)     || 0;
    var pctGanancia  = Number(input.pctGanancia)  || 0;
    var pctDescuento = Number(input.pctDescuento) || 0;
    var redondeo     = REDONDEOS.indexOf(Number(input.redondeo)) >= 0 ? Number(input.redondeo) : 0;

    var insumos = (input.insumos || []).map(function (i) {
      var unitPrice = Number(i.unitPrice) || 0;
      var qty       = Number(i.qty) || 0;
      return Object.assign({}, i, { unitPrice: unitPrice, qty: qty, subtotal: round(unitPrice * qty) });
    });

    var costoInsumos = round(insumos.reduce(function (acc, i) { return acc + i.subtotal; }, 0));
    var montOtros    = round(costoInsumos * pctOtros / 100);
    var costoTotal   = round(costoInsumos + montOtros);
    var precioVenta  = ceilTo(costoTotal * (1 + pctGanancia / 100), redondeo);
    var precioFinal  = pctDescuento > 0
      ? ceilTo(precioVenta * (1 - pctDescuento / 100), redondeo)
      : precioVenta;

    return {
      insumos: insumos,
      costoInsumos: costoInsumos,
      pctOtros: pctOtros,
      montOtros: montOtros,
      costoTotal: costoTotal,
      pctGanancia: pctGanancia,
      // Ganancia real (incluye el efecto del redondeo)
      ganancia: round(precioVenta - costoTotal),
      precioVenta: precioVenta,
      pctDescuento: pctDescuento,
      precioFinal: precioFinal,
      redondeo: redondeo,
    };
  }

  return { computeTotals: computeTotals, round: round, REDONDEOS: REDONDEOS };
});
