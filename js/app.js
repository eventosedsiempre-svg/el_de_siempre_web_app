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
let currentVideoSlot = 0;
let currentUser = null;

// ===== UTILIDADES =====
async function sha256(str) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(str));
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
}

// ===== INICIALIZACIÓN =====
async function init() {
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

  document.getElementById('regZone').addEventListener('change', function () {
    document.getElementById('otherZoneGroup').style.display = this.value === 'Otra zona' ? 'block' : 'none';
  });

  // Restaurar sesión al recargar
  try {
    const { data: { session } } = await sb.auth.getSession();
    if (session?.user) await loadCurrentUser(session.user);
  } catch (e) {
    console.error('getSession error:', e);
  }

  // Escuchar cambios de auth en tiempo real
  sb.auth.onAuthStateChange(async (event, session) => {
    try {
      if (event === 'SIGNED_IN' && session?.user) {
        await loadCurrentUser(session.user);
      } else if (event === 'SIGNED_OUT') {
        currentUser = null;
        resetNav();
      }
    } catch (e) {
      console.error('onAuthStateChange error:', e);
    }
  });

  updateAdminStats();
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
  return `
    <div class="product-card" onclick="openModal(${p.id})">
      <div class="product-img">${imgHtml}</div>
      <div class="product-info">
        ${badge}
        <div class="product-name">${p.name}</div>
        <div class="product-desc">${p.desc || ''}</div>
        <div class="product-footer">
          <div class="product-price">$${p.price.toLocaleString('es-AR')}</div>
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
          <td>$${o.total.toLocaleString('es-AR')}${o.coupon ? ` <span style="display:inline-block;margin-left:4px;background:#dcfce7;color:#16a34a;border-radius:6px;padding:2px 6px;font-size:10px;font-weight:600">🏷️ ${o.coupon}</span>` : ''}</td>
          <td><span class="order-status ${o.status === 'Entregado' ? 'status-delivered' : o.status === 'En camino' ? 'status-processing' : 'status-pending'}">${o.status}</span></td>
          <td style="display:flex;gap:6px;align-items:center">
            <button onclick="openOrderDetail(${JSON.stringify(o).replace(/"/g,'&quot;')})" style="background:none;border:1px solid var(--border);border-radius:50%;width:26px;height:26px;cursor:pointer;font-size:13px;display:flex;align-items:center;justify-content:center" title="Ver detalle">ⓘ</button>
            <select onchange="updateOrderStatus('${o.id}',this.value)" style="font-size:11px;border:1px solid var(--border);border-radius:var(--rs);padding:3px 6px">
              <option ${o.status === 'Pendiente'  ? 'selected' : ''}>Pendiente</option>
              <option ${o.status === 'En camino'  ? 'selected' : ''}>En camino</option>
              <option ${o.status === 'Entregado'  ? 'selected' : ''}>Entregado</option>
              <option ${o.status === 'Cancelado'  ? 'selected' : ''}>Cancelado</option>
            </select>
          </td>
        </tr>`).join('')
      : '<tr><td colspan="7" style="color:var(--gray);text-align:center;padding:16px">Sin pedidos todavía</td></tr>';
  });
}

function openOrderDetail(o) {
  const disc  = o.discount || 0;
  const sub   = o.total - (o.ship || 0) + disc;
  const items = (o.items || '').split(',').map(i => i.trim()).filter(Boolean);
  document.getElementById('odTitle').textContent = o.id;
  const registradoBadge = o.user_id ? ' <span style="background:#dcfce7;color:#16a34a;border-radius:4px;padding:1px 5px;font-size:10px;font-weight:600">✓ Registrado</span>' : ' <span style="background:#f1f5f9;color:#64748b;border-radius:4px;padding:1px 5px;font-size:10px;font-weight:600">Invitado</span>';
  document.getElementById('odMeta').innerHTML  = `${o.date} · ${o.user_name || '—'}${registradoBadge} · ${o.status}` + (o.email || o.phone ? `<br><span style="font-size:11px">${o.email || ''}${o.phone ? ' · ' + o.phone : ''}</span>` : '');
  document.getElementById('odItems').innerHTML   = items.map(item => {
    const match = item.match(/^(.+)\s+x(\d+)$/);
    const name  = match ? match[1] : item;
    const qty   = match ? match[2] : '1';
    return `<div style="display:flex;justify-content:space-between;padding:7px 0;border-bottom:1px solid var(--border);font-size:13px">
      <span>${name}</span><span style="font-weight:600;color:var(--black)">x${qty}</span>
    </div>`;
  }).join('');
  document.getElementById('odSubtotal').textContent = '$' + sub.toLocaleString('es-AR');
  document.getElementById('odShip').textContent     = o.ship ? '$' + Number(o.ship).toLocaleString('es-AR') : 'Gratis';
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
    : addr ? '📍 ' + addr : '';
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
function addToCart(id, qty = 1) {
  const p  = products.find(x => x.id === id);
  if (!p) return;
  const ex = cart.find(x => x.id === id);
  if (ex) ex.qty += qty;
  else cart.push({ ...p, qty });
  updateCartUI();
  showToast('✓ ' + p.name + ' agregado');
}

function updateCartUI() {
  document.getElementById('cartCount').textContent = cart.reduce((a, b) => a + b.qty, 0);
  const el = document.getElementById('cartItems');
  if (!cart.length) {
    el.innerHTML = '<div class="empty-cart"><div style="font-size:44px;margin-bottom:9px">🛒</div><p>Tu carrito está vacío</p></div>';
  } else {
    el.innerHTML = cart.map(item => {
      const img = item.img ? `<img src="${item.img}" alt="">` : item.emoji;
      return `
        <div class="cart-item">
          <div class="cart-item-img">${img}</div>
          <div style="flex:1">
            <div class="cart-item-name">${item.name}</div>
            <div class="cart-item-price">$${item.price.toLocaleString('es-AR')} c/u</div>
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
  const sub  = cart.reduce((a, b) => a + b.price * b.qty, 0);
  const disc = getDiscount(sub);
  document.getElementById('cartSubtotal').textContent    = '$' + sub.toLocaleString('es-AR');
  document.getElementById('cartShipDisplay').textContent = selectedZoneKey === '' ? 'Seleccioná zona en checkout' : getShipCostDisplay(sub);
  document.getElementById('discountRow').style.display   = disc > 0 ? 'flex' : 'none';
  if (disc > 0) document.getElementById('discountAmt').textContent = '-$' + disc.toLocaleString('es-AR');
  document.getElementById('cartTotal').textContent       = selectedZoneKey === '' ? 'Ver en checkout' : '$' + getTotal(sub).toLocaleString('es-AR');
  updateOrderSummary();
}

function getShipCost(sub) {
  if (!selectedZoneKey) return 0;
  const zone = ZONES[selectedZoneKey];
  if (!zone) return 0;
  if (zone.pickup) return 0;
  if (sub >= FREE_SHIPPING_MIN) return 0;
  return zone.cost;
}

function getShipCostDisplay(sub) {
  if (!selectedZoneKey) return '—';
  const zone = ZONES[selectedZoneKey];
  if (!zone) return '—';
  if (zone.pickup) return 'Gratis (retiro)';
  if (sub >= FREE_SHIPPING_MIN) return 'Gratis 🎉';
  return '$' + zone.cost.toLocaleString('es-AR');
}

function getDiscount(sub) {
  if (!appliedCoupon || !COUPONS[appliedCoupon]) return 0;
  return Math.round(sub * COUPONS[appliedCoupon]);
}

function getTotal(sub) { return sub + getShipCost(sub) - getDiscount(sub); }

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

  if (!COUPONS[code]) {
    appliedCoupon = null;
    updateCartUI();
    showToast('❌ Cupón no válido');
    return;
  }

  if (!currentUser) {
    appliedCoupon = null;
    updateCartUI();
    showToast('❌ Iniciá sesión para usar este cupón');
    return;
  }

  try {
    const hdrs = { 'apikey': SUPABASE_ANON_KEY, 'Authorization': 'Bearer ' + SUPABASE_ANON_KEY };
    const used = await fetch(
      SUPABASE_URL + '/rest/v1/orders?user_id=eq.' + currentUser.id + '&coupon=eq.' + code + '&select=id',
      { headers: hdrs }
    ).then(r => r.json()).catch(() => []);

    if (used?.length) {
      appliedCoupon = null;
      updateCartUI();
      showToast('❌ Ya usaste este cupón antes');
      return;
    }

    appliedCoupon = code;
    updateCartUI();
    showToast('🎉 Cupón aplicado: ' + Math.round(COUPONS[code] * 100) + '% off');
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
    // Prellenar dirección guardada
    const g = (id, val) => { const el = document.getElementById(id); if (el) el.value = val || ''; };
    g('ckStreet', currentUser.street);
    g('ckCity',   currentUser.city);
    g('ckDepto',  currentUser.depto);
    g('ckNotes',  currentUser.delivery_notes);
  }
}

function updateOrderSummary() {
  const el = document.getElementById('orderSummaryItems');
  if (!el) return;
  el.innerHTML = cart.map(item => {
    const img = item.img ? `<img src="${item.img}" alt="">` : item.emoji;
    return `
      <div class="oi-row">
        <div class="oi-name"><div class="oi-emoji">${img}</div><span>${item.name} x${item.qty}</span></div>
        <span>$${(item.price * item.qty).toLocaleString('es-AR')}</span>
      </div>`;
  }).join('');
  const sub  = cart.reduce((a, b) => a + b.price * b.qty, 0);
  const disc = getDiscount(sub);
  if (document.getElementById('summarySubtotal')) document.getElementById('summarySubtotal').textContent = '$' + sub.toLocaleString('es-AR');
  if (document.getElementById('summaryShip'))     document.getElementById('summaryShip').textContent     = getShipCostDisplay(sub);
  if (document.getElementById('summaryDiscountRow')) document.getElementById('summaryDiscountRow').style.display = disc > 0 ? 'flex' : 'none';
  if (disc > 0 && document.getElementById('summaryDiscountAmt')) document.getElementById('summaryDiscountAmt').textContent = '-$' + disc.toLocaleString('es-AR');
  if (document.getElementById('summaryTotal'))    document.getElementById('summaryTotal').textContent    = selectedZoneKey ? '$' + getTotal(sub).toLocaleString('es-AR') : 'Seleccioná zona';
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
  const sub    = cart.reduce((a, b) => a + b.price * b.qty, 0);
  const isFree = sub >= FREE_SHIPPING_MIN;
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
    if (zone && !zone.pickup && !document.getElementById('ckStreet').value) { showToast('❌ Ingresá tu dirección'); return; }
    // Guardar dirección en el perfil si el usuario está logueado
    if (currentUser && zone && !zone.pickup) {
      const street = document.getElementById('ckStreet').value.trim();
      const city   = document.getElementById('ckCity').value.trim();
      const depto  = document.getElementById('ckDepto').value.trim();
      const notes  = document.getElementById('ckNotes').value.trim();
      sb.from('profiles').update({ street, city, depto, delivery_notes: notes }).eq('id', currentUser.id);
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
    const sub           = cart.reduce((a, b) => a + b.price * b.qty, 0);
    const ship          = getShipCost(sub);
    const disc          = getDiscount(sub);
    const total         = sub + ship - disc;
    const zoneName      = selectedZoneKey ? ZONES[selectedZoneKey]?.name : '—';
    const itemsList     = cart.map(i => i.name + ' x' + i.qty).join(', ');
    const clienteNombre = (document.getElementById('ckName').value + ' ' + document.getElementById('ckLast').value).trim();
    const esRetiro      = ZONES[selectedZoneKey]?.pickup;
    const calle         = document.getElementById('ckStreet')?.value || '';
    const ciudad        = document.getElementById('ckCity')?.value   || '';
    const depto         = document.getElementById('ckDepto')?.value  || '';
    const direccion     = esRetiro ? 'Retiro en local' : [calle, ciudad, depto].filter(Boolean).join(' - ');
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
      status:    'Pendiente',
      coupon:    appliedCoupon || null,
      discount:  Math.round(disc),
    };

    const res = await fetch(SUPABASE_URL + '/rest/v1/orders', {
      method: 'POST',
      headers: {
        'apikey': SUPABASE_ANON_KEY,
        'Authorization': 'Bearer ' + SUPABASE_ANON_KEY,
        'Content-Type': 'application/json',
        'Prefer': 'return=minimal',
      },
      body: JSON.stringify(order),
    });

    if (!res.ok) {
      const msg = await res.text();
      showToast('❌ Error al guardar el pedido');
      console.error('Insert error:', msg);
      return;
    }

    document.getElementById('orderNum').textContent = num;
    const msg = encodeURIComponent('Hola! Confirmé mi pedido ' + num + ' por $' + total.toLocaleString('es-AR') + ' (' + zoneName + '). ¡Gracias!');
    document.getElementById('waConfirmBtn').href = 'https://wa.me/' + WA_NUMBER + '?text=' + msg;

    cart = [];
    selectedZoneKey = '';
    appliedCoupon = null;
    updateCartUI();
    showPage('confirm');
    updateAdminStats();

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
  document.getElementById('modalPrice').textContent = '$' + p.price.toLocaleString('es-AR');
  document.getElementById('modalQty').textContent   = 1;
  let badge = '';
  if      (p.badge === 'promo')   badge = '<span class="badge badge-promo" style="margin-bottom:8px;display:inline-block">🔥 Oferta especial</span>';
  else if (p.badge === 'sintacc') badge = '<span class="badge badge-sintacc" style="margin-bottom:8px;display:inline-block">Sin TACC</span>';
  document.getElementById('modalBadge').innerHTML   = badge;
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
    const hdrs = { 'apikey': SUPABASE_ANON_KEY, 'Authorization': 'Bearer ' + SUPABASE_ANON_KEY };
    let orders = await fetch(
      SUPABASE_URL + '/rest/v1/orders?user_id=eq.' + currentUser.id + '&order=created_at.desc',
      { headers: hdrs }
    ).then(r => r.json()).catch(() => []);
    if (!orders?.length && currentUser?.name) {
      const byName = await fetch(
        SUPABASE_URL + '/rest/v1/orders?user_name=eq.' + encodeURIComponent(currentUser.name) + '&order=created_at.desc',
        { headers: hdrs }
      ).then(r => r.json()).catch(() => []);
      if (byName?.length) orders = byName;
    }
    el2.innerHTML = orders && orders.length
      ? orders.map(o => `
        <div class="order-row">
          <div>
            <div style="font-weight:500">${o.id}</div>
            <div style="font-size:12px;color:var(--gray)">${o.items} · ${o.date} · ${o.zone || '—'}</div>
          </div>
          <div style="text-align:right">
            <div class="order-status ${o.status === 'Entregado' ? 'status-delivered' : o.status === 'En camino' ? 'status-processing' : 'status-pending'}">${o.status}</div>
            <div style="font-weight:600;font-size:13px;margin-top:3px">$${o.total.toLocaleString('es-AR')}</div>
          </div>
        </div>`).join('')
      : '<p style="color:var(--gray);font-size:14px">Todavía no tenés pedidos.</p>';
  }
}

// ===== ADMIN =====
async function doAdminLogin() {
  const hash = await sha256(document.getElementById('adminPass').value);
  if (hash === ADMIN_PASS_HASH) {
    showToast('✓ Bienvenido al panel');
    setTimeout(() => showPage('admin'), 400);
  } else {
    showToast('❌ Contraseña incorrecta');
  }
}

async function showAdminTab(tab, el) {
  document.querySelectorAll('.admin-nav-item').forEach(x => x.classList.remove('active'));
  el.classList.add('active');
  ['Dashboard', 'Products', 'Orders', 'Customers', 'Catering', 'Mayorista', 'Videos'].forEach(t => {
    const e = document.getElementById('admin' + t);
    if (e) e.style.display = 'none';
  });
  const target = document.getElementById('admin' + tab.charAt(0).toUpperCase() + tab.slice(1));
  if (target) target.style.display = 'block';
  if (tab === 'customers')  renderCustomersTable();
  if (tab === 'orders')     renderAllOrdersTable();
  if (tab === 'catering')   loadAdminCatering();
  if (tab === 'mayorista')  loadAdminMayorista();
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
    sb.from('orders').select('total, created_at, id, date, user_name, zone, direccion, status').order('created_at', { ascending: false }),
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

function showToast(msg) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(t._t);
  t._t = setTimeout(() => t.classList.remove('show'), 2800);
}

init();
