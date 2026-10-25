const test   = require('node:test');
const assert = require('node:assert/strict');
const { statusLabel, statusClass, parseOrderItems, escapeHtml } = require('../js/pedidos.js');

test('los pedidos viejos "Pendiente" se muestran como "Recibido"', () => {
  assert.equal(statusLabel('Pendiente'), 'Recibido');
  assert.equal(statusLabel(null), 'Recibido');
  assert.equal(statusLabel('En camino'), 'En camino');
  assert.equal(statusClass('Pendiente'), 'status-pending');
  assert.equal(statusClass('En preparación'), 'status-processing');
  assert.equal(statusClass('Entregado'), 'status-delivered');
  assert.equal(statusClass('Cancelado'), 'status-cancelled');
});

test('lee los productos de un pedido viejo (texto)', () => {
  const items = parseOrderItems({ items: 'Pizza Muzzarella x2, Muzzarella x10 x1, Tarta Zapallo' });
  assert.deepEqual(items, [
    { id: null, name: 'Pizza Muzzarella', qty: 2,  price: null, precio_original: null, promo: null },
    { id: null, name: 'Muzzarella x10',   qty: 1,  price: null, precio_original: null, promo: null },
    { id: null, name: 'Tarta Zapallo',    qty: 1,  price: null, precio_original: null, promo: null },
  ]);
});

test('lee los productos de un pedido nuevo (detalle con precio)', () => {
  const items = parseOrderItems({
    items: 'Pizza Muzzarella x2',
    items_detalle: [{ id: 4, name: 'Pizza Muzzarella', qty: 2, price: 11000 }],
  });
  assert.deepEqual(items, [{ id: 4, name: 'Pizza Muzzarella', qty: 2, price: 11000, precio_original: null, promo: null }]);
});

test('lee el precio sin promo y la promo de un pedido con promo', () => {
  const items = parseOrderItems({
    items_detalle: [{ id: 12, name: 'Pizza Cebolla y roquefort', qty: 2, price: 10000, precio_original: 12500, promo: 'Semana del roque 20% OFF' }],
  });
  assert.deepEqual(items, [{ id: 12, name: 'Pizza Cebolla y roquefort', qty: 2, price: 10000, precio_original: 12500, promo: 'Semana del roque 20% OFF' }]);
});

test('pedido sin productos devuelve lista vacía', () => {
  assert.deepEqual(parseOrderItems({ items: '' }), []);
  assert.deepEqual(parseOrderItems(null), []);
});

test('escapeHtml evita que un texto rompa la página', () => {
  assert.equal(escapeHtml('<b>"Casa" & \'Depto\'</b>'), '&lt;b&gt;&quot;Casa&quot; &amp; &#39;Depto&#39;&lt;/b&gt;');
});
