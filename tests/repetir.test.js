const test   = require('node:test');
const assert = require('node:assert/strict');
const { parseOrderItems, buildRepeatItems } = require('../js/pedidos.js');

// Productos activos de hoy (las milanesas 28 y 29 están desactivadas en js/data.js)
const activos = [
  { id: 4,  name: 'Pizza Muzzarella',    price: 11000 },
  { id: 22, name: 'Tarta Jamón y queso', price: 11385 },
  { id: 2,  name: 'Muzzarella x10',      price: 93500 },
];

test('pedido viejo: encuentra los productos por nombre y saltea los que no están', () => {
  const items = parseOrderItems({ items: 'Pizza Muzzarella x2, Milanesas de Peceto 500g x1, tarta jamon y queso x3' });
  assert.deepEqual(buildRepeatItems(items, activos), {
    toAdd:   [{ id: 4, qty: 2 }, { id: 22, qty: 3 }],
    skipped: ['Milanesas de Peceto 500g'],
  });
});

test('pedido nuevo: usa el id del producto', () => {
  const items = parseOrderItems({ items_detalle: [
    { id: 2,  name: 'Muzzarella x10', qty: 1, price: 90000 },
    { id: 29, name: 'Milanesas de Pollo 1kg', qty: 2, price: 19000 },
  ] });
  assert.deepEqual(buildRepeatItems(items, activos), { toAdd: [{ id: 2, qty: 1 }], skipped: ['Milanesas de Pollo 1kg'] });
});

test('suma cantidades si el producto aparece dos veces', () => {
  const items = [{ id: 4, name: 'Pizza Muzzarella', qty: 1 }, { id: null, name: 'Pizza Muzzarella', qty: 2 }];
  assert.deepEqual(buildRepeatItems(items, activos).toAdd, [{ id: 4, qty: 3 }]);
});

test('si no queda nada disponible, no agrega nada', () => {
  const items = parseOrderItems({ items: 'Milanesas de Pollo 1kg x1' });
  assert.deepEqual(buildRepeatItems(items, activos), { toAdd: [], skipped: ['Milanesas de Pollo 1kg'] });
});
