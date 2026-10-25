// ===== CATEGORÍAS =====
const CATS_DEF = [
  { name: 'PROMOCIONES', emoji: '🔥', label: 'Promos' },
  { name: 'PIZZAS',      emoji: '🍕', label: 'Pizzas' },
  { name: 'EMPANADAS',   emoji: '🥟', label: 'Empanadas' },
  { name: 'TARTAS',      emoji: '🥧', label: 'Tartas' },
  { name: 'SIN TACC',    emoji: '🌾', label: 'Sin TACC' },
  { name: 'MILANESAS',   emoji: '🥩', label: 'Milanesas' },
  { name: 'CATERING',    emoji: '🎉', label: 'Eventos' },
];

// ===== ESTADO GLOBAL =====
let sb;
let products = [];
let ZONES = {};
let COUPONS = {};
let cart = [];
let currentFilter = 'Todos';
let modalQtyVal = 1;
let selectedZoneKey = '';
let appliedCoupon = null;
let appliedCouponPromo = null;   // el cupón aplicado con sus reglas (del panel o de CUPONES en js/data.js)
let PROMOS = [];                 // promos automáticas y cupones anunciados (tabla promociones, ver supabase/promociones.sql)
let currentVideoSlot = 0;
let currentUser = null;
let myOrders = [];
let myAddresses = [];
let addressesAvailable = true;   // false si la tabla addresses todavía no existe en Supabase
let editingAddressId = null;
let selectedAddressId = null;    // dirección guardada elegida en el checkout (null = nueva)

let isAdmin = false;              // el usuario con sesión está en la tabla admins (ver supabase/seguridad.sql)

// ===== UTILIDADES =====
// TRANSICIÓN: mientras no se corra supabase/seguridad.sql, la base puede aceptar pedidos solo con la clave
// anónima. Estas funciones prueban primero con la sesión del usuario y, si falla, como antes.
// Una vez corrido el SQL se pueden simplificar a usar solo `sb`.
function anonFetch(path, opts = {}) {
  return fetch(SUPABASE_URL + '/rest/v1/' + path, {
    ...opts,
    headers: { 'apikey': SUPABASE_ANON_KEY, 'Authorization': 'Bearer ' + SUPABASE_ANON_KEY, 'Content-Type': 'application/json', ...(opts.headers || {}) },
  });
}

async function insertOrder(order) {
  const { error } = await sb.from('orders').insert(order);
  if (!error) return null;
  console.warn('Insert con sesión falló, reintento con clave anónima:', error.message);
  const res = await anonFetch('orders', { method: 'POST', headers: { 'Prefer': 'return=minimal' }, body: JSON.stringify(order) });
  return res.ok ? null : (await res.text()) || 'Error al guardar';
}

async function selectOrders(query) {
  const build = q => Object.entries(query).reduce((acc, [k, v]) => acc.eq(k, v), q);
  const { data, error } = await build(sb.from('orders').select('*')).order('created_at', { ascending: false });
  if (!error && data?.length) return data;
  const qs = Object.entries(query).map(([k, v]) => k + '=eq.' + encodeURIComponent(v)).join('&');
  const old = await anonFetch('orders?' + qs + '&order=created_at.desc').then(r => r.ok ? r.json() : []).catch(() => []);
  return Array.isArray(old) ? old : [];
}

async function checkIsAdmin() {
  const { data, error } = await sb.rpc('is_admin');
  if (error) { console.warn('is_admin no disponible:', error.message); return null; }
  return data === true;
}

// ===== INICIALIZACIÓN =====
async function init() {
  // El link de "olvidé mi contraseña" vuelve con #...type=recovery (o #error=... si venció).
  // Lo leemos antes de crear el cliente porque Supabase limpia la URL al procesarlo.
  const urlHash      = new URLSearchParams(location.hash.slice(1));
  const isRecovery   = urlHash.get('type') === 'recovery';
  const recoveryFail = !!urlHash.get('error_code');

  sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: {
      storage: window.sessionStorage,
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: true,
    },
  });

  products = PRODUCTOS.filter(p => p.activo !== false);
  // Ocultar links a categorías que quedaron sin productos activos
  document.querySelectorAll('[data-cat]').forEach(el => {
    if (!catHasProducts(el.dataset.cat)) el.style.display = 'none';
  });
  ZONES    = ZONAS;
  COUPONS  = CUPONES;

  document.getElementById('loadingScreen').style.display = 'none';

  const sel = document.getElementById('zoneSelect');
  sel.innerHTML = '<option value="">Seleccioná tu zona de entrega...</option>';
  Object.entries(ZONES).forEach(([key, z]) => {
    const label = z.pickup ? z.name + ' — GRATIS' : z.name + ' — $' + z.cost.toLocaleString('es-AR');
    sel.innerHTML += `<option value="${key}">${label}</option>`;
  });

  const regSel = document.getElementById('regZone');
  regSel.innerHTML = '<option value="">Seleccioná tu zona...</option>';
  Object.entries(ZONES).forEach(([, z]) => {
    regSel.innerHTML += `<option value="${z.name}">${z.name}</option>`;
  });
  regSel.innerHTML += '<option value="Otra zona">Otra zona (especificar abajo)</option>';

  const promos = products.filter(p => p.cat === 'PROMOCIONES');
  if (promos.length) {
    document.getElementById('promoBar').innerHTML =
      '🔥 Promociones: ' + promos.map(p => `<span>${p.name} $${p.price.toLocaleString('es-AR')}</span>`).join('');
  }

  renderHomeCats();
  renderFeaturedProducts();
  renderShopCats();
  renderShopProducts(products);
  renderProductEditList();
  renderWeeklyChart();
  loadPromos();

  document.getElementById('regZone').addEventListener('change', function () {
    document.getElementById('otherZoneGroup').style.display = this.value === 'Otra zona' ? 'block' : 'none';
  });

  // Restaurar sesión al recargar
  try {
    const { data: { session } } = await sb.auth.getSession();
    if (session?.user) await loadCurrentUser(session.user);
    if (isRecovery && session) showResetPage(false);
    else if (recoveryFail || isRecovery) showResetPage(true);
    if (isRecovery || recoveryFail) history.replaceState(null, '', location.pathname + location.search);
  } catch (e) {
    console.error('getSession error:', e);
  }

  // Escuchar cambios de auth en tiempo real
  sb.auth.onAuthStateChange(async (event, session) => {
    try {
      if (event === 'PASSWORD_RECOVERY') {
        showResetPage(false);
      } else if (event === 'SIGNED_IN' && session?.user) {
        await loadCurrentUser(session.user);
      } else if (event === 'SIGNED_OUT') {
        currentUser = null;
        isAdmin = false;
        resetNav();
      }
    } catch (e) {
      console.error('onAuthStateChange error:', e);
    }
  });
}

async function loadCurrentUser(authUser) {
  let { data: profile } = await sb.from('profiles').select('*').eq('id', authUser.id).single();
  if (!profile) {
    // El trigger no creó el perfil — lo creamos ahora
    const meta      = authUser.user_metadata || {};
    const fullName  = (meta.full_name || meta.name || '').trim();
    const nameParts = fullName.split(' ');
    const firstName = meta.name_given || nameParts[0] || authUser.email.split('@')[0];
    const lastName  = meta.name_family || nameParts.slice(1).join(' ') || meta.last || '';
    await sb.from('profiles').insert({
      id:    authUser.id,
      email: authUser.email,
      name:  firstName,
      last:  lastName,
      phone: meta.phone || '',
      zone:  meta.zone  || '',
    });
    const { data: created } = await sb.from('profiles').select('*').eq('id', authUser.id).single();
    profile = created;
  }
  currentUser = profile ? { ...profile, email: authUser.email } : { id: authUser.id, email: authUser.email, name: authUser.email.split('@')[0], last: '', phone: '', zone: '' };
  updateNavForUser();
  loadAddresses();
  isAdmin = (await checkIsAdmin()) === true;
}

// ===== PROMOCIONES =====
// Si la tabla todavía no existe en Supabase la tienda sigue igual, sin promos
async function loadPromos() {
  const { data, error } = await sb.from('promociones').select('*');
  if (error) { console.warn('promociones no disponible:', error.message); return; }
  PROMOS = data || [];
  refreshPromoViews();
}

// Vuelve a dibujar todo lo que muestra precios con promo
function refreshPromoViews() {
  renderPromoBanner();
  renderFeaturedProducts();
  filterProducts(document.getElementById('searchInput')?.value || '');
  updateCartUI();
}

function cartTotals() {
  return calcularCarrito(cart, PROMOS, appliedCouponPromo, argentinaHoy());
}

function money(n) { return '$' + Math.round(n).toLocaleString('es-AR'); }

// Cartel de la home: promos automáticas vigentes y cupones que el admin marcó para anunciar
function renderPromoBanner() {
  const section = document.getElementById('promoBannerSection');
  const hoy     = argentinaHoy();
  const activas = PROMOS.filter(p => promoVigente(p, hoy) && (!p.codigo || p.anunciar));
  section.style.display = activas.length ? 'block' : 'none';
  document.getElementById('promoBanner').innerHTML = activas.map(p => {
    const detalle = [
      p.codigo ? `Cupón <strong>${escapeHtml(p.codigo)}</strong>` : '',
      p.dias?.length ? 'Solo ' + textoDias(p.dias) : '',
      p.hasta ? 'Hasta el ' + fechaCorta(p.hasta).replace(/\/\d{4}$/, '') : '',
      Number(p.minimo) > 0 ? 'Comprando desde ' + money(p.minimo) : '',
    ].filter(Boolean).join(' · ');
    return `
      <div class="promo-banner-item" onclick="showPromoProducts('${p.id}')">
        <div class="promo-banner-title">🔥 ${escapeHtml(p.texto || p.nombre)}</div>
        ${detalle ? `<div class="promo-banner-detail">${detalle}</div>` : ''}
      </div>`;
  }).join('');
}

// Click en el cartel: muestra los productos de esa promo (o todo, si es para el pedido entero)
function showPromoProducts(id) {
  const p = PROMOS.find(x => x.id === id);
  if (!p) return;
  if (p.codigo) {
    document.getElementById('couponInput').value = p.codigo;
    showToast('🏷️ Usá el código ' + p.codigo + ' en el carrito', 4000);
  }
  showPage('shop');
  currentFilter = 'Todos';
  renderShopCats();
  document.getElementById('shopTitle').textContent = p.texto || p.nombre;
  renderShopProducts(p.aplica === 'pedido' ? products : products.filter(x => promoAplicaA(p, x)));
}

// Etiqueta PROMO y precio para catálogo y modal. Si la promo pide un mínimo de compra, se avisa en vez de tachar el precio.
function productPromoInfo(p) {
  const m = mejorPromoProducto(p, PROMOS, argentinaHoy());
  if (!m) return { badge: '', price: money(p.price) };
  const minimo = Number(m.promo.minimo) || 0;
  return {
    badge: `<span class="badge badge-eds-promo" title="${escapeHtml(m.promo.texto || m.promo.nombre)}">PROMO</span>`,
    price: minimo > 0
      ? `${money(p.price)} <span class="promo-min">${money(m.precio)} comprando desde ${money(minimo)}</span>`
      : `<s class="price-old">${money(p.price)}</s> <span class="price-promo">${money(m.precio)}</span>`,
  };
}

// ===== RENDER =====
function catHasProducts(cat) { return products.some(p => p.cat === cat); }

function renderHomeCats() {
  document.getElementById('homeCats').innerHTML = CATS_DEF.filter(c => c.name === 'CATERING' || catHasProducts(c.name)).map(c => `
    <div class="cat-card" onclick="${c.name === 'CATERING' ? "showPage('catering')" : `filterAndShow('${c.name}')`}">
      <div class="cat-emoji">${c.emoji}</div>
      <div class="cat-name">${c.label}</div>
      <div class="cat-count">${c.name === 'CATERING' ? 'Consultar' : products.filter(p => p.cat === c.name).length + ' items'}</div>
    </div>`).join('');
}

function renderFeaturedProducts() {
  // Se muestran los primeros 4 activos: si las milanesas (28) están desactivadas entra la tarta (22)
  const ids = [1, 19, 4, 28, 22];
  document.getElementById('featuredProducts').innerHTML = ids
    .map(id => products.find(p => p.id === id))
    .filter(Boolean)
    .slice(0, 4)
    .map(productCard)
    .join('');
}

function renderShopCats() {
  const all = [{ name: 'Todos', emoji: '🛒', label: 'Todos' }, ...CATS_DEF.filter(c => c.name !== 'CATERING' && catHasProducts(c.name))];
  document.getElementById('shopCats').innerHTML = all.map(c => `
    <div class="cat-card${c.name === currentFilter ? ' active' : ''}" onclick="setFilter('${c.name}',this)">
      <div class="cat-emoji">${c.emoji}</div>
      <div class="cat-name">${c.label || c.name}</div>
      <div class="cat-count">${c.name === 'Todos' ? products.length + ' items' : c.name === 'CATERING' ? 'Consultar' : products.filter(p => p.cat === c.name).length}</div>
    </div>`).join('');
}

function productCard(p) {
  const imgHtml = p.img
    ? `<img src="${p.img}" alt="${p.name}" onerror="this.style.display='none';this.nextElementSibling.style.display='block'"><div class="efb" style="display:none">${p.emoji}</div>`
    : `<div class="efb">${p.emoji}</div>`;
  let badge = '';
  if      (p.badge === 'promo')   badge = '<span class="badge badge-promo">🔥 Oferta</span>';
  else if (p.badge === 'top')     badge = '<span class="badge badge-top">⭐ Top</span>';
  else if (p.badge === 'sintacc') badge = '<span class="badge badge-sintacc">Sin TACC</span>';
  const promo = productPromoInfo(p);
  return `
    <div class="product-card" onclick="openModal(${p.id})">
      <div class="product-img">${imgHtml}</div>
      <div class="product-info">
        ${promo.badge}${badge}
        <div class="product-name">${p.name}</div>
        <div class="product-desc">${p.desc || ''}</div>
        <div class="product-footer">
          <div class="product-price">${promo.price}</div>
          <button class="add-btn" onclick="event.stopPropagation();addToCart(${p.id})">+</button>
        </div>
      </div>
    </div>`;
}

function renderShopProducts(list) {
  const el = document.getElementById('shopProducts');
  if (!list || !list.length) {
    el.innerHTML = '<div style="grid-column:1/-1;text-align:center;padding:44px;color:var(--gray)"><div style="font-size:44px;margin-bottom:8px">🔍</div><p>No encontramos productos</p></div>';
    return;
  }
  el.innerHTML = list.map(productCard).join('');
  document.getElementById('productCount').textContent = list.length + ' producto' + (list.length !== 1 ? 's' : '');
}

function renderWeeklyChart() {
  const data = [
    { l: 'Lun', v: 18500 }, { l: 'Mar', v: 24200 }, { l: 'Mié', v: 21000 },
    { l: 'Jue', v: 31400 }, { l: 'Vie', v: 42800 }, { l: 'Sáb', v: 58600 }, { l: 'Dom', v: 38900 },
  ];
  const max = Math.max(...data.map(d => d.v));
  const el  = document.getElementById('weeklyChart');
  if (!el) return;
  el.innerHTML = data.map(d => `
    <div class="chart-bar-col">
      <div class="chart-val">$${Math.round(d.v / 1000)}k</div>
      <div class="chart-bar" style="height:${Math.round((d.v / max) * 100)}%"></div>
      <div class="chart-label">${d.l}</div>
    </div>`).join('');
}

function renderProductEditList() {
  const el = document.getElementById('productEditList');
  if (!el) return;
  el.innerHTML = products.map(p => `
    <div class="product-edit-row">
      <div class="prod-thumb" id="et${p.id}">${p.img ? `<img src="${p.img}">` : `<span>${p.emoji}</span>`}</div>
      <div class="prod-info">
        <div class="prod-name">${p.name}</div>
        <div class="prod-cat">${p.cat}</div>
      </div>
      <div class="prod-actions">
        <div style="font-family:'Fraunces',serif;font-weight:700;font-size:14px">$${p.price.toLocaleString('es-AR')}</div>
        <label class="edit-btn" style="cursor:pointer">📷<input type="file" accept="image/*" style="display:none" onchange="updatePhoto(${p.id},this)"></label>
      </div>
    </div>`).join('');
}

async function renderCustomersTable() {
  const tbody = document.getElementById('customersBody');
  if (!tbody) return;
  tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;padding:16px;color:var(--gray)">Cargando...</td></tr>';
  const { data: users } = await sb.from('profiles').select('*').order('created_at', { ascending: false });
  tbody.innerHTML = users && users.length
    ? users.map(u => `<tr><td><b>${u.name} ${u.last || ''}</b></td><td>${u.email || '—'}</td><td>${u.phone || '—'}</td><td>${u.zone || '—'}</td><td>${new Date(u.created_at).toLocaleDateString('es-AR')}</td></tr>`).join('')
    : '<tr><td colspan="5" style="color:var(--gray);text-align:center;padding:16px">Sin usuarios todavía</td></tr>';
}

function renderOrdersInTable(orders) {
  [document.getElementById('allOrdersTbody'), document.getElementById('adminOrdersTbody')].forEach(tbody => {
    if (!tbody) return;
    tbody.innerHTML = orders && orders.length
      ? orders.map(o => `
        <tr>
          <td>${o.id}</td>
          <td>${o.date}</td>
          <td>
            <div style="display:flex;align-items:center;gap:5px;flex-wrap:wrap">
              <span style="font-weight:500">${o.user_name || '—'}</span>
              ${o.user_id ? '<span style="background:#dcfce7;color:#16a34a;border-radius:4px;padding:1px 5px;font-size:10px;font-weight:600">✓ Registrado</span>' : '<span style="background:#f1f5f9;color:#64748b;border-radius:4px;padding:1px 5px;font-size:10px;font-weight:600">Invitado</span>'}
            </div>
            <div style="font-size:11px;color:var(--gray);margin-top:2px">${o.email || ''}${o.phone ? ' · ' + o.phone : ''}</div>
          </td>
          <td>${o.zone || '—'}${o.direccion && o.direccion !== 'Retiro en local' ? ' — ' + o.direccion : ''}</td>
          <td>$${o.total.toLocaleString('es-AR')}${o.coupon ? ` <span style="display:inline-block;margin-left:4px;background:#dcfce7;color:#16a34a;border-radius:6px;padding:2px 6px;font-size:10px;font-weight:600">🏷️ ${o.coupon}</span>` : ''}${o.promo_descuento > 0 ? ` <span style="display:inline-block;margin-left:4px;background:#fef9c3;color:#854d0e;border-radius:6px;padding:2px 6px;font-size:10px;font-weight:600">🔥 Promo</span>` : ''}</td>
          <td><span class="order-status ${statusClass(o.status)}">${statusLabel(o.status)}</span></td>
          <td style="display:flex;gap:6px;align-items:center">
            <button onclick="openOrderDetail(${JSON.stringify(o).replace(/"/g,'&quot;')})" style="background:none;border:1px solid var(--border);border-radius:50%;width:26px;height:26px;cursor:pointer;font-size:13px;display:flex;align-items:center;justify-content:center" title="Ver detalle">ⓘ</button>
            <select onchange="updateOrderStatus('${o.id}',this.value)" style="font-size:11px;border:1px solid var(--border);border-radius:var(--rs);padding:3px 6px">
              ${ORDER_STATUSES.map(s => `<option ${statusLabel(o.status) === s ? 'selected' : ''}>${s}</option>`).join('')}
            </select>
          </td>
        </tr>`).join('')
      : '<tr><td colspan="7" style="color:var(--gray);text-align:center;padding:16px">Sin pedidos todavía</td></tr>';
  });
}

// forCustomer: vista de "Mis pedidos" (sin datos de contacto, con estado destacado)
function openOrderDetail(o, forCustomer = false) {
  const disc  = o.discount || 0;
  const promoDisc = o.promo_descuento || 0;
  const sub   = o.total - (o.ship || 0) + disc + promoDisc;
  const items = parseOrderItems(o);
  document.getElementById('odTitle').textContent = 'Pedido ' + o.id;
  if (forCustomer) {
    document.getElementById('odMeta').innerHTML = `${escapeHtml(o.date)} · <span class="order-status ${statusClass(o.status)}">${statusLabel(o.status)}</span>`;
  } else {
    const registradoBadge = o.user_id ? ' <span style="background:#dcfce7;color:#16a34a;border-radius:4px;padding:1px 5px;font-size:10px;font-weight:600">✓ Registrado</span>' : ' <span style="background:#f1f5f9;color:#64748b;border-radius:4px;padding:1px 5px;font-size:10px;font-weight:600">Invitado</span>';
    document.getElementById('odMeta').innerHTML  = `${o.date} · ${o.user_name || '—'}${registradoBadge} · ${statusLabel(o.status)}` + (o.email || o.phone ? `<br><span style="font-size:11px">${o.email || ''}${o.phone ? ' · ' + o.phone : ''}</span>` : '');
  }
  document.getElementById('odItems').innerHTML   = items.map(item => `
    <div style="display:flex;justify-content:space-between;gap:10px;padding:7px 0;border-bottom:1px solid var(--border);font-size:13px">
      <span>${escapeHtml(item.name)} <span style="font-weight:600;color:var(--black)">x${item.qty}</span>${item.price != null ? `<span style="color:var(--gray);font-size:11px"> · ${item.precio_original > item.price ? `<s>${money(item.precio_original)}</s> ` : ''}$${item.price.toLocaleString('es-AR')} c/u</span>` : ''}${item.promo ? `<br><span class="promo-tag">🔥 ${escapeHtml(item.promo)}</span>` : ''}</span>
      <span style="font-weight:600;white-space:nowrap">${item.price != null ? '$' + (item.price * item.qty).toLocaleString('es-AR') : ''}</span>
    </div>`).join('') || '<p style="font-size:13px;color:var(--gray)">Sin detalle de productos</p>';
  document.getElementById('odSubtotal').textContent = '$' + sub.toLocaleString('es-AR');
  document.getElementById('odShip').textContent     = o.ship ? '$' + Number(o.ship).toLocaleString('es-AR') : 'Gratis';
  const promoRow = document.getElementById('odPromoRow');
  if (promoDisc > 0) {
    promoRow.style.display = 'flex';
    document.getElementById('odPromoLabel').textContent = '🔥 ' + (o.promos || 'Promo');
    document.getElementById('odPromoAmt').textContent   = '-' + money(promoDisc);
  } else {
    promoRow.style.display = 'none';
  }
  const couponRow = document.getElementById('odCouponRow');
  if (o.coupon && disc > 0) {
    couponRow.style.display = 'flex';
    document.getElementById('odCouponLabel').textContent = '🏷️ Cupón ' + o.coupon;
    document.getElementById('odCouponAmt').textContent   = '-$' + disc.toLocaleString('es-AR');
  } else {
    couponRow.style.display = 'none';
  }
  document.getElementById('odTotal').textContent    = '$' + Number(o.total).toLocaleString('es-AR');
  const addr = [o.zone, o.direccion].filter(x => x && x !== 'Retiro en local').join(' — ');
  document.getElementById('odAddress').innerHTML    = o.direccion === 'Retiro en local'
    ? '📍 Retiro en local'
    : addr ? '📍 ' + escapeHtml(addr) : '';
  document.getElementById('odActions').style.display = 'none';
  const modal = document.getElementById('orderDetailModal');
  modal.style.display = 'flex';
}

function closeOrderDetail() {
  document.getElementById('orderDetailModal').style.display = 'none';
}

async function renderAllOrdersTable() {
  const { data: orders } = await sb.from('orders').select('*').order('created_at', { ascending: false });
  renderOrdersInTable(orders || []);
}

// ===== FILTROS =====
function filterProducts(q) {
  const query = q.toLowerCase().trim();
  let list = currentFilter === 'Todos' ? products : products.filter(p => p.cat === currentFilter);
  if (query) list = list.filter(p => p.name.toLowerCase().includes(query));
  renderShopProducts(list);
}

function setFilter(cat, el) {
  currentFilter = cat;
  document.querySelectorAll('#shopCats .cat-card').forEach(c => c.classList.remove('active'));
  el.classList.add('active');
  const c = CATS_DEF.find(x => x.name === cat);
  document.getElementById('shopTitle').textContent = cat === 'Todos' ? 'Todos los productos' : (c ? c.label : cat);
  filterProducts(document.getElementById('searchInput')?.value || '');
}

function filterAndShow(cat) {
  showPage('shop');
  currentFilter = cat;
  renderShopCats();
  const c = CATS_DEF.find(x => x.name === cat);
  document.getElementById('shopTitle').textContent = c ? c.label : cat;
  filterProducts('');
}

// ===== CARRITO =====
function addToCart(id, qty = 1, silent = false) {
  const p  = products.find(x => x.id === id);
  if (!p) return;
  const ex = cart.find(x => x.id === id);
  if (ex) ex.qty += qty;
  else cart.push({ ...p, qty });
  updateCartUI();
  if (!silent) showToast('✓ ' + p.name + ' agregado');
}

// Carga al carrito los productos de un pedido anterior, con los precios de hoy
function repeatOrder(i) {
  const o = myOrders[i];
  if (!o) return;
  const { toAdd, skipped } = buildRepeatItems(parseOrderItems(o), products);
  closeOrderDetail();
  if (!toAdd.length) {
    showToast('❌ Los productos de este pedido ya no están disponibles', 4500);
    return;
  }
  toAdd.forEach(item => addToCart(item.id, item.qty, true));
  openCart();
  if (skipped.length) showToast('Algunos productos ya no están disponibles y no se agregaron', 5000);
  else showToast('✓ Agregamos los productos al carrito');
}

function updateCartUI() {
  document.getElementById('cartCount').textContent = cart.reduce((a, b) => a + b.qty, 0);
  const el = document.getElementById('cartItems');
  if (!cart.length) {
    el.innerHTML = '<div class="empty-cart"><div style="font-size:44px;margin-bottom:9px">🛒</div><p>Tu carrito está vacío</p></div>';
  } else {
    el.innerHTML = cartTotals().items.map(item => {
      const img = item.img ? `<img src="${item.img}" alt="">` : item.emoji;
      return `
        <div class="cart-item">
          <div class="cart-item-img">${img}</div>
          <div style="flex:1">
            <div class="cart-item-name">${item.name}</div>
            <div class="cart-item-price">${item.promo ? `<s class="price-old">${money(item.precioOriginal)}</s> <span class="price-promo">${money(item.precio)}</span>` : money(item.precio)} c/u</div>
            ${item.promo ? `<div class="promo-tag">🔥 ${escapeHtml(item.promo.texto || item.promo.nombre)}</div>` : ''}
            <div class="cart-qty">
              <button class="qty-btn" onclick="changeQty(${item.id},-1)">−</button>
              <span class="qty-num">${item.qty}</span>
              <button class="qty-btn" onclick="changeQty(${item.id},1)">+</button>
            </div>
          </div>
          <button class="remove-btn" onclick="removeFromCart(${item.id})">×</button>
        </div>`;
    }).join('');
  }
  const t = cartTotals();
  document.getElementById('cartSubtotal').textContent    = money(t.subtotalOriginal);
  renderTotalsDiscounts(t, 'cart');
  document.getElementById('cartShipDisplay').textContent = selectedZoneKey === '' ? 'Seleccioná zona en checkout' : getShipCostDisplay(t.totalSinEnvio);
  document.getElementById('cartTotal').textContent       = selectedZoneKey === '' ? 'Ver en checkout' : money(getTotal(t));
  updateOrderSummary();
}

// Filas de promo y cupón del carrito ('cart') o del resumen del checkout ('summary')
function renderTotalsDiscounts(t, where) {
  const ids = where === 'cart'
    ? { promoRow: 'promoRow', promoLabel: 'promoLabel', promoAmt: 'promoAmt', discRow: 'discountRow', discLabel: 'discountLabel', discAmt: 'discountAmt' }
    : { promoRow: 'summaryPromoRow', promoLabel: 'summaryPromoLabel', promoAmt: 'summaryPromoAmt', discRow: 'summaryDiscountRow', discLabel: 'summaryDiscountLabel', discAmt: 'summaryDiscountAmt' };
  const el = id => document.getElementById(id);
  if (!el(ids.promoRow)) return;
  el(ids.promoRow).style.display = t.descuentoPromos > 0 ? 'flex' : 'none';
  if (t.descuentoPromos > 0) {
    el(ids.promoLabel).textContent = '🔥 ' + (t.promosAplicadas.length === 1 ? t.promosAplicadas[0] : 'Promos');
    el(ids.promoAmt).textContent   = '-' + money(t.descuentoPromos);
  }
  el(ids.discRow).style.display = t.cupon.descuento > 0 ? 'flex' : 'none';
  if (t.cupon.descuento > 0) {
    el(ids.discLabel).textContent = '🏷️ Cupón ' + appliedCoupon;
    el(ids.discAmt).textContent   = '-' + money(t.cupon.descuento);
  }
}

// El envío gratis se decide con el precio final (con promos y cupón, sin el envío)
function getShipCost(totalSinEnvio) {
  if (!selectedZoneKey) return 0;
  const zone = ZONES[selectedZoneKey];
  if (!zone) return 0;
  if (zone.pickup) return 0;
  if (totalSinEnvio >= FREE_SHIPPING_MIN) return 0;
  return zone.cost;
}

function getShipCostDisplay(totalSinEnvio) {
  if (!selectedZoneKey) return '—';
  const zone = ZONES[selectedZoneKey];
  if (!zone) return '—';
  if (zone.pickup) return 'Gratis (retiro)';
  if (totalSinEnvio >= FREE_SHIPPING_MIN) return 'Gratis 🎉';
  return '$' + zone.cost.toLocaleString('es-AR');
}

function getTotal(t) { return t.totalSinEnvio + getShipCost(t.totalSinEnvio); }

function changeQty(id, d) {
  const i = cart.find(x => x.id === id);
  if (!i) return;
  i.qty += d;
  if (i.qty <= 0) cart = cart.filter(x => x.id !== id);
  updateCartUI();
}

function removeFromCart(id) {
  cart = cart.filter(x => x.id !== id);
  updateCartUI();
}

async function applyCoupon() {
  const code = document.getElementById('couponInput').value.trim().toUpperCase();
  const clear = msg => { appliedCoupon = null; appliedCouponPromo = null; updateCartUI(); showToast('❌ ' + msg, 4000); };
  if (!code) return;

  try {
    // Primero los cupones del panel; si no está, los fijos de js/data.js
    let cupon = null;
    const { data, error } = await sb.rpc('validar_cupon', { p_codigo: code });
    if (error) console.warn('validar_cupon no disponible:', error.message);
    else if (data?.length) cupon = data[0];
    if (!cupon && COUPONS[code]) cupon = cuponDesdeFijo(code, COUPONS[code]);
    if (!cupon) return clear('Cupón no válido');

    if (!currentUser) return clear('Iniciá sesión para usar este cupón');

    const noVigente = motivoCuponNoVigente(cupon);
    if (noVigente) return clear(noVigente);

    if (cupon.un_uso !== false) {
      const used = await selectOrders({ user_id: currentUser.id, coupon: code });
      if (used?.length) return clear('Ya usaste este cupón antes');
    }

    const t = calcularCarrito(cart, PROMOS, cupon, argentinaHoy());
    if (!t.cupon.descuento) return clear(t.cupon.motivo || 'Este cupón no aplica a tu carrito');

    appliedCoupon      = code;
    appliedCouponPromo = cupon;
    updateCartUI();
    showToast('🎉 Cupón aplicado: -' + money(t.cupon.descuento));
  } catch (e) {
    console.error('applyCoupon error:', e);
    showToast('❌ Error al validar el cupón, intentá de nuevo');
  }
}

function openCart()  { document.getElementById('cartOverlay').classList.add('open'); document.getElementById('cartSidebar').classList.add('open'); }
function closeCart() { document.getElementById('cartOverlay').classList.remove('open'); document.getElementById('cartSidebar').classList.remove('open'); }

function goCheckout() {
  if (!cart.length) { showToast('❌ Tu carrito está vacío'); return; }
  closeCart();

  // Resetear pasos al estado inicial
  selectedZoneKey = '';
  document.getElementById('ck2').className = 'ck-step active';
  document.getElementById('ck3').className = 'ck-step';
  document.getElementById('ck4').className = 'ck-step';
  document.getElementById('ckStep2').style.display = 'block';
  document.getElementById('ckStep3').style.display = 'none';
  document.getElementById('ckStep4').style.display = 'none';
  document.getElementById('zoneInfo').style.display    = 'none';
  document.getElementById('addressCard').style.display = 'none';

  showPage('checkout');
  updateOrderSummary();

  if (currentUser) {
    const f = (id, val) => { const el = document.getElementById(id); if (el) el.value = val || ''; };
    f('ckName',  currentUser.name);
    f('ckLast',  currentUser.last);
    f('ckEmail', currentUser.email);
    f('ckPhone', currentUser.phone);
    if (currentUser.zone) {
      const zoneKey = Object.keys(ZONES).find(k => ZONES[k].name === currentUser.zone);
      if (zoneKey) {
        selectedZoneKey = zoneKey;
        const sel = document.getElementById('zoneSelect');
        if (sel) { sel.value = zoneKey; onZoneChange(); }
      }
    }
    // Prellenar el formulario con la dirección vieja del perfil (por si elige "otra dirección")
    const legacy = splitStreetNumber(currentUser.street);
    f('ckStreet', legacy.calle);
    f('ckNumber', legacy.numero);
    f('ckCity',   currentUser.city);
    f('ckDepto',  currentUser.depto);
    f('ckNotes',  currentUser.delivery_notes);
  }

  // Si tiene direcciones guardadas, arranca con la predeterminada (y su zona)
  selectedAddressId = null;
  const def = currentUser && addressesAvailable ? (myAddresses.find(a => a.predeterminada) || myAddresses[0]) : null;
  if (def) selectCheckoutAddress(def.id);
  else renderCheckoutAddresses();
}

function updateOrderSummary() {
  const el = document.getElementById('orderSummaryItems');
  if (!el) return;
  const t = cartTotals();
  el.innerHTML = t.items.map(item => {
    const img = item.img ? `<img src="${item.img}" alt="">` : item.emoji;
    return `
      <div class="oi-row">
        <div class="oi-name"><div class="oi-emoji">${img}</div><span>${item.name} x${item.qty}${item.promo ? `<br><span class="promo-tag">🔥 ${escapeHtml(item.promo.texto || item.promo.nombre)}</span>` : ''}</span></div>
        <span style="text-align:right;white-space:nowrap">${item.promo ? `<s class="price-old">${money(item.precioOriginal * item.qty)}</s><br><span class="price-promo">${money(item.precio * item.qty)}</span>` : money(item.precio * item.qty)}</span>
      </div>`;
  }).join('');
  if (document.getElementById('summarySubtotal')) document.getElementById('summarySubtotal').textContent = money(t.subtotalOriginal);
  if (document.getElementById('summaryShip'))     document.getElementById('summaryShip').textContent     = getShipCostDisplay(t.totalSinEnvio);
  renderTotalsDiscounts(t, 'summary');
  if (document.getElementById('summaryTotal'))    document.getElementById('summaryTotal').textContent    = selectedZoneKey ? money(getTotal(t)) : 'Seleccioná zona';
}

// ===== CHECKOUT =====
function onZoneChange() {
  const sel         = document.getElementById('zoneSelect');
  selectedZoneKey   = sel.value;
  const zoneInfo    = document.getElementById('zoneInfo');
  const addressCard = document.getElementById('addressCard');
  if (!selectedZoneKey) { zoneInfo.style.display = 'none'; addressCard.style.display = 'none'; return; }
  const zone = ZONES[selectedZoneKey];
  if (!zone) return;
  const isFree = cartTotals().totalSinEnvio >= FREE_SHIPPING_MIN;
  document.getElementById('zoneInfoName').textContent = zone.name;
  if (zone.pickup) {
    document.getElementById('zoneInfoDesc').textContent = 'Retirás en Rincón de Milberg. Te confirmamos el horario por WhatsApp.';
    document.getElementById('zoneInfoCost').innerHTML   = 'Gratis <span class="free-badge">GRATIS</span>';
    addressCard.style.display = 'none';
  } else {
    document.getElementById('zoneInfoDesc').textContent = 'Enviamos a tu domicilio. Coordinamos horario de entrega.';
    document.getElementById('zoneInfoCost').innerHTML   = isFree
      ? `<span style="text-decoration:line-through;color:var(--gray);font-size:14px">$${zone.cost.toLocaleString('es-AR')}</span> <span class="free-badge">GRATIS 🎉</span>`
      : '$' + zone.cost.toLocaleString('es-AR');
    addressCard.style.display = 'block';
  }
  zoneInfo.style.display = 'block';
  updateOrderSummary();
  updateCartUI();
}

function ckNext(step) {
  if (step === 2) {
    if (!document.getElementById('ckName').value) { showToast('❌ Ingresá tu nombre'); return; }
    document.getElementById('ck2').className = 'ck-step done';
    document.getElementById('ck3').className = 'ck-step active';
    document.getElementById('ckStep2').style.display = 'none';
    document.getElementById('ckStep3').style.display = 'block';
  } else if (step === 3) {
    if (!selectedZoneKey) { showToast('❌ Seleccioná tu zona de entrega'); return; }
    const zone = ZONES[selectedZoneKey];
    if (zone && !zone.pickup && !selectedAddressId) {
      if (!document.getElementById('ckStreet').value.trim()) { showToast('❌ Ingresá la calle'); return; }
      if (!document.getElementById('ckNumber').value.trim()) { showToast('❌ Ingresá el número'); return; }
    }
    // Mientras no exista la tabla de direcciones, se sigue guardando la última dirección en el perfil como antes
    if (currentUser && zone && !zone.pickup && !addressesAvailable) {
      const a      = getCheckoutAddress();
      const street = [a.calle, a.numero].filter(Boolean).join(' ');
      const city   = a.localidad;
      const depto  = a.piso_depto;
      const notes  = a.referencia;
      sb.from('profiles').update({ street, city, depto, delivery_notes: notes }).eq('id', currentUser.id).then(() => {});
      currentUser.street = street;
      currentUser.city   = city;
      currentUser.depto  = depto;
      currentUser.delivery_notes = notes;
    }
    document.getElementById('ck3').className = 'ck-step done';
    document.getElementById('ck4').className = 'ck-step active';
    document.getElementById('ckStep3').style.display = 'none';
    document.getElementById('ckStep4').style.display = 'block';
  }
}

function selectPay(el) {
  document.querySelectorAll('.pay-opt').forEach(x => x.classList.remove('selected'));
  el.classList.add('selected');
}

async function confirmOrder() {
  const btn = document.querySelector('#ckStep4 .checkout-btn');
  if (btn) { btn.disabled = true; btn.textContent = 'Procesando...'; }

  try {
    const num           = '#EDS-' + String(Math.floor(Math.random() * 89999) + 10000);
    const t             = cartTotals();
    const ship          = getShipCost(t.totalSinEnvio);
    const disc          = t.cupon.descuento;
    const total         = t.totalSinEnvio + ship;
    const zoneName      = selectedZoneKey ? ZONES[selectedZoneKey]?.name : '—';
    const itemsList     = cart.map(i => i.name + ' x' + i.qty).join(', ');
    const clienteNombre = (document.getElementById('ckName').value + ' ' + document.getElementById('ckLast').value).trim();
    const esRetiro      = ZONES[selectedZoneKey]?.pickup;
    const addr          = esRetiro ? null : getCheckoutAddress();
    const direccion     = esRetiro ? 'Retiro en local' : formatAddress(addr);
    const fecha         = new Date().toLocaleDateString('es-AR');

    const order = {
      id:        num,
      user_id:   currentUser?.id || null,
      user_name: currentUser ? currentUser.name + (currentUser.last ? ' ' + currentUser.last : '') : clienteNombre,
      email:     currentUser?.email || document.getElementById('ckEmail').value.trim(),
      phone:     currentUser?.phone || document.getElementById('ckPhone')?.value.trim() || '',
      date:      fecha,
      items:     itemsList,
      total:     Math.round(total),
      ship:      Math.round(ship),
      zone:      zoneName,
      direccion,
      status:    'Recibido',
      coupon:    disc > 0 ? appliedCoupon : null,
      discount:  Math.round(disc),
      items_detalle: t.items.map(i => ({ id: i.id, name: i.name, qty: i.qty, price: i.precio, precio_original: i.precioOriginal, promo: i.promo ? (i.promo.texto || i.promo.nombre) : null })),
      promo_descuento: Math.round(t.descuentoPromos),
      promos:    t.promosAplicadas.join(' · ') || null,
    };

    let insertError = await insertOrder(order);
    // Si todavía no se corrió supabase/promociones.sql, se guarda sin las columnas de promo (el total ya trae el descuento)
    const { promo_descuento, promos, ...sinPromo } = order;
    if (insertError) {
      console.warn('Insert con promos falló, reintento sin columnas de promo:', insertError);
      insertError = await insertOrder(sinPromo);
    }
    if (insertError) {
      // Si la base todavía no tiene la columna items_detalle (o no acepta el estado nuevo),
      // guardamos el pedido como antes para no perder la venta
      console.warn('Insert con detalle falló, reintento sin detalle:', insertError);
      const { items_detalle, ...legacy } = sinPromo;
      insertError = await insertOrder({ ...legacy, status: 'Pendiente' });
    }

    if (insertError) {
      showToast('❌ Error al guardar el pedido');
      console.error('Insert error:', insertError);
      return;
    }

    if (addr) await saveCheckoutAddress(addr);

    document.getElementById('orderNum').textContent = num;
    const msg = encodeURIComponent('Hola! Confirmé mi pedido ' + num + ' por $' + total.toLocaleString('es-AR') + ' (' + zoneName + '). ¡Gracias!');
    document.getElementById('waConfirmBtn').href = 'https://wa.me/' + WA_NUMBER + '?text=' + msg;

    cart = [];
    selectedZoneKey = '';
    appliedCoupon = null;
    appliedCouponPromo = null;
    updateCartUI();
    showPage('confirm');
    if (isAdmin) updateAdminStats();

  } catch (e) {
    console.error('confirmOrder error:', e);
    showToast('❌ ' + (e?.message || 'Error inesperado, intentá de nuevo'));
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = '✓ Confirmar pedido'; }
  }
}

// ===== MODAL DE PRODUCTO =====
function openModal(id) {
  const p = products.find(x => x.id === id);
  if (!p) return;
  modalQtyVal = 1;
  const modalImgEl = document.getElementById('modalImg');
  if (p.img) {
    const img = new Image();
    img.alt = p.name;
    img.onload  = () => { modalImgEl.innerHTML = ''; modalImgEl.appendChild(img); };
    img.onerror = () => { modalImgEl.textContent = p.emoji; };
    img.src = p.img;
  } else {
    modalImgEl.textContent = p.emoji;
  }
  document.getElementById('modalTitle').textContent = p.name;
  document.getElementById('modalDesc').textContent  = p.desc || '';
  const promo = productPromoInfo(p);
  document.getElementById('modalPrice').innerHTML   = promo.price;
  document.getElementById('modalQty').textContent   = 1;
  let badge = '';
  if      (p.badge === 'promo')   badge = '<span class="badge badge-promo" style="margin-bottom:8px;display:inline-block">🔥 Oferta especial</span>';
  else if (p.badge === 'sintacc') badge = '<span class="badge badge-sintacc" style="margin-bottom:8px;display:inline-block">Sin TACC</span>';
  document.getElementById('modalBadge').innerHTML   = promo.badge + badge;
  document.getElementById('modalAddBtn').onclick    = () => { addToCart(p.id, modalQtyVal); closeModal(); };
  document.getElementById('productModal').classList.add('open');
}

function closeModal()      { document.getElementById('productModal').classList.remove('open'); }
function changeModalQty(d) { modalQtyVal = Math.max(1, modalQtyVal + d); document.getElementById('modalQty').textContent = modalQtyVal; }

// ===== CATERING =====
async function submitCatering() {
  const name   = document.getElementById('ctName').value.trim();
  const phone  = document.getElementById('ctPhone').value.trim();
  const zone   = document.getElementById('ctZone').value.trim();
  const guests = document.getElementById('ctGuests').value.trim();
  const type   = document.getElementById('ctType').value;
  const labels = { pizza_party: 'Pizza party', pizza_premium: 'Pizza premium', asado: 'Asado', menu_medida: 'Menú a medida' };
  if (!name || !phone || !zone || !guests || !type) { showToast('❌ Completá todos los campos'); return; }
  const fecha = new Date().toLocaleDateString('es-AR');
  // Abrir WhatsApp antes del await para que el navegador no bloquee el popup
  const msg = encodeURIComponent('Hola El de Siempre! Quiero consultar por un evento.\nNombre: ' + name + '\nZona: ' + zone + '\nPersonas: ' + guests + '\nTipo: ' + labels[type] + '\nTel: ' + phone);
  window.open('https://wa.me/' + WA_NUMBER + '?text=' + msg, '_blank');
  const lead  = { name, phone, zone, guests, type: labels[type], date: fecha };
  const { error } = await sb.from('catering_leads').insert(lead);
  if (error) console.error('Catering insert error:', error);
  ['ctName', 'ctPhone', 'ctZone', 'ctGuests'].forEach(id => document.getElementById(id).value = '');
  document.getElementById('ctType').value = '';
  showToast('✓ Consulta enviada!');
  setTimeout(() => showPage('home'), 1800);
}

async function loadAdminCatering() {
  const tbody = document.getElementById('cateringBody');
  if (!tbody) return;
  tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;padding:16px;color:var(--gray)">Cargando...</td></tr>';
  const { data: leads } = await sb.from('catering_leads').select('*').order('created_at', { ascending: false });
  tbody.innerHTML = leads && leads.length
    ? leads.map(l => `<tr><td><b>${l.name}</b></td><td>${l.phone}</td><td>${l.zone}</td><td>${l.guests}</td><td><span class="tag-catering">${l.type}</span></td><td>${l.date || '—'}</td></tr>`).join('')
    : '<tr><td colspan="6" style="color:var(--gray);text-align:center;padding:18px">Sin consultas todavía</td></tr>';
}

// ===== REVENDEDORES (página mayorista) =====
async function submitMayorista() {
  const name     = document.getElementById('mwName').value.trim();
  const phone    = document.getElementById('mwPhone').value.trim();
  const business = document.getElementById('mwBusiness').value;
  const zone     = document.getElementById('mwZone').value.trim();
  const type     = document.getElementById('mwType').value;
  const perfiles = { negocio: 'Negocio', empresa: 'Empresa', persona: 'Persona' };
  const labels = { kiosco: 'Kiosco / Almacén', rotiseria: 'Rotisería / Vianditas', restaurante: 'Restaurante / Bar', revendedor: 'Revendedor', otro: 'Otro' };
  if (!name || !phone || !business || !zone || !type) { showToast('❌ Completá todos los campos'); return; }
  const fecha = new Date().toLocaleDateString('es-AR');
  // Abrir WhatsApp antes del await para que el navegador no bloquee el popup
  const msg = encodeURIComponent('Hola El de Siempre! Quiero ser revendedor.\nNombre: ' + name + '\nSoy: ' + perfiles[business] + '\nZona: ' + zone + '\nTipo: ' + labels[type] + '\nTel: ' + phone);
  window.open('https://wa.me/' + WA_NUMBER + '?text=' + msg, '_blank');
  const lead  = { name, phone, business: perfiles[business], zone, type: labels[type], date: fecha };
  const { error } = await sb.from('mayorista_leads').insert(lead);
  if (error) console.error('Mayorista insert error:', error);
  ['mwName', 'mwPhone', 'mwBusiness', 'mwZone'].forEach(id => document.getElementById(id).value = '');
  document.getElementById('mwType').value = '';
  showToast('✓ Consulta enviada!');
  setTimeout(() => showPage('home'), 1800);
}

async function loadAdminMayorista() {
  const tbody = document.getElementById('mayoristaBody');
  if (!tbody) return;
  tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;padding:16px;color:var(--gray)">Cargando...</td></tr>';
  const { data: leads } = await sb.from('mayorista_leads').select('*').order('created_at', { ascending: false });
  tbody.innerHTML = leads && leads.length
    ? leads.map(l => `<tr><td><b>${l.name}</b></td><td>${l.phone}</td><td>${l.business}</td><td>${l.zone}</td><td><span class="tag-catering">${l.type}</span></td><td>${l.date || '—'}</td></tr>`).join('')
    : '<tr><td colspan="6" style="color:var(--gray);text-align:center;padding:18px">Sin consultas todavía</td></tr>';
}

// ===== AUTH =====
function switchAuth(type, btn) {
  document.querySelectorAll('.auth-tab').forEach(x => x.classList.remove('active'));
  btn.classList.add('active');
  document.getElementById('authLogin').style.display    = type === 'login'    ? 'block' : 'none';
  document.getElementById('authRegister').style.display = type === 'register' ? 'block' : 'none';
  document.getElementById('authForgot').style.display   = 'none';
}

function showForgot() {
  document.querySelector('.auth-toggle').style.display  = 'none';
  document.getElementById('authLogin').style.display    = 'none';
  document.getElementById('authRegister').style.display = 'none';
  document.getElementById('authForgot').style.display   = 'block';
  document.getElementById('forgotForm').style.display   = 'block';
  document.getElementById('forgotSent').style.display   = 'none';
  const email = document.getElementById('loginEmail').value.trim();
  if (email) document.getElementById('forgotEmail').value = email;
}

function hideForgot() {
  document.querySelector('.auth-toggle').style.display = 'flex';
  switchAuth('login', document.querySelector('.auth-tab'));
}

async function doForgotPassword() {
  const email = document.getElementById('forgotEmail').value.trim().toLowerCase();
  if (!/^\S+@\S+\.\S+$/.test(email)) { showToast('❌ Ingresá un email válido'); return; }
  const btn = document.getElementById('forgotBtn');
  btn.disabled = true; btn.textContent = 'Enviando...';
  try {
    // Siempre mostramos el mismo mensaje, exista o no el mail (por seguridad)
    const { error } = await sb.auth.resetPasswordForEmail(email, { redirectTo: location.origin + location.pathname });
    if (error) console.error('resetPasswordForEmail error:', error);
  } catch (e) {
    console.error('doForgotPassword error:', e);
  } finally {
    btn.disabled = false; btn.textContent = 'Enviarme el link →';
  }
  document.getElementById('forgotForm').style.display = 'none';
  document.getElementById('forgotSent').style.display = 'block';
}

function showResetPage(expired) {
  showPage('reset');
  document.getElementById('resetForm').style.display    = expired ? 'none' : 'block';
  document.getElementById('resetExpired').style.display = expired ? 'block' : 'none';
}

async function doResetPassword() {
  const pass  = document.getElementById('resetPass').value;
  const pass2 = document.getElementById('resetPass2').value;
  if (pass.length < 8) { showToast('❌ La contraseña debe tener al menos 8 caracteres'); return; }
  if (pass !== pass2)  { showToast('❌ Las contraseñas no coinciden'); return; }
  const btn = document.getElementById('resetBtn');
  btn.disabled = true; btn.textContent = 'Guardando...';
  try {
    const { data: { session } } = await sb.auth.getSession();
    if (!session) { showResetPage(true); return; }
    const { error } = await sb.auth.updateUser({ password: pass });
    if (error) {
      console.error('updateUser error:', error);
      showToast(error.message.toLowerCase().includes('different')
        ? '❌ La contraseña nueva tiene que ser distinta a la anterior'
        : '❌ No pudimos guardar la contraseña, intentá de nuevo');
      return;
    }
    document.getElementById('resetPass').value  = '';
    document.getElementById('resetPass2').value = '';
    showToast('✓ Contraseña actualizada');
    showPage('account');
  } catch (e) {
    console.error('doResetPassword error:', e);
    showToast('❌ Error inesperado, intentá de nuevo');
  } finally {
    btn.disabled = false; btn.textContent = 'Guardar contraseña →';
  }
}

async function doLogin() {
  const email = document.getElementById('loginEmail').value.trim().toLowerCase();
  const pass  = document.getElementById('loginPass').value;
  if (!email || !pass) { showToast('❌ Ingresá tu email y contraseña'); return; }
  if (!sb) { showToast('❌ Error de conexión, recargá la página'); return; }
  try {
    const { data, error } = await sb.auth.signInWithPassword({ email, password: pass });
    if (error) {
      const msg = error.status === 422 || error.message.toLowerCase().includes('confirm')
        ? '❌ Confirmá tu email antes de ingresar'
        : '❌ Email o contraseña incorrectos';
      showToast(msg);
      return;
    }
    if (data?.user) await loadCurrentUser(data.user);
    showToast('✓ Sesión iniciada');
    showPage('account');
  } catch (e) {
    console.error('doLogin error:', e);
    showToast('❌ Error inesperado, intentá de nuevo');
  }
}

async function doRegister() {
  const name      = document.getElementById('regName').value.trim();
  const last      = document.getElementById('regLast').value.trim();
  const email     = document.getElementById('regEmail').value.trim().toLowerCase();
  const phone     = document.getElementById('regPhone').value.trim();
  const zone      = document.getElementById('regZone').value;
  const zoneOther = document.getElementById('regZoneOther').value.trim();
  const pass      = document.getElementById('regPass').value;
  const errEl     = document.getElementById('emailError');
  errEl.style.display = 'none';
  if (!name || !email || !zone || !pass)  { showToast('❌ Completá los campos obligatorios'); return; }
  if (pass.length < 8)                    { showToast('❌ La contraseña debe tener al menos 8 caracteres'); return; }
  const finalZone = zone === 'Otra zona' ? zoneOther || 'Otra zona' : zone;
  const { data, error } = await sb.auth.signUp({
    email,
    password: pass,
    options: { data: { name, last, phone, zone: finalZone } },
  });
  if (error) {
    if (error.message.toLowerCase().includes('already')) errEl.style.display = 'block';
    showToast('❌ ' + error.message);
    return;
  }
  if (data.session) {
    // Crear perfil con los datos exactos del formulario (evita race condition con onAuthStateChange)
    await sb.from('profiles').upsert({
      id:    data.user.id,
      email: data.user.email,
      name,
      last,
      phone,
      zone:  finalZone,
    });
    currentUser = { id: data.user.id, email: data.user.email, name, last, phone, zone: finalZone };
    updateNavForUser();
    showToast('✓ Cuenta creada exitosamente');
    setTimeout(() => showPage('account'), 500);
  } else {
    showToast('✓ Revisá tu email para confirmar la cuenta');
    setTimeout(() => showPage('home'), 2500);
  }
}

function updateNavForUser() {
  if (!currentUser) return;
  const nameVal  = currentUser.name  || '';
  const lastVal  = currentUser.last  || '';
  const emailVal = currentUser.email || '';
  const phoneVal = currentUser.phone || '';
  const zoneVal  = currentUser.zone  || '';

  // Actualizar botón de nav
  const navBtn = document.getElementById('navAuthBtn');
  if (navBtn) {
    navBtn.textContent = nameVal || 'Mi cuenta';
    navBtn.onclick = () => showPage('account');
  }

  const avatar = document.getElementById('acctAvatar');
  if (avatar) avatar.textContent = (nameVal[0] || 'U').toUpperCase();
  const acctName = document.getElementById('acctName');
  if (acctName) acctName.textContent = nameVal;
  const acctZone = document.getElementById('acctZone');
  if (acctZone) acctZone.textContent = zoneVal || 'Sin zona';
  ['profName', 'profLast', 'profEmail', 'profPhone', 'profZone'].forEach((id, i) => {
    const el = document.getElementById(id);
    if (el) el.value = [nameVal, lastVal, emailVal, phoneVal, zoneVal][i];
  });
}

function resetNav() {
  const navBtn = document.getElementById('navAuthBtn');
  if (navBtn) {
    navBtn.textContent = 'Ingresar';
    navBtn.onclick = () => showPage('auth');
  }
}

async function logout() {
  await sb.auth.signOut();
  currentUser = null;
  isAdmin = false;
  myAddresses = [];
  myOrders = [];
  resetNav();
  showPage('home');
  showToast('Sesión cerrada');
}

async function saveProfile() {
  if (!currentUser) return;
  const name  = document.getElementById('profName').value.trim();
  const last  = document.getElementById('profLast').value.trim();
  const phone = document.getElementById('profPhone').value.trim();
  if (!name) { showToast('❌ El nombre no puede estar vacío'); return; }
  const { error } = await sb.from('profiles').update({ name, last, phone }).eq('id', currentUser.id);
  if (error) { showToast('❌ Error al guardar'); return; }
  currentUser.name  = name;
  currentUser.last  = last;
  currentUser.phone = phone;
  showToast('✓ Perfil actualizado');
}

async function showAccountTab(tab, el) {
  document.querySelectorAll('.account-nav-item').forEach(x => x.classList.remove('active'));
  el.classList.add('active');
  document.querySelectorAll('#accountContent>div').forEach(x => x.style.display = 'none');
  document.getElementById('tab-' + tab).style.display = 'block';
  if (tab === 'addresses') {
    document.getElementById('addressForm').style.display = 'none';
    document.getElementById('addressList').innerHTML = '<p style="color:var(--gray);font-size:14px">Cargando...</p>';
    await loadAddresses();
    renderAddresses();
  }
  if (tab === 'favorites') {
    document.getElementById('favoritesGrid').innerHTML = products.slice(0, 4).map(productCard).join('');
  }
  if (tab === 'orders') {
    const el2 = document.getElementById('myOrdersList');
    el2.innerHTML = '<p style="color:var(--gray);font-size:14px">Cargando...</p>';
    if (!currentUser) {
      el2.innerHTML = '<p style="color:var(--gray);font-size:14px">Iniciá sesión para ver tus pedidos.</p>';
      return;
    }
    // Solo los pedidos de esta cuenta (antes también buscaba por nombre y podía mostrar pedidos de otra persona)
    myOrders = await selectOrders({ user_id: currentUser.id });
    renderMyOrders();
  }
}

function renderMyOrders() {
  const el = document.getElementById('myOrdersList');
  el.innerHTML = myOrders.length
    ? myOrders.map((o, i) => `
      <div class="order-row order-row-click" onclick="openMyOrder(${i})">
        <div style="min-width:0">
          <div style="font-weight:500">${escapeHtml(o.id)}</div>
          <div class="order-row-items">${escapeHtml(parseOrderItems(o).map(it => it.name + ' x' + it.qty).join(', '))}</div>
          <div style="font-size:12px;color:var(--gray)">${escapeHtml(o.date)} · ${escapeHtml(o.zone || '—')}</div>
        </div>
        <div style="text-align:right;flex-shrink:0">
          <div class="order-status ${statusClass(o.status)}">${statusLabel(o.status)}</div>
          <div style="font-weight:600;font-size:13px;margin-top:3px">$${Number(o.total).toLocaleString('es-AR')}</div>
          <div class="order-row-more">Ver detalle ›</div>
          <button class="order-repeat-btn" onclick="event.stopPropagation();repeatOrder(${i})">↻ Repetir pedido</button>
        </div>
      </div>`).join('')
    : '<p style="color:var(--gray);font-size:14px">Todavía no tenés pedidos.</p>';
}

function openMyOrder(i) {
  if (!myOrders[i]) return;
  openOrderDetail(myOrders[i], true);
  const actions = document.getElementById('odActions');
  actions.innerHTML = `<button class="btn-full" onclick="repeatOrder(${i})">↻ Repetir pedido</button>`;
  actions.style.display = 'block';
}

// ===== DIRECCIONES =====
async function loadAddresses() {
  if (!currentUser) { myAddresses = []; return; }
  const { data, error } = await sb.from('addresses').select('*').eq('user_id', currentUser.id)
    .order('predeterminada', { ascending: false }).order('created_at', { ascending: true });
  if (error) {
    console.warn('addresses no disponible:', error.message);
    addressesAvailable = false;
    myAddresses = [];
    return;
  }
  addressesAvailable = true;
  myAddresses = data || [];
}

function deliveryZoneOptions(selected) {
  return '<option value="">Seleccioná la zona...</option>' + Object.entries(ZONES)
    .filter(([, z]) => !z.pickup)
    .map(([key, z]) => `<option value="${key}" ${key === selected ? 'selected' : ''}>${z.name}</option>`).join('');
}

function renderAddresses() {
  const list = document.getElementById('addressList');
  const addBtn = document.getElementById('addAddressBtn');
  if (!addressesAvailable) {
    list.innerHTML = '<p style="color:var(--gray);font-size:14px">Las direcciones guardadas todavía no están disponibles. Probá más tarde.</p>';
    addBtn.style.display = 'none';
    return;
  }
  addBtn.style.display = document.getElementById('addressForm').style.display === 'none' ? 'block' : 'none';
  if (!myAddresses.length) {
    const legacy = currentUser?.street ? formatAddress({ ...splitStreetNumber(currentUser.street), piso_depto: currentUser.depto, localidad: currentUser.city, referencia: currentUser.delivery_notes }) : '';
    list.innerHTML = legacy
      ? `<div class="address-card">
          <div class="address-card-sub">Usaste esta dirección en una compra anterior:</div>
          <div class="address-card-text" style="margin-top:4px">${escapeHtml(legacy)}</div>
          <div class="address-card-actions"><button onclick="openAddressForm(null, true)">Guardarla en Mis direcciones</button></div>
        </div>`
      : '<p style="color:var(--gray);font-size:14px;margin-bottom:12px">Todavía no guardaste direcciones.</p>';
    return;
  }
  list.innerHTML = myAddresses.map(a => `
    <div class="address-card${a.predeterminada ? ' is-default' : ''}">
      <div class="address-card-text">${escapeHtml(formatAddress({ ...a, referencia: '' }))}${a.predeterminada ? '<span class="default-badge">Predeterminada</span>' : ''}</div>
      <div class="address-card-sub">${escapeHtml(ZONES[a.zona]?.name || 'Sin zona')}${a.referencia ? ' · Ref: ' + escapeHtml(a.referencia) : ''}</div>
      <div class="address-card-actions">
        <button onclick="openAddressForm('${a.id}')">Editar</button>
        ${a.predeterminada ? '' : `<button onclick="setDefaultAddress('${a.id}')">Marcar como predeterminada</button>`}
        <button class="danger" onclick="deleteAddress('${a.id}')">Borrar</button>
      </div>
    </div>`).join('');
}

function openAddressForm(id = null, fromLegacy = false) {
  editingAddressId = id;
  const a = id ? myAddresses.find(x => x.id === id)
    : fromLegacy ? { ...splitStreetNumber(currentUser?.street), piso_depto: currentUser?.depto, localidad: currentUser?.city, referencia: currentUser?.delivery_notes,
                     zona: Object.keys(ZONES).find(k => ZONES[k].name === currentUser?.zone && !ZONES[k].pickup) || '' }
    : {};
  const zonaDefault = a?.zona || Object.keys(ZONES).find(k => ZONES[k].name === currentUser?.zone && !ZONES[k].pickup) || '';
  document.getElementById('addressFormTitle').textContent = id ? 'Editar dirección' : 'Nueva dirección';
  document.getElementById('adCalle').value     = a?.calle || '';
  document.getElementById('adNumero').value    = a?.numero || '';
  document.getElementById('adDepto').value     = a?.piso_depto || '';
  document.getElementById('adLocalidad').value = a?.localidad || '';
  document.getElementById('adRef').value       = a?.referencia || '';
  document.getElementById('adZona').innerHTML  = deliveryZoneOptions(zonaDefault);
  document.getElementById('adDefault').checked = id ? !!a?.predeterminada : !myAddresses.length;
  document.getElementById('addressForm').style.display = 'block';
  document.getElementById('addAddressBtn').style.display = 'none';
  document.getElementById('addressForm').scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function closeAddressForm() {
  editingAddressId = null;
  document.getElementById('addressForm').style.display = 'none';
  renderAddresses();
}

// Deja una sola predeterminada por usuario
async function clearDefaultAddress() {
  return sb.from('addresses').update({ predeterminada: false }).eq('user_id', currentUser.id).eq('predeterminada', true);
}

async function saveAddress() {
  if (!currentUser) return;
  const data = {
    calle:      document.getElementById('adCalle').value.trim(),
    numero:     document.getElementById('adNumero').value.trim(),
    piso_depto: document.getElementById('adDepto').value.trim(),
    localidad:  document.getElementById('adLocalidad').value.trim(),
    referencia: document.getElementById('adRef').value.trim(),
    zona:       document.getElementById('adZona').value,
    predeterminada: document.getElementById('adDefault').checked || !myAddresses.length,
  };
  if (!data.calle || !data.numero) { showToast('❌ Completá calle y número'); return; }
  if (!data.zona)                   { showToast('❌ Elegí la zona de entrega'); return; }
  const btn = document.getElementById('adSaveBtn');
  btn.disabled = true; btn.textContent = 'Guardando...';
  try {
    if (data.predeterminada) await clearDefaultAddress();
    const { error } = editingAddressId
      ? await sb.from('addresses').update(data).eq('id', editingAddressId)
      : await sb.from('addresses').insert({ ...data, user_id: currentUser.id });
    if (error) { console.error('saveAddress error:', error); showToast('❌ No pudimos guardar la dirección'); return; }
    await loadAddresses();
    showToast('✓ Dirección guardada');
    closeAddressForm();
  } finally {
    btn.disabled = false; btn.textContent = 'Guardar dirección';
  }
}

async function setDefaultAddress(id) {
  await clearDefaultAddress();
  const { error } = await sb.from('addresses').update({ predeterminada: true }).eq('id', id);
  if (error) { showToast('❌ No pudimos actualizar la dirección'); return; }
  await loadAddresses();
  renderAddresses();
  showToast('✓ Dirección predeterminada actualizada');
}

async function deleteAddress(id) {
  if (!confirm('¿Borrar esta dirección?')) return;
  const wasDefault = myAddresses.find(a => a.id === id)?.predeterminada;
  const { error } = await sb.from('addresses').delete().eq('id', id);
  if (error) { showToast('❌ No pudimos borrar la dirección'); return; }
  await loadAddresses();
  // Si borró la predeterminada, pasa a serlo la primera que quede
  if (wasDefault && myAddresses.length) {
    await sb.from('addresses').update({ predeterminada: true }).eq('id', myAddresses[0].id);
    await loadAddresses();
  }
  renderAddresses();
  showToast('✓ Dirección borrada');
}

// ----- Direcciones en el checkout -----
function renderCheckoutAddresses() {
  const wrap   = document.getElementById('savedAddresses');
  const fields = document.getElementById('newAddressFields');
  const saved  = currentUser && addressesAvailable ? myAddresses : [];
  document.getElementById('ckSaveAddressRow').style.display = currentUser && addressesAvailable ? 'flex' : 'none';
  if (!saved.length) {
    wrap.style.display = 'none';
    fields.style.display = 'block';
    return;
  }
  wrap.style.display = 'flex';
  wrap.innerHTML = saved.map(a => `
    <div class="pay-opt${selectedAddressId === a.id ? ' selected' : ''}" onclick="selectCheckoutAddress('${a.id}')">
      <span style="font-size:17px">${selectedAddressId === a.id ? '🔘' : '⚪'}</span>
      <div class="addr-opt-text">
        <div style="font-weight:500">${escapeHtml(formatAddress({ ...a, referencia: '' }))}</div>
        <div style="font-size:11px;color:var(--gray)">${escapeHtml(ZONES[a.zona]?.name || 'Sin zona')}${a.predeterminada ? ' · Predeterminada' : ''}</div>
      </div>
    </div>`).join('') + `
    <div class="pay-opt${selectedAddressId === null ? ' selected' : ''}" onclick="selectCheckoutAddress(null)">
      <span style="font-size:17px">${selectedAddressId === null ? '🔘' : '⚪'}</span>
      <div style="font-weight:500">＋ Usar otra dirección</div>
    </div>`;
  fields.style.display = selectedAddressId === null ? 'block' : 'none';
}

function selectCheckoutAddress(id) {
  selectedAddressId = id;
  const a = id ? myAddresses.find(x => x.id === id) : null;
  // La dirección guardada trae su zona: el costo de envío se calcula solo
  if (a?.zona && ZONES[a.zona] && a.zona !== selectedZoneKey) {
    document.getElementById('zoneSelect').value = a.zona;
    onZoneChange();
  }
  renderCheckoutAddresses();
}

function getCheckoutAddress() {
  if (selectedAddressId) {
    const a = myAddresses.find(x => x.id === selectedAddressId);
    if (a) return a;
  }
  return {
    calle:      document.getElementById('ckStreet').value.trim(),
    numero:     document.getElementById('ckNumber').value.trim(),
    piso_depto: document.getElementById('ckDepto').value.trim(),
    localidad:  document.getElementById('ckCity').value.trim(),
    referencia: document.getElementById('ckNotes').value.trim(),
  };
}

// Después de confirmar: guarda la dirección nueva si el usuario lo pidió (sin duplicar)
async function saveCheckoutAddress(addr) {
  if (!currentUser || !addressesAvailable || selectedAddressId) return;
  if (!document.getElementById('ckSaveAddress').checked) return;
  if (myAddresses.some(a => sameAddress(a, addr))) return;
  try {
    const { error } = await sb.from('addresses').insert({ ...addr, zona: selectedZoneKey, user_id: currentUser.id, predeterminada: !myAddresses.length });
    if (error) console.error('saveCheckoutAddress error:', error);
    await loadAddresses();
  } catch (e) {
    console.error('saveCheckoutAddress error:', e);
  }
}

// ===== ADMIN =====
// El admin entra con un usuario de Supabase que esté en la tabla admins (ver supabase/seguridad.sql)
async function doAdminLogin() {
  const email = document.getElementById('adminEmail').value.trim().toLowerCase();
  const pass  = document.getElementById('adminPass').value;
  if (!email || !pass) { showToast('❌ Ingresá email y contraseña'); return; }
  const btn = document.getElementById('adminLoginBtn');
  btn.disabled = true; btn.textContent = 'Ingresando...';
  try {
    const { data, error } = await sb.auth.signInWithPassword({ email, password: pass });
    if (error) { showToast('❌ Email o contraseña incorrectos'); return; }
    const admin = await checkIsAdmin();
    if (admin !== true) {
      await sb.auth.signOut();
      currentUser = null; isAdmin = false; resetNav();
      showToast(admin === null ? '❌ El acceso de admin todavía no está activado' : '❌ Esta cuenta no tiene acceso al panel');
      return;
    }
    if (data?.user) await loadCurrentUser(data.user);
    isAdmin = true;
    document.getElementById('adminPass').value = '';
    showToast('✓ Bienvenido al panel');
    showPage('admin');
  } catch (e) {
    console.error('doAdminLogin error:', e);
    showToast('❌ Error inesperado, intentá de nuevo');
  } finally {
    btn.disabled = false; btn.textContent = 'Acceder →';
  }
}

async function showAdminTab(tab, el) {
  document.querySelectorAll('.admin-nav-item').forEach(x => x.classList.remove('active'));
  el.classList.add('active');
  ['Dashboard', 'Products', 'Promos', 'Orders', 'Customers', 'Catering', 'Mayorista', 'Videos'].forEach(t => {
    const e = document.getElementById('admin' + t);
    if (e) e.style.display = 'none';
  });
  const target = document.getElementById('admin' + tab.charAt(0).toUpperCase() + tab.slice(1));
  if (target) target.style.display = 'block';
  if (tab === 'customers')  renderCustomersTable();
  if (tab === 'orders')     renderAllOrdersTable();
  if (tab === 'promos')     loadAdminPromos();
  if (tab === 'catering')   loadAdminCatering();
  if (tab === 'mayorista')  loadAdminMayorista();
}

// ===== ADMIN: PROMOCIONES =====
let adminPromos = [];
let editingPromoId = null;
const DIAS_ORDEN = [1, 2, 3, 4, 5, 6, 0];   // en el formulario la semana arranca el lunes

async function loadAdminPromos() {
  const el = document.getElementById('promoAdminList');
  const { data, error } = await sb.from('promociones').select('*').order('created_at', { ascending: false });
  if (error) {
    el.innerHTML = '<div class="section-card" style="font-size:13px;color:var(--gray)">Las promociones todavía no están activadas: falta correr <strong>supabase/promociones.sql</strong> en Supabase (ver docs/PROMOCIONES.md).</div>';
    return;
  }
  adminPromos = data || [];
  renderAdminPromos();
}

function promoResumen(p) {
  const valor  = p.tipo === 'porcentaje' ? p.valor + '% OFF' : p.tipo === 'monto' ? '-' + money(p.valor) : 'Precio especial ' + money(p.valor);
  const aplica = p.aplica === 'pedido' ? 'todo el pedido'
    : p.aplica === 'categoria' ? 'categoría ' + ((CATS_DEF.find(c => c.name === p.categoria) || {}).label || p.categoria)
    : (p.productos || []).map(id => (PRODUCTOS.find(x => x.id === Number(id)) || {}).name).filter(Boolean).join(', ');
  const fechas = p.desde && p.hasta ? `del ${fechaCorta(p.desde)} al ${fechaCorta(p.hasta)}`
    : p.desde ? 'desde el ' + fechaCorta(p.desde) : p.hasta ? 'hasta el ' + fechaCorta(p.hasta) : '';
  return [
    valor + ' en ' + aplica,
    p.codigo ? 'Cupón ' + p.codigo + (p.un_uso !== false ? ' (un uso por cliente)' : '') + (p.anunciar ? ', anunciado en la home' : '') : 'Automática',
    fechas,
    p.dias?.length ? 'solo ' + textoDias(p.dias) : '',
    Number(p.minimo) > 0 ? 'compra mínima ' + money(p.minimo) : '',
  ].filter(Boolean).join(' · ');
}

function renderAdminPromos() {
  const el = document.getElementById('promoAdminList');
  if (!adminPromos.length) {
    el.innerHTML = '<div class="section-card" style="font-size:13px;color:var(--gray);text-align:center">Todavía no cargaste promociones</div>';
    return;
  }
  const estados = {
    'Activa':     ['Activa ahora', 'status-delivered'],
    'Hoy no':     ['Hoy no es su día', 'status-processing'],
    'Programada': ['Programada', 'status-processing'],
    'Vencida':    ['Vencida', 'status-cancelled'],
    'Pausada':    ['Pausada', 'status-cancelled'],
  };
  el.innerHTML = adminPromos.map(p => {
    const [label, cls] = estados[promoEstado(p)];
    return `
      <div class="section-card promo-admin-card">
        <div style="display:flex;justify-content:space-between;gap:10px;align-items:flex-start">
          <div style="font-weight:600;font-size:14px">${escapeHtml(p.nombre)}</div>
          <span class="order-status ${cls}" style="white-space:nowrap">${label}</span>
        </div>
        ${p.texto ? `<div style="font-size:13px;margin-top:4px">“${escapeHtml(p.texto)}”</div>` : ''}
        <div style="font-size:12px;color:var(--gray);margin-top:6px">${escapeHtml(promoResumen(p))}</div>
        <div style="display:flex;gap:6px;margin-top:10px;flex-wrap:wrap">
          <button class="edit-btn" onclick="openPromoForm('${p.id}')">Editar</button>
          <button class="edit-btn" onclick="togglePromoPause('${p.id}')">${p.pausada ? 'Reanudar' : 'Pausar'}</button>
          <button class="edit-btn" onclick="deletePromo('${p.id}')">Borrar</button>
        </div>
      </div>`;
  }).join('');
}

function openPromoForm(id = null) {
  const p = id ? adminPromos.find(x => x.id === id) : null;
  editingPromoId = p ? p.id : null;
  document.getElementById('promoFormTitle').textContent = p ? 'Editar promo' : 'Nueva promo';
  const f = (fid, val) => { document.getElementById(fid).value = val ?? ''; };
  f('pfNombre', p?.nombre);
  f('pfTexto',  p?.texto);
  f('pfTipo',   p?.tipo || 'porcentaje');
  f('pfValor',  p?.valor);
  f('pfAplica', p?.aplica || 'productos');
  f('pfDesde',  p?.desde);
  f('pfHasta',  p?.hasta);
  f('pfMinimo', Number(p?.minimo) > 0 ? p.minimo : '');
  f('pfCodigo', p?.codigo);
  document.getElementById('pfUnUso').checked    = p ? p.un_uso !== false : true;
  document.getElementById('pfAnunciar').checked = !!p?.anunciar;

  const elegidos = (p?.productos || []).map(Number);
  document.getElementById('pfProductos').innerHTML = products.map(x => `
    <label class="check-row"><input type="checkbox" value="${x.id}"${elegidos.includes(x.id) ? ' checked' : ''}> ${escapeHtml(x.name)} <span style="color:var(--gray);font-size:11px">${money(x.price)}</span></label>`).join('');
  document.getElementById('pfCategoria').innerHTML = '<option value="">Elegí una categoría...</option>' +
    CATS_DEF.filter(c => c.name !== 'CATERING' && catHasProducts(c.name)).map(c => `<option value="${c.name}">${c.label}</option>`).join('');
  f('pfCategoria', p?.categoria);
  const dias = (p?.dias || []).map(Number);
  document.getElementById('pfDias').innerHTML = DIAS_ORDEN.map(d => `
    <label class="promo-day"><input type="checkbox" value="${d}"${dias.includes(d) ? ' checked' : ''}><span>${DIAS_SEMANA[d].slice(0, 3)}</span></label>`).join('');

  updatePromoForm();
  const form = document.getElementById('promoForm');
  form.style.display = 'block';
  form.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function closePromoForm() {
  document.getElementById('promoForm').style.display = 'none';
  editingPromoId = null;
}

// Muestra solo los campos que corresponden a lo elegido
function updatePromoForm() {
  const tipo   = document.getElementById('pfTipo').value;
  const aplica = document.getElementById('pfAplica').value;
  document.getElementById('pfValorLabel').innerHTML = (tipo === 'porcentaje' ? 'Porcentaje' : tipo === 'monto' ? 'Monto a descontar ($)' : 'Precio especial ($)') + ' <span class="req">*</span>';
  document.getElementById('pfProductosWrap').style.display = aplica === 'productos' ? 'block' : 'none';
  document.getElementById('pfCategoriaWrap').style.display = aplica === 'categoria' ? 'block' : 'none';
  document.getElementById('pfCuponOpts').style.display     = document.getElementById('pfCodigo').value.trim() ? 'block' : 'none';
}

function readPromoForm() {
  const v = id => document.getElementById(id).value.trim();
  const aplica = v('pfAplica');
  const codigo = v('pfCodigo').toUpperCase();
  return {
    nombre:    v('pfNombre'),
    texto:     v('pfTexto'),
    tipo:      v('pfTipo'),
    valor:     Number(v('pfValor')),
    aplica,
    productos: aplica === 'productos' ? [...document.querySelectorAll('#pfProductos input:checked')].map(x => Number(x.value)) : [],
    categoria: aplica === 'categoria' ? v('pfCategoria') : '',
    desde:     v('pfDesde') || null,
    hasta:     v('pfHasta') || null,
    dias:      [...document.querySelectorAll('#pfDias input:checked')].map(x => Number(x.value)),
    minimo:    Number(v('pfMinimo')) || 0,
    codigo:    codigo || null,
    un_uso:    document.getElementById('pfUnUso').checked,
    anunciar:  !!codigo && document.getElementById('pfAnunciar').checked,
  };
}

async function savePromo() {
  const promo = readPromoForm();
  const err = validarPromo(promo);
  if (err) { showToast('❌ ' + err, 4000); return; }
  const btn = document.getElementById('pfGuardarBtn');
  btn.disabled = true;
  try {
    const { error } = editingPromoId
      ? await sb.from('promociones').update(promo).eq('id', editingPromoId)
      : await sb.from('promociones').insert(promo);
    if (error) {
      console.error('savePromo error:', error);
      showToast(error.code === '23505' ? '❌ Ya hay otra promo con ese código' : '❌ No se pudo guardar la promo', 4000);
      return;
    }
    showToast(editingPromoId ? '✓ Promo actualizada' : '✓ Promo creada');
    closePromoForm();
    await loadAdminPromos();
    loadPromos();
  } finally {
    btn.disabled = false;
  }
}

async function togglePromoPause(id) {
  const p = adminPromos.find(x => x.id === id);
  if (!p) return;
  const { error } = await sb.from('promociones').update({ pausada: !p.pausada }).eq('id', id);
  if (error) { showToast('❌ No se pudo cambiar la promo'); return; }
  showToast(p.pausada ? '✓ Promo reanudada' : '✓ Promo pausada');
  await loadAdminPromos();
  loadPromos();
}

async function deletePromo(id) {
  const p = adminPromos.find(x => x.id === id);
  if (!p) return;
  if (!confirm(`¿Borrar la promo "${p.nombre}"? No se puede deshacer. Los pedidos que ya la usaron no cambian.`)) return;
  const { error } = await sb.from('promociones').delete().eq('id', id);
  if (error) { showToast('❌ No se pudo borrar la promo'); return; }
  if (editingPromoId === id) closePromoForm();
  showToast('✓ Promo borrada');
  await loadAdminPromos();
  loadPromos();
}

async function updateAdminStats() {
  const [
    { count: userCount },
    { count: orderCount },
    { count: cateringCount },
    { count: mayoristaCount },
    { data: orders },
    { data: users },
  ] = await Promise.all([
    sb.from('profiles').select('*', { count: 'exact', head: true }),
    sb.from('orders').select('*', { count: 'exact', head: true }),
    sb.from('catering_leads').select('*', { count: 'exact', head: true }),
    sb.from('mayorista_leads').select('*', { count: 'exact', head: true }),
    sb.from('orders').select('*').order('created_at', { ascending: false }),
    sb.from('profiles').select('created_at').order('created_at', { ascending: false }),
  ]);

  const totalSales = (orders || []).reduce((a, o) => a + (o.total || 0), 0);
  const today      = new Date().toLocaleDateString('es-AR');

  ['adminUserCount', 'cusTotal'].forEach(id => { const e = document.getElementById(id); if (e) e.textContent = userCount || 0; });
  const oc = document.getElementById('adminOrderCount');    if (oc) oc.textContent = orderCount || 0;
  const cc = document.getElementById('adminCateringCount'); if (cc) cc.textContent = cateringCount || 0;
  const mc = document.getElementById('adminMayoristaCount'); if (mc) mc.textContent = mayoristaCount || 0;
  const sm = document.getElementById('adminSalesMonth');    if (sm) sm.textContent = '$' + totalSales.toLocaleString('es-AR');
  if (document.getElementById('cusLast'))  document.getElementById('cusLast').textContent  = users && users.length ? new Date(users[0].created_at).toLocaleDateString('es-AR') : '—';
  if (document.getElementById('cusToday')) document.getElementById('cusToday').textContent = (users || []).filter(u => new Date(u.created_at).toLocaleDateString('es-AR') === today).length;

  renderOrdersInTable(orders || []);
}

async function updateOrderStatus(id, status) {
  const { error } = await sb.from('orders').update({ status }).eq('id', id);
  if (error) {
    showToast('❌ Error: ' + error.message);
    console.error('updateOrderStatus error:', error);
  } else {
    showToast('✓ Estado actualizado');
  }
}

// ===== MEDIA =====
function updatePhoto(id, input) {
  if (!input.files[0]) return;
  const r = new FileReader();
  r.onload = e => {
    const p  = products.find(x => x.id === id);
    if (!p)  return;
    p.img    = e.target.result;
    const el = document.getElementById('et' + id);
    if (el)  el.innerHTML = `<img src="${e.target.result}">`;
    showToast('🖼️ Foto actualizada');
  };
  r.readAsDataURL(input.files[0]);
}

function uploadVideo(slot) {
  currentVideoSlot = slot;
  document.getElementById('videoFileInput').click();
}

function handleVideoUpload(input) {
  if (!input.files[0]) return;
  const r = new FileReader();
  r.onload = e => {
    const slot = document.getElementById('vslot' + currentVideoSlot);
    if (slot) {
      slot.innerHTML = `<video src="${e.target.result}" autoplay muted loop playsinline></video><div class="video-label">Video ${currentVideoSlot + 1}</div>`;
      slot.onclick = null;
    }
    showToast('🎬 Video subido');
  };
  r.readAsDataURL(input.files[0]);
  input.value = '';
}

function embedVideo(slot) {
  const url = document.getElementById('vidUrl' + slot)?.value.trim();
  if (!url) { showToast('❌ Ingresá una URL'); return; }
  const vslot = document.getElementById('vslot' + slot);
  if (vslot) {
    vslot.innerHTML = `<iframe src="${url}" frameborder="0" allow="autoplay;encrypted-media" allowfullscreen></iframe><div class="video-label">Video ${slot + 1}</div>`;
    vslot.onclick = null;
    showToast('✓ Video integrado');
  }
}

// ===== NAVEGACIÓN =====
function showPage(page) {
  if (page === 'admin' && !isAdmin) page = 'adminlogin';
  if (page === 'adminlogin' && isAdmin) page = 'admin';
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.getElementById('page-' + page).classList.add('active');
  window.scrollTo(0, 0);
  if (page === 'shop')    { renderShopCats(); renderShopProducts(products); }
  if (page === 'admin')   { renderProductEditList(); renderAllOrdersTable(); updateAdminStats(); }
  if (page === 'account') {
    updateNavForUser();
    const firstTab = document.querySelector('.account-nav-item');
    if (firstTab) showAccountTab('orders', firstTab);
  }
}

function showToast(msg, duration = 2800) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.classList.toggle('toast-wrap', msg.length > 38);
  t.classList.add('show');
  clearTimeout(t._t);
  t._t = setTimeout(() => t.classList.remove('show'), duration);
}

init();
