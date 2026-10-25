// ============================================================
// PROMOCIONES — cálculo de descuentos sin pantalla (se prueba con `npm test`)
// Las promos se cargan desde el panel admin (tabla promociones en Supabase, ver supabase/promociones.sql).
// Sin código = se aplica sola. Con código = cupón que el cliente escribe en el carrito.
// Los precios de js/data.js no se tocan: la promo se calcula encima.
// ============================================================

const DIAS_SEMANA = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];

// Fecha (AAAA-MM-DD) y día de la semana (0 = domingo) en Argentina: UTC-3 todo el año, sin horario de verano
function argentinaHoy(date = new Date()) {
  const d = new Date(date.getTime() - 3 * 60 * 60 * 1000);
  return { fecha: d.toISOString().slice(0, 10), dia: d.getUTCDay() };
}

// 'Pausada' | 'Programada' (todavía no empezó) | 'Vencida' | 'Hoy no' (no es uno de sus días) | 'Activa'
function promoEstado(promo, hoy = argentinaHoy()) {
  if (promo.pausada) return 'Pausada';
  if (promo.desde && hoy.fecha < promo.desde) return 'Programada';
  if (promo.hasta && hoy.fecha > promo.hasta) return 'Vencida';
  if (promo.dias && promo.dias.length && !promo.dias.map(Number).includes(hoy.dia)) return 'Hoy no';
  return 'Activa';
}

function promoVigente(promo, hoy) { return promoEstado(promo, hoy) === 'Activa'; }

// ¿La promo es para este producto? (las de "todo el pedido" no son de ningún producto en particular)
function promoAplicaA(promo, product) {
  if (promo.aplica === 'productos') return (promo.productos || []).map(Number).includes(product.id);
  if (promo.aplica === 'categoria') return promo.categoria === product.cat;
  return false;
}

// Precio por unidad con la promo: nunca menos de $0 ni más caro que el precio normal
function precioConPromo(price, promo) {
  const v = Number(promo.valor) || 0;
  let p = price;
  if (promo.tipo === 'porcentaje') p = price * (1 - v / 100);
  else if (promo.tipo === 'monto') p = price - v;
  else if (promo.tipo === 'precio') p = v;
  return Math.max(0, Math.min(price, Math.round(p)));
}

// Descuento de una promo de "todo el pedido" sobre un monto ("precio especial" no corre para el pedido entero)
function descuentoPedido(monto, promo) {
  const v = Number(promo.valor) || 0;
  if (promo.tipo === 'porcentaje') return Math.round(monto * Math.min(v, 100) / 100);
  if (promo.tipo === 'monto') return Math.min(monto, Math.round(v));
  return 0;
}

// La promo automática vigente que deja más barato el producto. subtotalBase sirve para el mínimo de compra
// (sin pasarlo se ignora el mínimo: es lo que se usa para la etiqueta PROMO del catálogo).
function mejorPromoProducto(product, promos, hoy = argentinaHoy(), subtotalBase = Infinity) {
  let best = null;
  let bestPrice = product.price;
  (promos || []).forEach(pr => {
    if (pr.codigo || !promoVigente(pr, hoy) || !promoAplicaA(pr, product)) return;
    if ((Number(pr.minimo) || 0) > subtotalBase) return;
    const precio = precioConPromo(product.price, pr);
    if (precio < bestPrice) { best = pr; bestPrice = precio; }
  });
  return best ? { promo: best, precio: bestPrice } : null;
}

function textoDias(dias) {
  const ds = (dias || []).map(Number).sort((a, b) => a - b);
  if (!ds.length) return 'todos los días';
  const names = ds.map(d => DIAS_SEMANA[d]);
  return names.length === 1 ? names[0] : names.slice(0, -1).join(', ') + ' y ' + names[names.length - 1];
}

function fechaCorta(iso) {
  const [y, m, d] = String(iso || '').split('-');
  return d && m ? `${Number(d)}/${Number(m)}` + (y ? '/' + y : '') : '';
}

// Por qué un cupón no se puede usar hoy ('' si se puede)
function motivoCuponNoVigente(cupon, hoy = argentinaHoy()) {
  const estado = promoEstado(cupon, hoy);
  if (estado === 'Pausada')    return 'Este cupón no está disponible';
  if (estado === 'Programada') return 'Este cupón vale desde el ' + fechaCorta(cupon.desde);
  if (estado === 'Vencida')    return 'Este cupón ya venció';
  if (estado === 'Hoy no')     return 'Este cupón vale solo los ' + textoDias(cupon.dias);
  return '';
}

// Los cupones fijos de js/data.js ({ 'EDS10': 0.10 }) pasan a tener la misma forma que los del panel
function cuponDesdeFijo(codigo, porcentaje) {
  return { codigo, nombre: codigo, texto: '', tipo: 'porcentaje', valor: Math.round(porcentaje * 100), aplica: 'pedido', productos: [], categoria: '', dias: [], minimo: 0, un_uso: true };
}

// El cupón va encima del precio con promo (no la pisa)
function calcularCupon(items, subtotal, subtotalOriginal, cupon, hoy) {
  if (!cupon) return { descuento: 0, motivo: '' };
  const motivo = motivoCuponNoVigente(cupon, hoy);
  if (motivo) return { descuento: 0, motivo };
  const minimo = Number(cupon.minimo) || 0;
  if (minimo > subtotalOriginal) return { descuento: 0, motivo: 'Este cupón vale en compras desde $' + minimo.toLocaleString('es-AR') };
  let d = 0;
  if (cupon.aplica === 'pedido') d = descuentoPedido(subtotal, cupon);
  else d = items.filter(i => promoAplicaA(cupon, i)).reduce((a, i) => a + (i.precio - precioConPromo(i.precio, cupon)) * i.qty, 0);
  if (!d) return { descuento: 0, motivo: 'Este cupón no aplica a los productos del carrito' };
  return { descuento: Math.min(d, subtotal), motivo: '' };
}

// Calcula el carrito completo. cart: [{ id, cat, price, qty, ... }]
// - Cada producto se queda con su mejor promo automática.
// - Si una promo de "todo el pedido" descuenta más que todas esas juntas, va esa sola (las promos nunca se suman).
// - El cupón se aplica después, sobre el precio con promo.
function calcularCarrito(cart, promos = [], cupon = null, hoy = argentinaHoy()) {
  const subtotalOriginal = cart.reduce((a, i) => a + i.price * i.qty, 0);
  const items = cart.map(i => {
    const m = mejorPromoProducto(i, promos, hoy, subtotalOriginal);
    return { ...i, precioOriginal: i.price, precio: m ? m.precio : i.price, promo: m ? m.promo : null };
  });
  const descProductos = items.reduce((a, i) => a + (i.precioOriginal - i.precio) * i.qty, 0);

  let promoPedido = null;
  let descPedido  = 0;
  (promos || []).forEach(pr => {
    if (pr.codigo || pr.aplica !== 'pedido' || !promoVigente(pr, hoy) || (Number(pr.minimo) || 0) > subtotalOriginal) return;
    const d = descuentoPedido(subtotalOriginal, pr);
    if (d > descPedido) { promoPedido = pr; descPedido = d; }
  });
  if (promoPedido && descPedido > descProductos) {
    items.forEach(i => { i.precio = i.precioOriginal; i.promo = null; });
  } else {
    promoPedido = null;
    descPedido  = 0;
  }

  const subtotal = items.reduce((a, i) => a + i.precio * i.qty, 0) - descPedido;
  const cup      = calcularCupon(items, subtotal, subtotalOriginal, cupon, hoy);
  const usadas   = promoPedido ? [promoPedido] : items.map(i => i.promo).filter(Boolean);
  const promosAplicadas = [...new Set(usadas.map(p => p.texto || p.nombre))];

  return {
    items,
    subtotalOriginal,
    subtotal,                                  // con promos, sin cupón ni envío
    promoPedido,
    descuentoPromos: subtotalOriginal - subtotal,
    promosAplicadas,
    cupon:           cup,                      // { descuento, motivo }
    totalSinEnvio:   subtotal - cup.descuento, // con esto se decide el envío gratis
  };
}

// Revisa el formulario del panel. Devuelve el error a mostrar o '' si está todo bien.
function validarPromo(p) {
  if (!String(p.nombre || '').trim()) return 'Poné un nombre';
  const v = Number(p.valor);
  if (!(v > 0)) return 'Poné un valor mayor a 0';
  if (p.tipo === 'porcentaje' && v > 100) return 'El porcentaje no puede pasar de 100';
  if (p.aplica === 'productos' && !(p.productos || []).length) return 'Elegí al menos un producto';
  if (p.aplica === 'categoria' && !p.categoria) return 'Elegí una categoría';
  if (p.aplica === 'pedido' && p.tipo === 'precio') return 'El precio especial es para productos o categorías, no para todo el pedido';
  if (p.desde && p.hasta && p.hasta < p.desde) return 'La fecha "hasta" es anterior a "desde"';
  if (p.codigo && !/^[A-Z0-9]{3,20}$/.test(p.codigo)) return 'El código tiene que tener de 3 a 20 letras o números, sin espacios';
  return '';
}

if (typeof module !== 'undefined') {
  module.exports = {
    DIAS_SEMANA, argentinaHoy, promoEstado, promoVigente, promoAplicaA, precioConPromo, descuentoPedido,
    mejorPromoProducto, textoDias, fechaCorta, motivoCuponNoVigente, cuponDesdeFijo, calcularCarrito, validarPromo,
  };
}
