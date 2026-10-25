const test   = require('node:test');
const assert = require('node:assert/strict');
const {
  argentinaHoy, promoEstado, precioConPromo, mejorPromoProducto, textoDias,
  cuponDesdeFijo, calcularCarrito, validarPromo,
} = require('../js/promos.js');

const muzza  = { id: 4,  cat: 'PIZZAS',  price: 11000 };
const roque  = { id: 12, cat: 'PIZZAS',  price: 12500 };
const tarta  = { id: 22, cat: 'TARTAS',  price: 11385 };
const miercoles = { fecha: '2026-10-28', dia: 3 };

const promo = (x) => ({ codigo: null, tipo: 'porcentaje', valor: 20, aplica: 'productos', productos: [], categoria: '', dias: [], minimo: 0, pausada: false, ...x });

test('hora de Argentina: a las 01:00 UTC del jueves en Argentina todavía es miércoles', () => {
  assert.deepEqual(argentinaHoy(new Date('2026-10-29T01:00:00Z')), { fecha: '2026-10-28', dia: 3 });
  assert.deepEqual(argentinaHoy(new Date('2026-10-29T03:00:00Z')), { fecha: '2026-10-29', dia: 4 });
});

test('estado según fechas, días y pausa (el "hasta" incluye el día completo)', () => {
  assert.equal(promoEstado(promo({ desde: '2026-10-28', hasta: '2026-10-28' }), miercoles), 'Activa');
  assert.equal(promoEstado(promo({ desde: '2026-10-29' }), miercoles), 'Programada');
  assert.equal(promoEstado(promo({ hasta: '2026-10-27' }), miercoles), 'Vencida');
  assert.equal(promoEstado(promo({ dias: [3] }), miercoles), 'Activa');
  assert.equal(promoEstado(promo({ dias: [5, 6] }), miercoles), 'Hoy no');
  assert.equal(promoEstado(promo({ pausada: true }), miercoles), 'Pausada');
});

test('precio con promo: porcentaje, monto fijo y precio especial', () => {
  assert.equal(precioConPromo(11000, promo({ tipo: 'porcentaje', valor: 20 })), 8800);
  assert.equal(precioConPromo(11000, promo({ tipo: 'monto', valor: 2000 })), 9000);
  assert.equal(precioConPromo(11000, promo({ tipo: 'monto', valor: 50000 })), 0);
  assert.equal(precioConPromo(11000, promo({ tipo: 'precio', valor: 9500 })), 9500);
  assert.equal(precioConPromo(11000, promo({ tipo: 'precio', valor: 15000 })), 11000, 'un precio especial más caro no sube el precio');
});

test('si hay varias promos para un producto gana la más barata para el cliente', () => {
  const promos = [
    promo({ id: 'a', aplica: 'categoria', categoria: 'PIZZAS', valor: 10 }),
    promo({ id: 'b', aplica: 'productos', productos: [4], tipo: 'precio', valor: 8000 }),
    promo({ id: 'c', aplica: 'productos', productos: [4], valor: 20 }),
  ];
  assert.equal(mejorPromoProducto(muzza, promos, miercoles).promo.id, 'b');
  assert.equal(mejorPromoProducto(roque, promos, miercoles).promo.id, 'a');
  assert.equal(mejorPromoProducto(tarta, promos, miercoles), null);
});

test('las promos con código (cupones) no se aplican solas', () => {
  assert.equal(mejorPromoProducto(muzza, [promo({ productos: [4], codigo: 'MAMA20' })], miercoles), null);
});

test('carrito: promo de producto con precio tachado y total', () => {
  const r = calcularCarrito([{ ...roque, qty: 2 }, { ...tarta, qty: 1 }], [promo({ productos: [12], texto: 'Semana del roque 20% OFF' })], null, miercoles);
  assert.equal(r.items[0].precioOriginal, 12500);
  assert.equal(r.items[0].precio, 10000);
  assert.equal(r.items[1].promo, null);
  assert.equal(r.subtotalOriginal, 36385);
  assert.equal(r.subtotal, 31385);
  assert.equal(r.descuentoPromos, 5000);
  assert.deepEqual(r.promosAplicadas, ['Semana del roque 20% OFF']);
  assert.equal(r.totalSinEnvio, 31385);
});

test('mínimo de compra: se mide con el subtotal sin promos', () => {
  const p = [promo({ productos: [4], minimo: 30000 })];
  assert.equal(calcularCarrito([{ ...muzza, qty: 2 }], p, null, miercoles).descuentoPromos, 0);
  assert.equal(calcularCarrito([{ ...muzza, qty: 3 }], p, null, miercoles).descuentoPromos, 6600);
});

test('promo de todo el pedido vs. promos de producto: va la que más descuenta, nunca las dos', () => {
  const productos = promo({ productos: [4], valor: 50, texto: 'Muzza a mitad de precio' });
  const pedido    = promo({ aplica: 'pedido', valor: 10, texto: '10% OFF en todo' });
  const cart1 = [{ ...muzza, qty: 1 }, { ...tarta, qty: 1 }];
  const r1 = calcularCarrito(cart1, [productos, pedido], null, miercoles);
  assert.equal(r1.descuentoPromos, 5500);
  assert.equal(r1.promoPedido, null);

  const cart2 = [{ ...muzza, qty: 1 }, { ...tarta, qty: 10 }];
  const r2 = calcularCarrito(cart2, [productos, pedido], null, miercoles);
  assert.equal(r2.promoPedido.texto, '10% OFF en todo');
  assert.equal(r2.descuentoPromos, Math.round((11000 + 113850) * 0.1));
  assert.ok(r2.items.every(i => i.precio === i.precioOriginal && !i.promo));
  assert.deepEqual(r2.promosAplicadas, ['10% OFF en todo']);
});

test('cupón de todo el pedido va encima de la promo', () => {
  const mama20 = promo({ codigo: 'MAMA20', aplica: 'pedido', valor: 20, desde: '2026-10-17', hasta: '2026-10-31' });
  const r = calcularCarrito([{ ...roque, qty: 2 }], [promo({ productos: [12], valor: 20 })], mama20, miercoles);
  assert.equal(r.subtotal, 20000);
  assert.deepEqual(r.cupon, { descuento: 4000, motivo: '' });
  assert.equal(r.totalSinEnvio, 16000);
});

test('cupón de categoría solo descuenta esos productos', () => {
  const cupon = promo({ codigo: 'TARTAS15', aplica: 'categoria', categoria: 'TARTAS', valor: 15 });
  const r = calcularCarrito([{ ...muzza, qty: 1 }, { ...tarta, qty: 2 }], [], cupon, miercoles);
  assert.equal(r.cupon.descuento, Math.round(11385 * 0.15) * 2);
  const sinTartas = calcularCarrito([{ ...muzza, qty: 1 }], [], cupon, miercoles);
  assert.equal(sinTartas.cupon.descuento, 0);
  assert.equal(sinTartas.cupon.motivo, 'Este cupón no aplica a los productos del carrito');
});

test('cupón fuera de fecha, de día o sin el mínimo no descuenta y dice por qué', () => {
  const cart = [{ ...muzza, qty: 1 }];
  assert.equal(calcularCarrito(cart, [], promo({ codigo: 'X', aplica: 'pedido', hasta: '2026-10-01' }), miercoles).cupon.motivo, 'Este cupón ya venció');
  assert.equal(calcularCarrito(cart, [], promo({ codigo: 'X', aplica: 'pedido', desde: '2026-11-02' }), miercoles).cupon.motivo, 'Este cupón vale desde el 2/11/2026');
  assert.equal(calcularCarrito(cart, [], promo({ codigo: 'X', aplica: 'pedido', dias: [5, 6] }), miercoles).cupon.motivo, 'Este cupón vale solo los viernes y sábado');
  assert.equal(calcularCarrito(cart, [], promo({ codigo: 'X', aplica: 'pedido', minimo: 50000 }), miercoles).cupon.motivo, 'Este cupón vale en compras desde $50.000');
});

test('los cupones fijos de siempre (EDS10) siguen dando 10% del pedido', () => {
  const r = calcularCarrito([{ ...muzza, qty: 2 }], [], cuponDesdeFijo('EDS10', 0.10), miercoles);
  assert.equal(r.cupon.descuento, 2200);
});

test('nombres de los días', () => {
  assert.equal(textoDias([]), 'todos los días');
  assert.equal(textoDias([3]), 'miércoles');
  assert.equal(textoDias([6, 0, 5]), 'domingo, viernes y sábado');
});

test('validación del formulario del panel', () => {
  const ok = { nombre: 'Día de la madre', tipo: 'porcentaje', valor: 20, aplica: 'pedido', productos: [], codigo: 'MAMA20' };
  assert.equal(validarPromo(ok), '');
  assert.equal(validarPromo({ ...ok, nombre: ' ' }), 'Poné un nombre');
  assert.equal(validarPromo({ ...ok, valor: 120 }), 'El porcentaje no puede pasar de 100');
  assert.equal(validarPromo({ ...ok, tipo: 'precio' }), 'El precio especial es para productos o categorías, no para todo el pedido');
  assert.equal(validarPromo({ ...ok, aplica: 'productos' }), 'Elegí al menos un producto');
  assert.equal(validarPromo({ ...ok, desde: '2026-10-20', hasta: '2026-10-10' }), 'La fecha "hasta" es anterior a "desde"');
  assert.equal(validarPromo({ ...ok, codigo: 'MAMA 20' }), 'El código tiene que tener de 3 a 20 letras o números, sin espacios');
});
