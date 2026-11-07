// ============================================================
// PLANILLA DE PEDIDOS — Apps Script de "El de Siempre - Pedidos y Detalle de Productos"
// Copia solo los pedidos nuevos de la web a las hojas Pedidos y Detalle Items, cada 10 minutos,
// y actualiza el estado cuando se cambia en el panel de admin.
// Se pega en la planilla: Extensiones → Apps Script (pasos en docs/PLANILLA-PEDIDOS.md).
// ============================================================

// Lo mismo que js/config.js (es público). La clave secreta va en Propiedades del script → CLAVE_PLANILLA.
const SUPABASE_URL      = 'https://sinmjypgphftnewshvnh.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNpbm1qeXBncGhmdG5ld3Nodm5oIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODAxMjc5NzEsImV4cCI6MjA5NTcwMzk3MX0.3AJCTfTCOWkjodQo0fRn_-7KiRLnDftcy9pq0OA5q84';

const LEER_DESDE    = '2026-06-01';   // para actualizar el estado de pedidos viejos que ya están en la planilla
const AGREGAR_DESDE = '2026-10-30';   // los anteriores se cargaron a mano (y los de prueba quedaron afuera)
const ESTADOS_INICIALES = ['Pendiente', 'Recibido'];   // no pisan un estado cambiado a mano en la planilla

const HOJA_PEDIDOS   = 'Pedidos';
const HOJA_ITEMS     = 'Detalle Items';
const HOJA_SEMANAL   = 'Resumen Semanal';
const HOJA_PRODUCTOS = 'Resumen por Producto';

// ===== CÁLCULOS (sin tocar la planilla, se prueban en tests/planilla.test.js) =====
const dosDig = n => String(n).padStart(2, '0');
const fechaTexto = d => dosDig(d.getUTCDate()) + '/' + dosDig(d.getUTCMonth() + 1) + '/' + d.getUTCFullYear();

// '2026-10-30' → '26/10/2026 - 01/11/2026' (de lunes a domingo, como en la planilla)
function semanaDe(fecha) {
  const [y, m, d] = fecha.split('-').map(Number);
  const dia   = new Date(Date.UTC(y, m - 1, d));
  const lunes = new Date(dia.getTime() - ((dia.getUTCDay() + 6) % 7) * 86400000);
  return fechaTexto(lunes) + ' - ' + fechaTexto(new Date(lunes.getTime() + 6 * 86400000));
}

function categoriaDe(nombre) {
  const n = nombre.toLowerCase();
  if (/ x\d+$|pizzas a elecci/.test(n)) return 'Promo Pizza (bundle)';
  if (n.startsWith('pizza'))     return 'Pizza';
  if (n.startsWith('empanada'))  return 'Empanada';
  if (n.startsWith('tarta'))     return 'Tarta';
  if (n.startsWith('milanesa'))  return 'Milanesa';
  return 'Otro';
}

// Cuántas pizzas trae un pack: "Muzzarella x10" → 10, "10 pizzas a elección" → 10
function pizzasPorPack(nombre) {
  if (categoriaDe(nombre) !== 'Promo Pizza (bundle)') return 0;
  const m = nombre.match(/ x(\d+)$/) || nombre.match(/^(\d+) pizzas/i);
  return m ? Number(m[1]) : 0;
}

// Los pedidos nuevos traen items_detalle; los viejos solo el texto "Pizza Muzzarella x2, ..."
function itemsDePedido(p) {
  if (Array.isArray(p.items_detalle) && p.items_detalle.length) {
    return p.items_detalle.map(i => ({ nombre: i.name, cantidad: Number(i.qty) || 1, precio: Number(i.precio_original ?? i.price) || 0 }));
  }
  return String(p.items || '').split(', ').filter(Boolean).map(t => {
    const m = t.match(/^(.*) x(\d+)$/);
    return m ? { nombre: m[1], cantidad: Number(m[2]) } : { nombre: t, cantidad: 1 };
  });
}

// Columnas de la hoja Pedidos (A:P). La fecha va como texto 'AAAA-MM-DD' y se convierte al escribir.
function filaPedido(p, clienteNuevo) {
  const items     = itemsDePedido(p);
  const envio     = Number(p.envio) || 0;
  const descuento = (Number(p.descuento) || 0) + (Number(p.promo_descuento) || 0);
  const esRetiro  = !p.direccion || p.direccion === 'Retiro en local';
  // Subtotal a precio de lista; los pedidos viejos sin precios lo sacan del total
  const subtotal  = items.length && items.every(i => i.precio) ? items.reduce((a, i) => a + i.precio * i.cantidad, 0)
                                              : (Number(p.total) || 0) - envio + descuento;
  return [
    p.id,
    p.fecha,
    semanaDe(p.fecha),
    p.cliente || '',
    p.registrado ? 'Registrado' : 'Invitado',
    p.email || '',
    clienteNuevo ? 'Sí' : 'No',
    p.estado || 'Recibido',
    esRetiro ? (p.zona || 'Retiro') : [p.zona, p.direccion].filter(Boolean).join(' — '),
    subtotal,
    envio,
    [p.cupon, p.promos].filter(Boolean).join(' · '),
    descuento,
    Number(p.total) || 0,
    items.length,
    items.map(i => i.nombre + ' x' + i.cantidad).join('; '),
  ];
}

// Columnas de la hoja Detalle Items (A:H), una fila por producto
function filasItems(p) {
  return itemsDePedido(p).map(i => [
    p.id, p.fecha, semanaDe(p.fecha), p.estado || 'Recibido',
    i.nombre, categoriaDe(i.nombre), i.cantidad, pizzasPorPack(i.nombre) * i.cantidad,
  ]);
}

// ===== PLANILLA =====
function onOpen() {
  SpreadsheetApp.getUi().createMenu('El de Siempre')
    .addItem('Traer pedidos ahora', 'sincronizarPedidos')
    .addToUi();
}

// Correr UNA vez a mano: pide los permisos, programa la copia cada 10 minutos y trae los pedidos
function instalar() {
  ScriptApp.getProjectTriggers()
    .filter(t => t.getHandlerFunction() === 'sincronizarPedidos')
    .forEach(t => ScriptApp.deleteTrigger(t));
  ScriptApp.newTrigger('sincronizarPedidos').timeBased().everyMinutes(10).create();
  ampliarResumenes();
  sincronizarPedidos();
}

function traerPedidos() {
  const clave = PropertiesService.getScriptProperties().getProperty('CLAVE_PLANILLA');
  if (!clave) throw new Error('Falta la propiedad CLAVE_PLANILLA (ver docs/PLANILLA-PEDIDOS.md)');
  const res = UrlFetchApp.fetch(SUPABASE_URL + '/rest/v1/rpc/pedidos_planilla', {
    method: 'post',
    contentType: 'application/json',
    headers: { apikey: SUPABASE_ANON_KEY, Authorization: 'Bearer ' + SUPABASE_ANON_KEY },
    payload: JSON.stringify({ p_clave: clave, p_desde: LEER_DESDE }),
    muteHttpExceptions: true,
  });
  if (res.getResponseCode() !== 200) throw new Error('Supabase respondió ' + res.getResponseCode() + ': ' + res.getContentText());
  return JSON.parse(res.getContentText());
}

function sincronizarPedidos() {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(30000)) return;
  try {
    const pedidos = traerPedidos();
    const ss      = SpreadsheetApp.getActiveSpreadsheet();
    const hojaP   = ss.getSheetByName(HOJA_PEDIDOS);
    const hojaI   = ss.getSheetByName(HOJA_ITEMS);

    const filasP  = hojaP.getLastRow() > 1 ? hojaP.getRange(2, 1, hojaP.getLastRow() - 1, 8).getValues() : [];
    const filaDe  = new Map(filasP.map((f, i) => [String(f[0]), i + 2]));
    const emails  = new Set(filasP.map(f => String(f[5]).trim().toLowerCase()).filter(Boolean));

    const nuevosP = [], nuevosI = [], cambios = new Map();
    pedidos.forEach(p => {
      const fila = filaDe.get(p.id);
      if (fila) {
        const actual = String(filasP[fila - 2][7]);
        if (p.estado && p.estado !== actual && !ESTADOS_INICIALES.includes(p.estado)) {
          hojaP.getRange(fila, 8).setValue(p.estado);
          cambios.set(p.id, p.estado);
        }
        return;
      }
      if (p.fecha < AGREGAR_DESDE) return;
      const email = String(p.email || '').trim().toLowerCase();
      nuevosP.push(filaPedido(p, !emails.has(email)));
      nuevosI.push(...filasItems(p));
      if (email) emails.add(email);
    });

    if (cambios.size && hojaI.getLastRow() > 1) {
      const estados = hojaI.getRange(2, 1, hojaI.getLastRow() - 1, 4).getValues()
        .map(f => [cambios.get(String(f[0])) || f[3]]);
      hojaI.getRange(2, 4, estados.length, 1).setValues(estados);
    }

    const aFecha = f => { const [y, m, d] = f.split('-').map(Number); return new Date(y, m - 1, d); };
    if (nuevosP.length) {
      // Se reescriben los valores ya ordenados en vez de usar sort(): sort mueve las celdas
      // y corre las fórmulas de los resúmenes (Pedidos!$C$2 pasaba a $C$4)
      nuevosP.forEach(f => { f[1] = aFecha(f[1]); });
      const ancho  = nuevosP[0].length;
      const viejas = hojaP.getLastRow() > 1 ? hojaP.getRange(2, 1, hojaP.getLastRow() - 1, ancho).getValues() : [];
      const tiempo = v => new Date(v).getTime() || 0;
      const todas  = nuevosP.reverse().concat(viejas).sort((a, b) => tiempo(b[1]) - tiempo(a[1]));
      hojaP.getRange(2, 1, todas.length, ancho).setValues(todas);
      hojaP.getRange(2, 2, todas.length, 1).setNumberFormat('yyyy-mm-dd');
    }
    if (nuevosI.length) {
      nuevosI.forEach(f => { f[1] = aFecha(f[1]); });
      const desde = hojaI.getLastRow() + 1;
      hojaI.getRange(desde, 1, nuevosI.length, nuevosI[0].length).setValues(nuevosI);
      hojaI.getRange(desde, 2, nuevosI.length, 1).setNumberFormat('yyyy-mm-dd');
      agregarFaltantes(ss.getSheetByName(HOJA_SEMANAL), 1, nuevosI.map(f => [f[2]]));
      agregarFaltantes(ss.getSheetByName(HOJA_PRODUCTOS), 2, nuevosI.map(f => [f[5], f[4]]));
    }
  } finally {
    lock.releaseLock();
  }
}

// Suma a los resúmenes las semanas / productos nuevos (columna `col` = la que se compara)
function agregarFaltantes(hoja, col, filas) {
  if (!hoja) return;
  const ultima = hoja.getLastRow();
  const hay = new Set(hoja.getRange(2, col, Math.max(ultima - 1, 1), 1).getValues().map(f => String(f[0])));
  filas.forEach(f => {
    const clave = String(f[col - 1]);
    if (hay.has(clave)) return;
    hay.add(clave);
    hoja.getRange(hoja.getLastRow() + 1, 1, 1, f.length).setValues([f]);
  });
}

// Las fórmulas de los resúmenes llegaban hasta la fila 20 (semanas) y 29 (productos): las estira a 300
// y deja en blanco las filas vacías. Se puede correr más de una vez.
function ampliarResumenes() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const ampliar = (hoja, celdas, viejo, nuevo, letra) => {
    if (!hoja) return;
    const rango = hoja.getRange(celdas);
    const formulas = rango.getFormulas()[0].map(f => {
      if (!f.includes(viejo)) return f;
      f = f.split(viejo).join(nuevo);
      if (f.includes('LAMBDA(' + letra + ',')) return f.replace('LAMBDA(' + letra + ',', 'LAMBDA(' + letra + ',IF(' + letra + '="","",') + ')';
      return f;
    });
    rango.setFormulas([formulas]);
  };
  const semanal = ss.getSheetByName(HOJA_SEMANAL);
  ampliar(semanal, 'B2:L2', '$A$2:$A$20,', '$A$2:$A$300,', 'w');
  if (semanal) {
    const h2 = semanal.getRange('H2');
    if (h2.getFormula() === '=ARRAYFORMULA(E2:E20+G2:G20)') h2.setFormula('=ARRAYFORMULA(IF(A2:A300="","",E2:E300+G2:G300))');
  }
  ampliar(ss.getSheetByName(HOJA_PRODUCTOS), 'C2:D2', '$B$2:$B$29,', '$B$2:$B$300,', 'p');
}

if (typeof module !== 'undefined') module.exports = { semanaDe, categoriaDe, pizzasPorPack, itemsDePedido, filaPedido, filasItems };
