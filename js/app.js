// ===== CATEGORÍAS =====
const CATS_DEF = [
  { name: 'PROMOCIONES', emoji: '🔥', label: 'Promos' },
  { name: 'PIZZAS',      emoji: '🍕', label: 'Pizzas' },
  { name: 'EMPANADAS',   emoji: '🥟', label: 'Empanadas' },
  { name: 'TARTAS',      emoji: '🥧', label: 'Tartas' },
  { name: 'SIN TACC',    emoji: '🌾', label: 'Sin TACC' },
  { name: 'MILANESAS',   emoji: '🥩', label: 'Milanesas' },
  { name: 'CATERING',    emoji: '🎉', label: 'Catering' },
];

// ===== ESTADO GLOBAL =====
let products = [];
let ZONES = {};
let COUPONS = {};
let cart = [];
let currentFilter = 'Todos';
let modalQtyVal = 1;
let selectedZoneKey = '';
let currentVideoSlot = 0;
let currentNosotrosSlot = 0;
let cateringLeads   = JSON.parse(localStorage.getItem('eds_catering')      || '[]');
let registeredUsers = JSON.parse(localStorage.getItem('eds_users')         || '[]');
let allOrders       = JSON.parse(localStorage.getItem('eds_orders')        || '[]');
let currentUser     = JSON.parse(localStorage.getItem('eds_current_user')  || 'null');

// ===== UTILIDADES =====
async function sha256(str) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(str));
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
}

// ===== INICIALIZACIÓN =====
function init() {
  products = PRODUCTOS;
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
  updateAdminStats();
  cateringLeads.forEach(l => appendCateringRow(l));

  document.getElementById('regZone').addEventListener('change', function () {
    document.getElementById('otherZoneGroup').style.display = this.value === 'Otra zona' ? 'block' : 'none';
  });

  if (currentUser) updateNavForUser();
}

// ===== RENDER =====
function renderHomeCats() {
  document.getElementById('homeCats').innerHTML = CATS_DEF.map(c => `
    <div class="cat-card" onclick="${c.name === 'CATERING' ? "showPage('catering')" : `filterAndShow('${c.name}')`}">
      <div class="cat-emoji">${c.emoji}</div>
      <div class="cat-name">${c.label}</div>
      <div class="cat-count">${c.name === 'CATERING' ? 'Consultar' : products.filter(p => p.cat === c.name).length + ' items'}</div>
    </div>`).join('');
}

function renderFeaturedProducts() {
  const ids = [1, 19, 4, 28];
  document.getElementById('featuredProducts').innerHTML = ids
    .map(id => products.find(p => p.id === id))
    .filter(Boolean)
    .map(productCard)
    .join('');
}

function renderShopCats() {
  const all = [{ name: 'Todos', emoji: '🛒', label: 'Todos' }, ...CATS_DEF];
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

function renderCustomersTable() {
  const users = JSON.parse(localStorage.getItem('eds_users') || '[]');
  const tbody = document.getElementById('customersBody');
  if (!tbody) return;
  tbody.innerHTML = users.length
    ? users.map(u => `<tr><td><b>${u.name} ${u.last || ''}</b></td><td>${u.email}</td><td>${u.phone || '—'}</td><td>${u.zone || '—'}</td><td>${u.date}</td></tr>`).join('')
    : '<tr><td colspan="5" style="color:var(--gray);text-align:center;padding:16px">Sin usuarios todavía</td></tr>';
  updateAdminStats();
}

function renderAllOrdersTable() {
  const orders = JSON.parse(localStorage.getItem('eds_orders') || '[]');
  [document.getElementById('allOrdersTbody'), document.getElementById('adminOrdersTbody')].forEach(tbody => {
    if (!tbody) return;
    tbody.innerHTML = orders.length
      ? orders.map(o => `
        <tr>
          <td>${o.id}</td>
          <td>${o.date}</td>
          <td>${o.user}</td>
          <td>${o.zone || '—'}${o.direccion && o.direccion !== 'Retiro en local' ? ' — ' + o.direccion : ''}</td>
          <td>$${o.total.toLocaleString('es-AR')}</td>
          <td><span class="order-status ${o.status === 'Entregado' ? 'status-delivered' : o.status === 'En camino' ? 'status-processing' : 'status-pending'}">${o.status}</span></td>
          <td>
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
  const sub = cart.reduce((a, b) => a + b.price * b.qty, 0);
  document.getElementById('cartSubtotal').textContent    = '$' + sub.toLocaleString('es-AR');
  document.getElementById('cartShipDisplay').textContent = selectedZoneKey === '' ? 'Seleccioná zona en checkout' : getShipCostDisplay(sub);
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

function getTotal(sub) { return sub + getShipCost(sub); }

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

function applyCoupon() {
  const code = document.getElementById('couponInput').value.toUpperCase();
  if (COUPONS[code]) {
    const sub  = cart.reduce((a, b) => a + b.price * b.qty, 0);
    const disc = Math.round(sub * COUPONS[code]);
    document.getElementById('discountRow').style.display = 'flex';
    document.getElementById('discountAmt').textContent   = '-$' + disc.toLocaleString('es-AR');
    document.getElementById('cartTotal').textContent     = '$' + (sub + getShipCost(sub) - disc).toLocaleString('es-AR');
    showToast('🎉 Cupón aplicado: ' + Math.round(COUPONS[code] * 100) + '% off');
  } else {
    showToast('❌ Cupón no válido');
  }
}

function openCart()  { document.getElementById('cartOverlay').classList.add('open'); document.getElementById('cartSidebar').classList.add('open'); }
function closeCart() { document.getElementById('cartOverlay').classList.remove('open'); document.getElementById('cartSidebar').classList.remove('open'); }

function goCheckout() {
  if (!cart.length) { showToast('❌ Tu carrito está vacío'); return; }
  closeCart();
  showPage('checkout');
  updateOrderSummary();
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
  const sub = cart.reduce((a, b) => a + b.price * b.qty, 0);
  if (document.getElementById('summarySubtotal')) document.getElementById('summarySubtotal').textContent = '$' + sub.toLocaleString('es-AR');
  if (document.getElementById('summaryShip'))     document.getElementById('summaryShip').textContent     = getShipCostDisplay(sub);
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

function confirmOrder() {
  const num           = '#EDS-' + String(Math.floor(Math.random() * 89999) + 10000);
  const sub           = cart.reduce((a, b) => a + b.price * b.qty, 0);
  const ship          = getShipCost(sub);
  const total         = sub + ship;
  const zoneName      = selectedZoneKey ? ZONES[selectedZoneKey]?.name : '—';
  const itemsList     = cart.map(i => i.name + ' x' + i.qty).join(', ');
  const clienteNombre = (document.getElementById('ckName').value + ' ' + document.getElementById('ckLast').value).trim();
  const esRetiro      = ZONES[selectedZoneKey]?.pickup;
  const calle         = document.getElementById('ckStreet')?.value || '';
  const ciudad        = document.getElementById('ckCity')?.value   || '';
  const depto         = document.getElementById('ckDepto')?.value  || '';
  const direccion     = esRetiro ? 'Retiro en local' : [calle, ciudad, depto].filter(Boolean).join(' - ');
  const fecha         = new Date().toLocaleDateString('es-AR');
  const order         = { id: num, date: fecha, items: itemsList, total, ship, zone: zoneName, direccion, status: 'Pendiente', user: currentUser ? currentUser.name : clienteNombre };

  allOrders.unshift(order);
  localStorage.setItem('eds_orders', JSON.stringify(allOrders));

  document.getElementById('orderNum').textContent = num;
  const msg = encodeURIComponent('Hola! Confirmé mi pedido ' + num + ' por $' + total.toLocaleString('es-AR') + ' (' + zoneName + '). ¡Gracias!');
  document.getElementById('waConfirmBtn').href = 'https://wa.me/' + WA_NUMBER + '?text=' + msg;

  cart = [];
  selectedZoneKey = '';
  updateCartUI();
  showPage('confirm');
  updateAdminStats();
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
function submitCatering() {
  const name   = document.getElementById('ctName').value.trim();
  const phone  = document.getElementById('ctPhone').value.trim();
  const zone   = document.getElementById('ctZone').value.trim();
  const guests = document.getElementById('ctGuests').value.trim();
  const type   = document.getElementById('ctType').value;
  const labels = { pizza_party: 'Pizza party', pizza_premium: 'Pizza premium', asado: 'Asado', menu_medida: 'Menú a medida' };
  if (!name || !phone || !zone || !guests || !type) { showToast('❌ Completá todos los campos'); return; }
  const fecha = new Date().toLocaleDateString('es-AR');
  const lead  = { name, phone, zone, guests, type: labels[type], date: fecha };
  cateringLeads.push(lead);
  localStorage.setItem('eds_catering', JSON.stringify(cateringLeads));
  appendCateringRow(lead);
  const c = document.getElementById('adminCateringCount');
  if (c) c.textContent = cateringLeads.length;
  const msg = encodeURIComponent('Hola El de Siempre! Quiero consultar por catering.\nNombre: ' + name + '\nZona: ' + zone + '\nPersonas: ' + guests + '\nTipo: ' + labels[type] + '\nTel: ' + phone);
  window.open('https://wa.me/' + WA_NUMBER + '?text=' + msg, '_blank');
  ['ctName', 'ctPhone', 'ctZone', 'ctGuests'].forEach(id => document.getElementById(id).value = '');
  document.getElementById('ctType').value = '';
  showToast('✓ Consulta enviada!');
  setTimeout(() => showPage('home'), 1800);
}

function appendCateringRow(l) {
  const tbody = document.getElementById('cateringBody');
  if (!tbody) return;
  if (tbody.querySelector('td[colspan]')) tbody.innerHTML = '';
  const tr = document.createElement('tr');
  tr.innerHTML = `<td><b>${l.name}</b></td><td>${l.phone}</td><td>${l.zone}</td><td>${l.guests}</td><td><span class="tag-catering">${l.type}</span></td><td>${l.date || '—'}</td>`;
  tbody.insertBefore(tr, tbody.firstChild);
}

// ===== AUTH =====
function switchAuth(type, btn) {
  document.querySelectorAll('.auth-tab').forEach(x => x.classList.remove('active'));
  btn.classList.add('active');
  document.getElementById('authLogin').style.display    = type === 'login'    ? 'block' : 'none';
  document.getElementById('authRegister').style.display = type === 'register' ? 'block' : 'none';
}

function doLogin() {
  const email = document.getElementById('loginEmail').value.trim().toLowerCase();
  if (!email) { showToast('❌ Ingresá tu email'); return; }
  const user  = registeredUsers.find(u => u.email === email);
  if (!user)  { showToast('❌ Email no encontrado'); return; }
  currentUser = user;
  localStorage.setItem('eds_current_user', JSON.stringify(user));
  updateNavForUser();
  showToast('✓ Sesión iniciada');
  setTimeout(() => showPage('account'), 500);
}

function doRegister() {
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
  if (registeredUsers.find(u => u.email === email)) { errEl.style.display = 'block'; showToast('❌ Este email ya está registrado'); return; }
  const finalZone = zone === 'Otra zona' ? zoneOther || 'Otra zona' : zone;
  const fecha     = new Date().toLocaleDateString('es-AR');
  const user      = { id: Date.now(), name, last, email, phone, zone: finalZone, date: fecha, orders: 0 };
  registeredUsers.unshift(user);
  localStorage.setItem('eds_users', JSON.stringify(registeredUsers));
  currentUser = user;
  localStorage.setItem('eds_current_user', JSON.stringify(user));
  updateAdminStats();
  updateNavForUser();
  showToast('✓ Cuenta creada exitosamente');
  setTimeout(() => showPage('account'), 500);
}

function updateNavForUser() {
  if (!currentUser) return;
  document.getElementById('acctAvatar').textContent = (currentUser.name[0] || 'U').toUpperCase();
  document.getElementById('acctName').textContent   = currentUser.name;
  document.getElementById('acctZone').textContent   = currentUser.zone || 'Sin zona';
  ['profName', 'profLast', 'profEmail', 'profPhone', 'profZone'].forEach((id, i) => {
    const el = document.getElementById(id);
    if (el) el.value = [currentUser.name, currentUser.last || '', currentUser.email, currentUser.phone || '', currentUser.zone || ''][i];
  });
}

function logout() {
  currentUser = null;
  localStorage.removeItem('eds_current_user');
  showPage('home');
  showToast('Sesión cerrada');
}

function showAccountTab(tab, el) {
  document.querySelectorAll('.account-nav-item').forEach(x => x.classList.remove('active'));
  el.classList.add('active');
  document.querySelectorAll('#accountContent>div').forEach(x => x.style.display = 'none');
  document.getElementById('tab-' + tab).style.display = 'block';
  if (tab === 'favorites') {
    document.getElementById('favoritesGrid').innerHTML = products.slice(0, 4).map(productCard).join('');
  }
  if (tab === 'orders') {
    const mine = allOrders.filter(o => o.user === (currentUser ? currentUser.name : 'Invitado'));
    const el2  = document.getElementById('myOrdersList');
    el2.innerHTML = mine.length
      ? mine.map(o => `
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

function showAdminTab(tab, el) {
  document.querySelectorAll('.admin-nav-item').forEach(x => x.classList.remove('active'));
  el.classList.add('active');
  ['Dashboard', 'Products', 'Orders', 'Customers', 'Catering', 'Videos'].forEach(t => {
    const e = document.getElementById('admin' + t);
    if (e) e.style.display = 'none';
  });
  const target = document.getElementById('admin' + tab.charAt(0).toUpperCase() + tab.slice(1));
  if (target) target.style.display = 'block';
  if (tab === 'customers') renderCustomersTable();
  if (tab === 'orders')    renderAllOrdersTable();
}

function updateAdminStats() {
  const u = JSON.parse(localStorage.getItem('eds_users')    || '[]');
  const o = JSON.parse(localStorage.getItem('eds_orders')   || '[]');
  const c = JSON.parse(localStorage.getItem('eds_catering') || '[]');
  ['adminUserCount', 'cusTotal'].forEach(id => { const e = document.getElementById(id); if (e) e.textContent = u.length; });
  const oc = document.getElementById('adminOrderCount');    if (oc) oc.textContent = o.length;
  const cc = document.getElementById('adminCateringCount'); if (cc) cc.textContent = c.length;
  const sm = document.getElementById('adminSalesMonth');
  if (sm) sm.textContent = '$' + o.reduce((a, x) => a + (x.total || 0), 0).toLocaleString('es-AR');
  if (document.getElementById('cusLast'))  document.getElementById('cusLast').textContent  = u.length ? u[0].date : '—';
  const today = new Date().toLocaleDateString('es-AR');
  if (document.getElementById('cusToday')) document.getElementById('cusToday').textContent = u.filter(x => x.date === today).length;
  renderAllOrdersTable();
}

function updateOrderStatus(id, status) {
  const orders = JSON.parse(localStorage.getItem('eds_orders') || '[]');
  const o = orders.find(x => x.id === id);
  if (o) { o.status = status; localStorage.setItem('eds_orders', JSON.stringify(orders)); showToast('✓ Estado actualizado'); }
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

function uploadNosotrosMedia(slot) {
  currentNosotrosSlot = slot;
  document.getElementById('nosotrosMediaInput').click();
}

function handleNosotrosUpload(input) {
  if (!input.files[0]) return;
  const file = input.files[0];
  const r    = new FileReader();
  r.onload = e => {
    const slot = document.getElementById('nslot' + currentNosotrosSlot);
    if (slot) {
      slot.innerHTML = file.type.startsWith('video/')
        ? `<video src="${e.target.result}" autoplay muted loop playsinline style="position:absolute;inset:0;width:100%;height:100%;object-fit:cover;border-radius:12px"></video>`
        : `<img src="${e.target.result}" style="position:absolute;inset:0;width:100%;height:100%;object-fit:cover;border-radius:12px">`;
      slot.onclick = null;
    }
    showToast('✓ Imagen/video actualizado');
  };
  r.readAsDataURL(file);
  input.value = '';
}

// ===== NAVEGACIÓN =====
function showPage(page) {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.getElementById('page-' + page).classList.add('active');
  window.scrollTo(0, 0);
  if (page === 'shop')    { renderShopCats(); renderShopProducts(products); }
  if (page === 'admin')   { renderProductEditList(); renderAllOrdersTable(); updateAdminStats(); }
  if (page === 'account') updateNavForUser();
}

function showToast(msg) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(t._t);
  t._t = setTimeout(() => t.classList.remove('show'), 2800);
}

init();
