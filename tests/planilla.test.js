const test   = require('node:test');
const assert = require('node:assert/strict');
const { semanaDe, categoriaDe, pizzasPorPack, itemsDePedido, filaPedido, filasItems } = require('../apps-script/planilla-pedidos.js');

test('semana de lunes a domingo, como en la planilla', () => {
  assert.equal(semanaDe('2026-10-30'), '26/10/2026 - 01/11/2026');
  assert.equal(semanaDe('2026-10-26'), '26/10/2026 - 01/11/2026');   // lunes
  assert.equal(semanaDe('2026-11-01'), '26/10/2026 - 01/11/2026');   // domingo
  assert.equal(semanaDe('2026-11-02'), '02/11/2026 - 08/11/2026');
});

test('categorías y pizzas por pack con los nombres de js/data.js', () => {
  assert.equal(categoriaDe('Pizza Muzzarella SIN TACC'), 'Pizza');
  assert.equal(categoriaDe('Empanadas Capresse'), 'Empanada');
  assert.equal(categoriaDe('Tarta Zapallo'), 'Tarta');
  assert.equal(categoriaDe('Milanesas de Peceto 500g'), 'Milanesa');
  assert.equal(categoriaDe('Muzzarella x10'), 'Promo Pizza (bundle)');
  assert.equal(categoriaDe('10 pizzas a elección'), 'Promo Pizza (bundle)');
  assert.equal(pizzasPorPack('Muzzarella x5'), 5);
  assert.equal(pizzasPorPack('10 pizzas a elección'), 10);
  assert.equal(pizzasPorPack('Pizza Provolone'), 0);
});

test('items: usa items_detalle y si no hay, el texto viejo', () => {
  assert.deepEqual(itemsDePedido({ items_detalle: [{ name: 'Pizza Fugazzeta', qty: 2, price: 9200, precio_original: 11500 }] }),
    [{ nombre: 'Pizza Fugazzeta', cantidad: 2, precio: 11500 }]);
  assert.deepEqual(itemsDePedido({ items: 'Pizza Muzzarella x2, Muzzarella x5 x1' }),
    [{ nombre: 'Pizza Muzzarella', cantidad: 2 }, { nombre: 'Muzzarella x5', cantidad: 1 }]);
});

test('fila de Pedidos igual a las cargadas a mano (retiro con cupón)', () => {
  const p = { id: '#EDS-81360', fecha: '2026-10-30', registrado: true, cliente: 'Pedro Lanfranconi', email: 'pedro@mail.com',
    estado: 'Pendiente', zona: 'Retiro en Rincón de Milberg', direccion: 'Retiro en local', total: 95000, envio: 0,
    cupon: 'PEDRO10', descuento: 10625, promo_descuento: 0, promos: null, items_detalle: [{ name: '10 pizzas a elección', qty: 1, price: 106250, precio_original: 106250 }] };
  assert.deepEqual(filaPedido(p, true), ['#EDS-81360', '2026-10-30', '26/10/2026 - 01/11/2026', 'Pedro Lanfranconi', 'Registrado',
    'pedro@mail.com', 'Sí', 'Pendiente', 'Retiro en Rincón de Milberg', 106250, 0, 'PEDRO10', 10625, 95000, 1, '10 pizzas a elección x1']);
});

test('pedido viejo sin precios: subtotal sale del total, con envío y promo', () => {
  const p = { id: '#EDS-1', fecha: '2026-11-05', registrado: false, cliente: 'Ana', email: 'a@a.com', estado: 'Recibido',
    zona: 'Nordelta', direccion: 'Av. Siempre Viva 123', total: 50500, envio: 3500, cupon: null, descuento: 0,
    promo_descuento: 2000, promos: '20% OFF muzzas', items: 'Pizza Muzzarella x3, Muzzarella x5 x2' };
  const f = filaPedido(p, false);
  assert.equal(f[4], 'Invitado');
  assert.equal(f[8], 'Nordelta — Av. Siempre Viva 123');
  assert.deepEqual(f.slice(9, 14), [49000, 3500, '20% OFF muzzas', 2000, 50500]);
  assert.deepEqual(filasItems(p), [
    ['#EDS-1', '2026-11-05', '02/11/2026 - 08/11/2026', 'Recibido', 'Pizza Muzzarella', 'Pizza', 3, 0],
    ['#EDS-1', '2026-11-05', '02/11/2026 - 08/11/2026', 'Recibido', 'Muzzarella x5', 'Promo Pizza (bundle)', 2, 10],
  ]);
});
