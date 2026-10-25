// ============================================================
// PEDIDOS — funciones de ayuda sin pantalla (se prueban con `npm test`)
// ============================================================

// Estados en el orden en que avanza un pedido
const ORDER_STATUSES = ['Recibido', 'En preparación', 'En camino', 'Entregado', 'Cancelado'];

// Los pedidos viejos guardaron "Pendiente": se muestran como "Recibido" sin tocar el dato
function statusLabel(status) {
  if (!status || status === 'Pendiente') return 'Recibido';
  return status;
}

function statusClass(status) {
  const s = statusLabel(status);
  if (s === 'Entregado') return 'status-delivered';
  if (s === 'En camino' || s === 'En preparación') return 'status-processing';
  if (s === 'Cancelado') return 'status-cancelled';
  return 'status-pending';
}

// Devuelve [{ id, name, qty, price }]. Los pedidos nuevos traen items_detalle con id y precio;
// los viejos solo tienen el texto "Pizza Muzzarella x2, Tarta Zapallo x1" (id y precio quedan en null).
function parseOrderItems(order) {
  if (Array.isArray(order?.items_detalle) && order.items_detalle.length) {
    return order.items_detalle.map(i => ({
      id:    i.id ?? null,
      name:  i.name || '',
      qty:   Number(i.qty) || 1,
      price: i.price == null ? null : Number(i.price),
    }));
  }
  return String(order?.items || '').split(',').map(s => s.trim()).filter(Boolean).map(item => {
    const match = item.match(/^(.+?)\s+x(\d+)$/);
    return { id: null, name: match ? match[1] : item, qty: match ? Number(match[2]) : 1, price: null };
  });
}

// "Av. del Libertador 1234" → { calle: 'Av. del Libertador', numero: '1234' } (para la dirección vieja del perfil)
function splitStreetNumber(street) {
  const s = String(street || '').trim();
  const match = s.match(/^(.*\D)\s+(\d+[a-zA-Z]?)$/);
  return match ? { calle: match[1].trim(), numero: match[2] } : { calle: s, numero: '' };
}

// Texto de la dirección como se guarda en el pedido: "Calle 123 - 3B - Localidad (Ref: portón negro)"
function formatAddress(a) {
  if (!a) return '';
  const base = [[a.calle, a.numero].filter(Boolean).join(' '), a.piso_depto, a.localidad].map(x => (x || '').trim()).filter(Boolean).join(' - ');
  return a.referencia && a.referencia.trim() ? `${base} (Ref: ${a.referencia.trim()})` : base;
}

function sameAddress(a, b) {
  const norm = x => String(x || '').trim().toLowerCase();
  return ['calle', 'numero', 'piso_depto', 'localidad'].every(k => norm(a[k]) === norm(b[k]));
}

function escapeHtml(str) {
  return String(str ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

if (typeof module !== 'undefined') {
  module.exports = { ORDER_STATUSES, statusLabel, statusClass, parseOrderItems, splitStreetNumber, formatAddress, sameAddress, escapeHtml };
}
