(function () {
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
  const state = { user: null, token: null, packages: [], paymentMethods: [], siteSettings: {}, currentPackage: null, selectedPayment: null };
  function saveAuth(u, t) { state.user = u; state.token = t || null; if (t) localStorage.setItem('txe_token', t); localStorage.setItem('txe_user', JSON.stringify(u)); }
  function loadAuth() { state.token = localStorage.getItem('txe_token'); try { state.user = JSON.parse(localStorage.getItem('txe_user') || 'null'); } catch { state.user = null; } }
  function clearAuth() { state.user = null; state.token = null; localStorage.removeItem('txe_token'); localStorage.removeItem('txe_user'); }
  function escapeHtml(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }
  function fmtMoney(n) { n = Number(n) || 0; return n.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 2 }); }
  function statusPill(s) { return '<span class="status ' + s + '"><span class="dot"></span>' + s.replace('_', ' ') + '</span>'; }
  function toast(msg, type = '') {
    const el = document.createElement('div');
    el.className = 'toast ' + type;
    el.innerHTML = '<span style="font-size:18px">' + ({ ok: '✅', err: '⛔', warn: '⚠', info: 'ℹ' }[type] || '🔔') + '</span>' + escapeHtml(msg);
    $('#toasts').appendChild(el);
    setTimeout(() => { el.style.opacity = '0'; el.style.transform = 'translateY(8px)'; setTimeout(() => el.remove(), 250); }, 3500);
  }
  async function api(path, opts = {}) {
    const headers = { 'Content-Type': 'application/json', ...(opts.headers || {}) };
    if (state.token) headers.Authorization = 'Bearer ' + state.token;
    const res = await fetch(path, { ...opts, headers });
    let data = null; try { data = await res.json(); } catch { data = null; }
    if (!res.ok) throw new Error((data && data.error) || ('Request failed ' + res.status));
    return data;
  }
  function getRoute() { const h = (location.hash || '#/').replace('#', ''); return (h.startsWith('/') ? h : '/' + h).replace(/\/$/, '') || '/'; }
  function navigate(route) { if (!route.startsWith('/')) route = '/' + route; if (location.hash !== '#' + route) location.hash = '#' + route; else show(route); }
  window.addEventListener('hashchange', () => show(getRoute()));
  function show(route) {
    $$('.page').forEach(p => p.classList.remove('active'));
    const target = document.querySelector('.page[data-route="' + route + '"]') || document.querySelector('.page[data-route="/"]');
    target.classList.add('active');
    $$('[data-nav]').forEach(a => a.classList.toggle('active', a.dataset.nav === route));
    window.scrollTo({ top: 0, behavior: 'instant' });
    if (route === '/') renderHome(); else if (route === '/shop') renderShop(); else if (route === '/package') renderPackageDetail();
    else if (route === '/order') renderOrderForm(); else if (route === '/order-success') showOrderSuccess();
    else if (route === '/track') { $('#trackResult').innerHTML = ''; }
    else if (route === '/dashboard') renderDashboard(); else if (route === '/orders') renderOrders();
    else if (route === '/order-detail') renderOrderDetail(); else if (route === '/wallet') renderWallet();
    else if (route === '/rewards') renderRewards(); else if (route === '/referral') renderReferral();
    else if (route === '/profile') renderProfile(); else if (route === '/contact') renderContact();
    else if (route === '/admin') renderAdmin();
  }
  function renderNavCta() {
    const cta = $('#navCta');
    if (state.user) {
      cta.innerHTML = '<span class="tag tag-gold" style="margin-right:8px">' + escapeHtml(state.user.username) + (state.user.role === 'admin' ? ' · 🛡' : '') + '</span><button class="btn btn-sm" id="logoutBtn">Logout</button>';
      $('#logoutBtn').onclick = async () => { try { await api('/api/auth/logout', { method: 'POST' }); } catch {} clearAuth(); toast('Logged out', 'ok'); renderNavCta(); navigate('/'); };
    } else {
      cta.innerHTML = '<a class="btn btn-sm btn-primary" href="#/login" data-nav="/login">Login</a>';
    }
  }
  function packageCard(p) {
    const stock = p.stock === -1 || p.stock == null ? null : Number(p.stock);
    let stockHtml = '';
    if (stock !== null) {
      if (stock <= 0) stockHtml = '<div class="pkg-stock out">Out of stock</div>';
      else if (stock <= 20) stockHtml = '<div class="pkg-stock low">Only ' + stock + ' left</div>';
      else stockHtml = '<div class="pkg-stock">In stock</div>';
    }
    const priceOld = p.original_price ? '<span class="pkg-old">৳' + fmtMoney(p.original_price) + '</span>' : '';
    const disc = p.discount ? '<span class="pkg-discount">-' + p.discount + '%</span>' : '';
    return '<div class="pkg-card ' + (p.popular ? 'popular' : '') + ' ' + (p.badge ? 'featured' : '') + '">'
      + '<div class="pkg-badges">' + (p.badge ? '<span class="tag tag-gold">' + escapeHtml(p.badge) + '</span>' : '') + (p.popular ? '<span class="tag tag-popular">Popular</span>' : '') + '</div>'
      + '<div class="pkg-icon">💎</div><div class="pkg-title">' + escapeHtml(p.label) + '</div>'
      + '<div class="pkg-diamonds">' + Number(p.diamonds).toLocaleString() + ' Diamonds</div>'
      + '<div class="pkg-prices"><span class="pkg-price"><span class="cur">৳</span>' + fmtMoney(p.price) + '</span>' + priceOld + disc + '</div>'
      + stockHtml
      + '<div class="pkg-btn-row"><button class="btn" data-detail="' + p.id + '">Details</button>'
      + '<button class="btn btn-primary" data-order="' + p.id + '"' + (stock === 0 ? ' disabled' : '') + '>Order →</button></div></div>';
  }
  function wirePackageButtons() {
    $$('[data-order]').forEach(b => b.onclick = () => {
      const id = Number(b.dataset.order);
      const pkg = state.packages.find(p => p.id === id); state.currentPackage = pkg; navigate('/order');
    });
    $$('[data-detail]').forEach(b => b.onclick = () => navigate('/package?id=' + b.dataset.detail));
  }
  async function loadPackages() { try { const d = await api('/api/packages'); state.packages = d.packages || []; } catch { state.packages = []; } }
  async function loadPaymentMethods() { try { const d = await api('/api/admin/payment-settings'); state.paymentMethods = (d.methods || []).filter(m => Number(m.active) === 1); } catch { state.paymentMethods = []; } }
  async function loadSiteSettings() {
    try { const d = await api('/api/site-settings'); state.siteSettings = d.settings || {};
      if (state.siteSettings.notice) { const strip = $('#noticeStrip'); strip.classList.remove('hidden'); strip.innerHTML = '<span>📣</span><span style="flex:1">' + escapeHtml(state.siteSettings.notice) + '</span><span class="x" id="noticeClose">✕</span>'; $('#noticeClose').onclick = () => strip.classList.add('hidden'); }
    } catch {}
  }
  function renderHome() {
    const popular = state.packages.filter(p => p.popular).slice(0, 8);
    $('#popularPackages').innerHTML = (popular.length ? popular : state.packages.slice(0, 4)).map(p => packageCard(p)).join('');
    const specials = state.packages.filter(p => p.discount && p.discount > 0).slice(0, 6);
    $('#specialPackages').innerHTML = specials.map(p => packageCard(p)).join('');
    wirePackageButtons();
  }
  function renderShop() {
    const grid = $('#shopGrid'), search = $('#shopSearch');
    const draw = () => { const q = (search.value || '').toLowerCase(); const list = state.packages.filter(p => !q || p.label.toLowerCase().includes(q) || String(p.diamonds).includes(q)); grid.innerHTML = list.length ? list.map(packageCard).join('') : '<div class="muted">No packages match.</div>'; wirePackageButtons(); };
    search.oninput = draw; draw();
  }
  function renderPackageDetail() {
    const id = Number(new URLSearchParams((location.hash.split('?')[1] || '')).get('id'));
    const pkg = state.packages.find(p => p.id === id);
    const box = $('#packageDetail');
    if (!pkg) { box.innerHTML = '<div class="alert warn">Package not found.</div>'; return; }
    box.innerHTML = '<div class="card"><div class="flex" style="gap:18px;align-items:center;flex-wrap:wrap"><div class="pkg-icon" style="width:80px;height:80px;font-size:36px">💎</div><div style="flex:1;min-width:200px"><h2 style="font-family:var(--font-display);font-size:28px;margin:0">' + escapeHtml(pkg.label) + '</h2><div style="color:var(--neon-cyan);font-weight:700;margin-top:4px">' + Number(pkg.diamonds).toLocaleString() + ' Diamonds</div>' + (pkg.description ? '<p class="muted mt-12" style="margin:6px 0 0">' + escapeHtml(pkg.description) + '</p>' : '') + '<div class="pkg-prices mt-12"><span class="pkg-price"><span class="cur">৳</span>' + fmtMoney(pkg.price) + '</span>' + (pkg.original_price ? '<span class="pkg-old">৳' + fmtMoney(pkg.original_price) + '</span>' : '') + (pkg.discount ? '<span class="pkg-discount">-' + pkg.discount + '%</span>' : '') + '</div></div></div><div class="divider"></div><div class="flex gap-12" style="flex-wrap:wrap"><button class="btn btn-primary btn-lg" data-order="' + pkg.id + '">Order Now</button><a class="btn btn-lg" href="#/shop" data-nav="/shop">← Back to Shop</a></div></div>';
    wirePackageButtons();
  }
  function renderOrderForm() {
    const pkg = state.currentPackage;
    $('#orderPkgSummary').innerHTML = pkg ? ('<strong>' + escapeHtml(pkg.label) + '</strong> · ' + Number(pkg.diamonds).toLocaleString() + ' Diamonds · <strong style="color:var(--gold)">৳' + fmtMoney(pkg.price) + '</strong>') : ('<span class="muted">No package selected. <a href="#/shop" data-nav="/shop" style="color:var(--gold);font-weight:700">Choose one →</a></span>');
    const pm = $('#paymentMethods');
    pm.innerHTML = state.paymentMethods.length ? state.paymentMethods.map(m => '<div class="pay-card" data-pay="' + escapeHtml(m.method) + '"><div class="pay-head"><div class="pay-chip ' + escapeHtml(m.method) + '">' + escapeHtml(m.display_name[0]) + '</div><div><div class="pay-name">' + escapeHtml(m.display_name) + '</div><div class="pay-acc">' + escapeHtml(m.account_number || '') + '</div></div></div><div class="pay-instr">' + escapeHtml((m.instructions || '').slice(0, 110)) + ((m.instructions || '').length > 110 ? '…' : '') + '</div></div>').join('') : '<div class="alert warn" style="grid-column:1/-1">⚠ No payment methods configured yet. <a href="#/admin" data-nav="/admin" style="color:var(--gold);font-weight:700">Admin Panel → Payment Methods</a></div>';
    $$('#paymentMethods .pay-card').forEach(c => c.onclick = () => selectPayment(c.dataset.pay));
    if (!state.selectedPayment && state.paymentMethods[0]) selectPayment(state.paymentMethods[0].method);
    else if (state.selectedPayment) selectPayment(state.selectedPayment);
    $('#loginNudge').classList.toggle('hidden', !!state.user);
    $('#loginNudgeLink').onclick = (e) => { e.preventDefault(); navigate('/login'); };
    $('#submitOrderBtn').onclick = submitOrder;
  }
  function selectPayment(method) {
    state.selectedPayment = method;
    $$('#paymentMethods .pay-card').forEach(c => c.classList.toggle('selected', c.dataset.pay === method));
    const m = state.paymentMethods.find(x => x.method === method);
    if (m) { $('#payInstrBox').style.display = 'block'; $('#payInstrBox').innerHTML = '<strong>' + escapeHtml(m.display_name) + '</strong> · Pay to <strong>' + escapeHtml(m.account_number || '—') + '</strong><br/><span style="color:var(--text-dim)">' + escapeHtml(m.instructions || '') + '</span>'; $('#trxField').style.display = 'block'; }
    else { $('#payInstrBox').style.display = 'none'; $('#trxField').style.display = 'none'; }
  }
  async function submitOrder() {
    if (!state.user) { toast('Please login first', 'warn'); navigate('/login'); return; }
    if (!state.currentPackage) { toast('Pick a package first', 'warn'); navigate('/shop'); return; }
    const pkg = state.currentPackage;
    const payload = { player_uid: $('#playerUid').value.trim(), server_id: $('#serverId').value.trim(), customer_phone: $('#customerPhone').value.trim(), payment_method: state.selectedPayment, transaction_id: $('#trxId').value.trim(), note: $('#orderNote').value.trim() };
    if (pkg.id) payload.package_id = pkg.id; else payload.custom_diamonds = pkg.diamonds;
    try {
      const d = await api('/api/orders', { method: 'POST', body: JSON.stringify(payload) });
      toast('Order created!', 'ok'); sessionStorage.setItem('lastOrder', JSON.stringify(d.order)); navigate('/order-success');
    } catch (e) { toast(e.message, 'err'); }
  }
  function showOrderSuccess() {
    const raw = sessionStorage.getItem('lastOrder'); if (!raw) return;
    const o = JSON.parse(raw);
    $('#successBox').innerHTML = '<div class="alert success" style="text-align:left"><div class="muted" style="font-size:11px;letter-spacing:1px">ORDER ID</div><div style="font-family:var(--font-display);font-size:28px;color:var(--gold);font-weight:700;letter-spacing:1px;margin-bottom:8px">' + escapeHtml(o.id) + '</div><div class="grid grid-2"><div><div class="muted" style="font-size:11px;letter-spacing:1px">PACKAGE</div><div style="font-weight:700">' + escapeHtml(o.package_label || 'Custom') + '</div></div><div><div class="muted" style="font-size:11px;letter-spacing:1px">DIAMONDS</div><div style="font-weight:700;color:var(--neon-cyan)">' + Number(o.diamonds).toLocaleString() + '</div></div><div><div class="muted" style="font-size:11px;letter-spacing:1px">UID</div><div>' + escapeHtml(o.player_uid) + '</div></div><div><div class="muted" style="font-size:11px;letter-spacing:1px">AMOUNT</div><div style="font-weight:700;color:var(--gold)">৳' + fmtMoney(o.amount) + '</div></div><div><div class="muted" style="font-size:11px;letter-spacing:1px">PAYMENT</div><div>' + escapeHtml(o.payment_method) + '</div></div><div><div class="muted" style="font-size:11px;letter-spacing:1px">PAYMENT STATUS</div><div><span class="status pending_payment"><span class="dot"></span>Waiting verification</span></div></div><div style="grid-column:1/-1"><div class="muted" style="font-size:11px;letter-spacing:1px">ORDER STATUS</div><div>' + statusPill(o.status) + '</div></div></div></div>';
  }
  async function renderTrackResult(id) {
    const out = $('#trackResult'); if (!id) { out.innerHTML = ''; return; }
    out.innerHTML = '<div class="skeleton" style="height:140px"></div>';
    try {
      const d = await api('/api/orders/track/' + encodeURIComponent(id)); const o = d.order;
      out.innerHTML = '<div class="card"><div class="flex" style="justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px"><div><div class="muted" style="font-size:11px;letter-spacing:1px">ORDER ID</div><div style="font-family:var(--font-display);font-size:22px;color:var(--gold)">' + escapeHtml(o.id) + '</div></div><div class="flex" style="gap:8px;flex-wrap:wrap">' + statusPill(o.status) + '<button class="btn btn-sm" id="copyOid">Copy ID</button></div></div><div class="divider"></div><div class="grid grid-2 grid-4" style="gap:10px"><div><div class="muted" style="font-size:11px;letter-spacing:1px">PACKAGE</div><div style="font-weight:700">' + escapeHtml(o.package_label || 'Custom') + '</div></div><div><div class="muted" style="font-size:11px;letter-spacing:1px">DIAMONDS</div><div style="font-weight:700;color:var(--neon-cyan)">' + Number(o.diamonds).toLocaleString() + '</div></div><div><div class="muted" style="font-size:11px;letter-spacing:1px">AMOUNT</div><div style="font-weight:700;color:var(--gold)">৳' + fmtMoney(o.amount) + '</div></div><div><div class="muted" style="font-size:11px;letter-spacing:1px">PAYMENT</div><div style="font-weight:700">' + escapeHtml(o.payment_method) + '</div></div><div><div class="muted" style="font-size:11px;letter-spacing:1px">UID</div><div>' + escapeHtml(o.player_uid) + '</div></div><div><div class="muted" style="font-size:11px;letter-spacing:1px">PHONE</div><div>' + escapeHtml(o.customer_phone) + '</div></div><div><div class="muted" style="font-size:11px;letter-spacing:1px">CREATED</div><div>' + new Date(o.created_at).toLocaleString() + '</div></div><div><div class="muted" style="font-size:11px;letter-spacing:1px">LAST UPDATE</div><div>' + new Date(o.updated_at).toLocaleString() + '</div></div></div>' + (o.note ? ('<div class="alert info mt-12"><strong>Admin note:</strong> ' + escapeHtml(o.note) + '</div>') : '') + '</div>';
      $('#copyOid').onclick = () => { navigator.clipboard.writeText(o.id); toast('Order ID copied', 'ok'); };
    } catch (e) { out.innerHTML = '<div class="alert error">Order not found. Format: <code class="kbd">TXE-YYYYMMDD-NNNN</code>.</div>'; }
  }
  function orderRow(o) {
    return '<div class="card" style="padding:14px;margin-bottom:10px"><div class="flex" style="justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px"><div><div style="font-family:var(--font-display);font-weight:700;color:var(--gold)">' + escapeHtml(o.id) + '</div><div class="muted" style="font-size:12px">' + escapeHtml(o.package_label || 'Custom') + ' · ' + Number(o.diamonds).toLocaleString() + ' 💎 · ৳' + fmtMoney(o.amount) + '</div><div class="muted" style="font-size:11px">UID ' + escapeHtml(o.player_uid) + ' · ' + escapeHtml(o.payment_method) + ' · ' + new Date(o.created_at).toLocaleString() + '</div></div><div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">' + statusPill(o.status) + '<button class="btn btn-sm" data-detail1="' + escapeHtml(o.id) + '">View</button></div></div></div>';
  }
  async function renderDashboard() {
    const out = $('#dashboardContent');
    if (!state.user) { out.innerHTML = '<div class="alert warn">Please <a href="#/login" data-nav="/login" style="color:var(--gold);font-weight:700">login</a>.</div>'; $$('[data-nav]').forEach(a => a.onclick = () => navigate(a.dataset.nav)); return; }
    out.innerHTML = '<div class="skeleton" style="height:200px"></div>';
    try {
      const [me, mine] = await Promise.all([api('/api/auth/me'), api('/api/orders/mine')]);
      const u = me.user; const recent = (mine.orders || []).slice(0, 5);
      out.innerHTML = '<div class="grid grid-2 grid-4"><div class="stat"><div class="num" style="color:var(--gold)">৳' + fmtMoney(u.wallet_balance) + '</div><div class="label">Wallet Balance</div></div><div class="stat"><div class="num" style="color:var(--neon-cyan)">' + (state.user.role === 'admin' ? '🛡 Admin' : '💎 Player') + '</div><div class="label">Account Type</div></div><div class="stat"><div class="num">' + recent.length + '</div><div class="label">Recent Orders</div></div><div class="stat"><div class="num" style="color:var(--success)">' + (mine.orders || []).filter(o => o.status === 'completed').length + '</div><div class="label">Completed</div></div></div>'
        + '<div class="grid grid-2 mt-16"><div class="card"><h3 class="card-title">Account</h3><div style="display:flex;align-items:center;gap:12px;padding:6px 0"><div style="width:48px;height:48px;border-radius:14px;background:linear-gradient(135deg,var(--gold),#b8841d);display:grid;place-items:center;color:#1a1300;font-weight:800;font-family:var(--font-display);font-size:20px">' + escapeHtml((u.username || '?')[0].toUpperCase()) + '</div><div><div style="font-weight:700;font-family:var(--font-display);font-size:18px">' + escapeHtml(u.username) + '</div><div class="muted" style="font-size:12px">' + escapeHtml(u.email) + '</div></div></div><div class="flex gap-8 mt-12" style="flex-wrap:wrap"><a class="btn" href="#/profile" data-nav="/profile">Profile</a><a class="btn" href="#/orders" data-nav="/orders">My Orders</a><a class="btn" href="#/wallet" data-nav="/wallet">Wallet</a><a class="btn" href="#/referral" data-nav="/referral">Referrals</a>' + (state.user.role === 'admin' ? '<a class="btn btn-primary" href="#/admin" data-nav="/admin">🛡 Admin Panel</a>' : '') + '</div></div>'
        + '<div class="card"><h3 class="card-title">Your Referral Code</h3><p class="muted" style="font-size:13px">Share this — when a new player signs up using your code, both get the admin-set bonus (৳' + escapeHtml(state.siteSettings.referral_bonus || '0') + ').</p><div class="alert info mt-12" style="display:flex;align-items:center;gap:10px;flex-wrap:wrap"><code style="font-family:monospace;font-weight:700;font-size:14px;background:transparent;border:0;color:inherit">' + escapeHtml(u.referral_code) + '</code><button class="btn btn-sm btn-primary" id="copyCode">Copy</button></div></div></div>'
        + '<div class="card mt-24"><div class="flex" style="justify-content:space-between;align-items:center;gap:8px;flex-wrap:wrap"><h3 class="card-title" style="margin:0">Recent Orders</h3><a class="btn btn-sm" href="#/orders" data-nav="/orders">See all →</a></div>' + (recent.length ? recent.map(orderRow).join('') : '<div class="muted mt-12">No orders yet — go to <a href="#/shop" data-nav="/shop" style="color:var(--gold);font-weight:700">Shop</a>.</div>') + '</div>';
      $$('[data-nav]').forEach(a => a.onclick = () => navigate(a.dataset.nav));
      $('#copyCode').onclick = () => { navigator.clipboard.writeText(u.referral_code); toast('Code copied', 'ok'); };
    } catch (e) { out.innerHTML = '<div class="alert error">' + e.message + '</div>'; }
  }
  async function renderOrders() {
    const out = $('#ordersList');
    if (!state.user) { out.innerHTML = '<div class="alert warn">Please <a href="#/login" data-nav="/login" style="color:var(--gold);font-weight:700">login</a>.</div>'; $$('[data-nav]').forEach(a => a.onclick = () => navigate(a.dataset.nav)); return; }
    out.innerHTML = '<div class="skeleton" style="height:200px"></div>';
    try {
      const d = await api('/api/orders/mine'); const orders = d.orders || [];
      if (!orders.length) { out.innerHTML = '<div class="alert info">No orders yet · <a href="#/shop" data-nav="/shop" style="color:var(--gold);font-weight:700">place your first top-up</a>.</div>'; return; }
      out.innerHTML = orders.map(o => '<div class="card" style="margin-bottom:10px"><div class="flex" style="justify-content:space-between;align-items:center;flex-wrap:wrap;gap:10px"><div><div style="font-family:var(--font-display);font-weight:700;color:var(--gold)">' + escapeHtml(o.id) + '</div><div class="muted" style="font-size:12px">' + escapeHtml(o.package_label || 'Custom') + ' · ' + Number(o.diamonds).toLocaleString() + ' 💎 · ৳' + fmtMoney(o.amount) + '</div><div class="muted" style="font-size:11px">UID ' + escapeHtml(o.player_uid) + ' · ' + escapeHtml(o.payment_method) + ' · ' + new Date(o.created_at).toLocaleString() + '</div></div><div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">' + statusPill(o.status) + '<button class="btn btn-sm" data-detail1="' + escapeHtml(o.id) + '">View</button></div></div></div>').join('');
      $$('[data-detail1]').forEach(b => b.onclick = () => navigate('/order-detail?id=' + encodeURIComponent(b.dataset.detail1)));
    } catch (e) { out.innerHTML = '<div class="alert error">' + e.message + '</div>'; }
  }
  async function renderOrderDetail() {
    const box = $('#orderDetailContainer'); const id = new URLSearchParams((location.hash.split('?')[1] || '')).get('id');
    if (!id) return navigate('/orders');
    box.innerHTML = '<div class="skeleton" style="height:200px"></div>';
    try {
      const d = await api('/api/orders/track/' + encodeURIComponent(id)); const o = d.order;
      box.innerHTML = '<div class="card"><div class="flex" style="justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px"><div><div class="muted" style="font-size:11px;letter-spacing:1px">ORDER ID</div><div style="font-family:var(--font-display);font-size:26px;color:var(--gold)">' + escapeHtml(o.id) + '</div></div>' + statusPill(o.status) + '</div><div class="divider"></div><div class="grid grid-2 grid-4"><div><div class="muted" style="font-size:11px;letter-spacing:1px">PACKAGE</div><div style="font-weight:700">' + escapeHtml(o.package_label || 'Custom') + '</div></div><div><div class="muted" style="font-size:11px;letter-spacing:1px">DIAMONDS</div><div style="font-weight:700;color:var(--neon-cyan)">' + Number(o.diamonds).toLocaleString() + '</div></div><div><div class="muted" style="font-size:11px;letter-spacing:1px">AMOUNT</div><div style="font-weight:700;color:var(--gold)">৳' + fmtMoney(o.amount) + '</div></div><div><div class="muted" style="font-size:11px;letter-spacing:1px">DISCOUNT</div><div>' + (o.discount ? o.discount + '%' : '—') + '</div></div><div><div class="muted" style="font-size:11px;letter-spacing:1px">UID</div><div>' + escapeHtml(o.player_uid) + '</div></div><div><div class="muted" style="font-size:11px;letter-spacing:1px">SERVER</div><div>' + escapeHtml(o.server_id || '—') + '</div></div><div><div class="muted" style="font-size:11px;letter-spacing:1px">PHONE</div><div>' + escapeHtml(o.customer_phone) + '</div></div><div><div class="muted" style="font-size:11px;letter-spacing:1px">PAYMENT</div><div>' + escapeHtml(o.payment_method) + '</div></div><div><div class="muted" style="font-size:11px;letter-spacing:1px">TRX ID</div><div>' + escapeHtml(o.transaction_id || '—') + '</div></div><div><div class="muted" style="font-size:11px;letter-spacing:1px">CREATED</div><div>' + new Date(o.created_at).toLocaleString() + '</div></div><div><div class="muted" style="font-size:11px;letter-spacing:1px">UPDATED</div><div>' + new Date(o.updated_at).toLocaleString() + '</div></div><div><div class="muted" style="font-size:11px;letter-spacing:1px">DELIVERY</div><div>' + escapeHtml(o.delivery_status || '—') + '</div></div></div>' + (o.note ? '<div class="alert info mt-16"><strong>Admin note:</strong> ' + escapeHtml(o.note) + '</div>' : '') + '<div class="flex gap-8 mt-16" style="flex-wrap:wrap"><a class="btn" href="#/orders" data-nav="/orders">← Back</a><a class="btn" href="#/track" data-nav="/track">Track Another</a></div></div>';
      $$('[data-nav]').forEach(a => a.onclick = () => navigate(a.dataset.nav));
    } catch (e) { box.innerHTML = '<div class="alert error">' + e.message + '</div>'; }
  }
  async function renderWallet() {
    const out = $('#walletContent');
    if (!state.user) { out.innerHTML = '<div class="alert warn">Please <a href="#/login" data-nav="/login" style="color:var(--gold);font-weight:700">login</a>.</div>'; $$('[data-nav]').forEach(a => a.onclick = () => navigate(a.dataset.nav)); return; }
    out.innerHTML = '<div class="skeleton" style="height:200px"></div>';
    try {
      const d = await api('/api/wallet/me');
      out.innerHTML = '<div class="grid grid-2"><div class="card" style="display:flex;align-items:center;justify-content:space-between;gap:14px;flex-wrap:wrap"><div><div class="muted" style="font-size:11px;letter-spacing:1px">CURRENT BALANCE</div><div style="font-family:var(--font-display);font-size:38px;color:var(--gold);font-weight:700">৳' + fmtMoney(d.balance) + '</div></div><div class="muted" style="font-size:12px;text-align:right">Wallet holds in-app value usable<br/>for top-ups and rewards.</div></div>' + '<div class="card"><h3 class="card-title">+ Add Money (Demo)</h3><p class="muted" style="font-size:13px">Demo build with mock flow. Connect a real gateway before accepting real money.</p><div class="row row-2"><div class="field"><label>Amount (৳)</label><input class="input" id="topAmt" type="number" min="10" value="100"/></div><div class="field"><label>Payment Method</label><select class="input" id="topMethod">' + state.paymentMethods.map(m => '<option value="' + escapeHtml(m.method) + '">' + escapeHtml(m.display_name) + '</option>').join('') + '</select></div></div><div class="field"><label>Mock Transaction ID</label><input class="input" id="topTrx" value="DEMO' + Date.now().toString().slice(-6) + '"/></div><button class="btn btn-primary btn-block" id="topupBtn">Add to Wallet (DEMO)</button></div></div>' + '<div class="card mt-24"><h3 class="card-title">Transaction History</h3>' + ((d.transactions || []).length ? ('<div class="tbl-wrap"><table class="tbl"><thead><tr><th>Type</th><th style="text-align:right">Amount</th><th style="text-align:right">Balance</th><th>When</th><th>Note</th></tr></thead><tbody>' + d.transactions.map(t => '<tr><td><span class="tag">' + escapeHtml(t.type) + '</span></td><td style="text-align:right;color:' + (t.amount >= 0 ? 'var(--success)' : 'var(--danger)') + ';font-weight:700">' + (t.amount >= 0 ? '+' : '') + '৳' + fmtMoney(t.amount) + '</td><td style="text-align:right">৳' + fmtMoney(t.balance_after) + '</td><td>' + new Date(t.created_at).toLocaleString() + '</td><td class="muted">' + escapeHtml(t.note || '') + '</td></tr>').join('') + '</tbody></table></div>') : '<div class="muted">No transactions yet.</div>') + '</div>';
      $('#topupBtn').onclick = async () => { try { const r = await api('/api/wallet/topup', { method: 'POST', body: JSON.stringify({ amount: Number($('#topAmt').value), payment_method: $('#topMethod').value, transaction_id: $('#topTrx').value }) }); toast('Demo top-up: ৳' + r.balance.toLocaleString(), 'ok'); renderWallet(); } catch (e) { toast(e.message, 'err'); } };
    } catch (e) { out.innerHTML = '<div class="alert error">' + e.message + '</div>'; }
  }
  async function renderRewards() {
    if (!state.user) { $('#rewardsHistory').innerHTML = '<div class="alert warn">Please <a href="#/login" data-nav="/login" style="color:var(--gold);font-weight:700">login</a>.</div>'; $$('[data-nav]').forEach(a => a.onclick = () => navigate(a.dataset.nav)); return; }
    try {
      const d = await api('/api/wallet/rewards/history');
      $('#rewardsHistory').innerHTML = (d.rewards && d.rewards.length) ? ('<div class="tbl-wrap"><table class="tbl"><thead><tr><th>Type</th><th style="text-align:right">Amount</th><th>Description</th><th>When</th></tr></thead><tbody>' + d.rewards.map(r => '<tr><td><span class="tag tag-gold">' + escapeHtml(r.reward_type) + '</span></td><td style="text-align:right;color:var(--gold);font-weight:700">৳' + fmtMoney(r.amount) + '</td><td>' + escapeHtml(r.description || '') + '</td><td class="muted">' + new Date(r.created_at).toLocaleString() + '</td></tr>').join('') + '</tbody></table></div>') : '<div class="muted">No rewards yet. Claim your daily bonus above!</div>';
    } catch {}
    $('#dailyClaimBtn').onclick = async () => { try { const r = await api('/api/wallet/reward/daily', { method: 'POST' }); toast('+৳' + r.claimed + ' daily bonus', 'ok'); renderRewards(); } catch (e) { toast(e.message, 'warn'); } };
  }
  async function spinWheel() {
    try {
      const wheel = $('#wheel');
      wheel.style.transition = 'transform 1s ease';
      wheel.style.transform = 'rotate(' + (Math.random() * 360) + 'deg)';
      const r = await api('/api/wallet/reward/spin', { method: 'POST' });
      setTimeout(() => {
        wheel.style.transition = 'transform 4s cubic-bezier(0.18,0.9,0.2,1)';
        wheel.style.transform = 'rotate(' + (360 * 5 + Math.random() * 360) + 'deg)';
        const msg = r.prize > 0 ? ('🎉 You won ৳' + r.prize + '! Balance: ৳' + r.balance) : 'No win this time — try tomorrow.';
        $('#spinResult').innerHTML = '<strong>' + msg + '</strong>';
        $('#spinResult').className = (r.prize > 0 ? 'alert success text-center mt-16' : 'alert warn text-center mt-16');
        toast(r.prize > 0 ? ('Spin won: ৳' + r.prize) : 'Spin complete', r.prize > 0 ? 'ok' : 'warn');
      }, 80);
    } catch (e) { toast(e.message, 'err'); }
  }
  async function renderReferral() {
    const out = $('#referralContent');
    if (!state.user) { out.innerHTML = '<div class="alert warn">Please <a href="#/login" data-nav="/login" style="color:var(--gold);font-weight:700">login</a>.</div>'; $$('[data-nav]').forEach(a => a.onclick = () => navigate(a.dataset.nav)); return; }
    out.innerHTML = '<div class="skeleton" style="height:200px"></div>';
    try {
      const me = await api('/api/auth/me'); const refs = await api('/api/wallet/referrals');
      const bonus = state.siteSettings.referral_bonus || '0';
      out.innerHTML = '<div class="grid grid-2"><div class="card"><h3 class="card-title">Your Referral Code</h3><p class="muted" style="font-size:13px">When a new player signs up with this code, both get ৳' + escapeHtml(bonus) + ' (admin-configurable).</p><div class="alert info mt-12" style="display:flex;align-items:center;gap:10px;flex-wrap:wrap"><code style="font-family:monospace;font-weight:700;background:transparent;border:0;color:inherit;font-size:14px">' + escapeHtml(me.user.referral_code) + '</code><button class="btn btn-sm btn-primary" id="refCopy">Copy</button></div></div><div class="card"><h3 class="card-title">People You Referred</h3>' + (refs.referrals.length ? ('<div class="tbl-wrap"><table class="tbl"><thead><tr><th>User</th><th>Joined</th><th style="text-align:right">Bonus</th></tr></thead><tbody>' + refs.referrals.map(r => '<tr><td>' + escapeHtml(r.username) + ' <span class="muted">' + escapeHtml(r.email) + '</span></td><td>' + new Date(r.created_at).toLocaleDateString() + '</td><td style="text-align:right;color:var(--gold)">৳' + fmtMoney(r.bonus) + '</td></tr>').join('') + '</tbody></table></div>') : '<div class="muted">No referrals yet.</div>') + '</div></div>';
      $('#refCopy').onclick = () => { navigator.clipboard.writeText(me.user.referral_code); toast('Copied', 'ok'); };
    } catch (e) { out.innerHTML = '<div class="alert error">' + e.message + '</div>'; }
  }
  async function renderProfile() {
    const out = $('#profileContent');
    if (!state.user) { out.innerHTML = '<div class="alert warn">Please <a href="#/login" data-nav="/login" style="color:var(--gold);font-weight:700">login</a>.</div>'; return; }
    out.innerHTML = '<div class="skeleton" style="height:200px"></div>';
    try {
      const me = await api('/api/auth/me'); const u = me.user;
      out.innerHTML = '<div class="grid grid-2"><div class="card"><h3 class="card-title">Profile</h3><div class="field"><label>Username</label><input class="input" value="' + escapeHtml(u.username) + '" disabled/></div><div class="field"><label>Email</label><input class="input" value="' + escapeHtml(u.email) + '" disabled/></div><div class="field"><label>Phone</label><input class="input" value="' + escapeHtml(u.phone || '') + '" disabled/><div class="hint">Phone updates not exposed in demo build.</div></div><div class="field"><label>Wallet Balance</label><input class="input" value="৳' + fmtMoney(u.wallet_balance) + '" disabled/></div></div><div class="card"><h3 class="card-title">Change Password</h3><div class="field"><label>Current Password</label><input class="input" id="oldPw" type="password"/></div><div class="field"><label>New Password (min 6 chars)</label><input class="input" id="newPw" type="password"/></div><button class="btn btn-primary btn-block" id="cpBtn">Update Password</button></div></div>';
      $('#cpBtn').onclick = async () => { try { await api('/api/auth/change-password', { method: 'POST', body: JSON.stringify({ old_password: $('#oldPw').value, new_password: $('#newPw').value }) }); toast('Password updated', 'ok'); $('#oldPw').value=''; $('#newPw').value=''; } catch (e) { toast(e.message, 'err'); } };
    } catch (e) { out.innerHTML = '<div class="alert error">' + e.message + '</div>'; }
  }
  function renderContact() {
    const s = state.siteSettings;
    $('#contactBlock').innerHTML = '<div class="field"><div class="muted" style="font-size:11px;letter-spacing:1px">EMAIL</div><div style="font-weight:700">' + escapeHtml(s.support_email || '—') + '</div></div><div class="field"><div class="muted" style="font-size:11px;letter-spacing:1px">PHONE</div><div style="font-weight:700">' + escapeHtml(s.support_phone || '—') + '</div></div><div class="field"><div class="muted" style="font-size:11px;letter-spacing:1px">ADDRESS</div><div>' + escapeHtml(s.contact_address || '—') + '</div></div><div class="divider"></div><div class="flex gap-12" style="flex-wrap:wrap">' + (s.social_facebook ? '<a class="btn" target="_blank" rel="noopener" href="' + escapeHtml(s.social_facebook) + '">Facebook</a>' : '') + (s.social_telegram ? '<a class="btn" target="_blank" rel="noopener" href="' + escapeHtml(s.social_telegram) + '">Telegram</a>' : '') + (s.social_whatsapp ? '<a class="btn" target="_blank" rel="noopener" href="' + escapeHtml(s.social_whatsapp) + '">WhatsApp</a>' : '') + '</div>';
  }
  async function renderAdmin() {
    const guard = $('#adminGuard'), content = $('#adminContent');
    if (!state.user || state.user.role !== 'admin') {
      guard.className = 'alert warn'; guard.innerHTML = '⚠ Admin access required. <a href="#/login" data-nav="/login" style="color:var(--gold);font-weight:700">Login as admin →</a>';
      guard.classList.remove('hidden'); $$('[data-nav]').forEach(a => a.onclick = () => navigate(a.dataset.nav)); content.classList.add('hidden'); return;
    }
    guard.classList.add('hidden'); content.classList.remove('hidden'); content.innerHTML = '<div class="skeleton" style="height:200px"></div>';
    try {
      const [stats, orders, users, pay, settings] = await Promise.all([api('/api/admin/stats'), api('/api/admin/orders'), api('/api/admin/users'), api('/api/admin/payment-settings'), api('/api/admin/site-settings')]);
      const t = stats.totals || {}; const s = settings.settings || {};
      content.innerHTML = '<div class="grid grid-2 grid-4"><div class="stat"><div class="num">' + stats.user_count + '</div><div class="label">Total Users</div></div><div class="stat"><div class="num">' + t.total_orders + '</div><div class="label">Total Orders</div></div><div class="stat"><div class="num" style="color:var(--warn)">' + (t.pending||0) + '</div><div class="label">Pending Payment</div></div><div class="stat"><div class="num" style="color:var(--success)">' + (t.completed||0) + '</div><div class="label">Completed</div></div><div class="stat"><div class="num" style="color:var(--danger)">' + ((t.cancelled||0)+(t.failed||0)) + '</div><div class="label">Cancelled / Failed</div></div><div class="stat"><div class="num" style="color:var(--gold)">৳' + fmtMoney(t.revenue) + '</div><div class="label">Total Revenue</div></div><div class="stat"><div class="num">৳' + fmtMoney(stats.wallet_total) + '</div><div class="label">Wallet Total</div></div><div class="stat"><div class="num" style="color:var(--neon-cyan)">' + stats.todays_orders + '</div><div class="label">Today\'s Orders</div></div></div>'
        + '<div class="card mt-24"><h3 class="card-title">📦 Orders</h3><div class="search-box"><input class="input" id="q" placeholder="Search by Order ID / UID / username…"/><select class="input" id="qstatus" style="max-width:160px"><option value="">All</option><option value="pending_payment">pending_payment</option><option value="payment_verification">payment_verification</option><option value="processing">processing</option><option value="completed">completed</option><option value="cancelled">cancelled</option><option value="failed">failed</option></select><button class="btn btn-primary" id="qbtn">Search</button></div><div class="tbl-wrap"><table class="tbl"><thead><tr><th>Order</th><th>User</th><th>UID</th><th>Package</th><th style="text-align:right">Amount</th><th>Payment</th><th>Status</th><th>Action</th></tr></thead><tbody id="ordersTbody"></tbody></table></div></div>'
        + '<div class="card mt-24"><h3 class="card-title">💎 Diamond Packages</h3><p class="muted" style="font-size:13px">Disable to hide from shop. Set stock — 0 means out of stock.</p><div class="tbl-wrap"><table class="tbl"><thead><tr><th>Label</th><th>Diamonds</th><th>Price</th><th>Original</th><th>Discount %</th><th>Stock</th><th>Badge</th><th>Popular</th><th>Active</th><th>Save</th></tr></thead><tbody id="pkgTbody"></tbody></table></div><div class="mt-16"><button class="btn" id="addPkg">+ Add new package</button></div></div>'
        + '<div class="card mt-24"><h3 class="card-title">👥 Users</h3><div class="search-box"><input class="input" id="uQ" placeholder="Search by username / email…"/><button class="btn" id="uQbtn">Search</button></div><div class="tbl-wrap"><table class="tbl"><thead><tr><th>User</th><th>Email</th><th>Role</th><th>Status</th><th>Wallet</th><th>Code</th><th>Joined</th><th>Save</th></tr></thead><tbody id="usersTbody"></tbody></table></div></div>'
        + '<div class="grid grid-2 mt-24"><div class="card"><h3 class="card-title">💳 Payment Methods</h3>' + pay.methods.map(m => '<div class="card" style="margin-bottom:10px;background:var(--bg-1)"><div class="row row-2"><div class="field"><label>Display</label><input class="input" data-pmn="' + m.id + '" value="' + escapeHtml(m.display_name) + '"/></div><div class="field"><label>Account Number (server-side only)</label><input class="input" data-pma="' + m.id + '" value="' + escapeHtml(m.account_number || '') + '"/></div></div><div class="field"><label>Instructions</label><textarea class="input" data-pmi="' + m.id + '">' + escapeHtml(m.instructions || '') + '</textarea></div><div class="flex gap-8"><button class="btn btn-sm btn-primary" data-pmsave="' + m.id + '">Save</button><button class="btn btn-sm" data-pmtoggle="' + m.id + '">' + (Number(m.active) ? 'Disable' : 'Enable') + '</button><span class="muted" style="align-self:center;font-size:12px">' + escapeHtml(m.method) + '</span></div></div>').join('') + '</div>'
        + '<div class="card"><h3 class="card-title">⚙ Site Settings</h3><div class="row row-2"><div class="field"><label>Site Name</label><input class="input" data-set="site_name" value="' + escapeHtml(s.site_name || 'TOPUP X ELITE') + '"/></div><div class="field"><label>Tagline</label><input class="input" data-set="site_tagline" value="' + escapeHtml(s.site_tagline || '') + '"/></div></div><div class="row row-2"><div class="field"><label>Logo Text</label><input class="input" data-set="logo_text" value="' + escapeHtml(s.logo_text || 'X') + '"/></div><div class="field"><label>Currency</label><input class="input" data-set="currency" value="' + escapeHtml(s.currency || '৳') + '"/></div></div><div class="row row-2"><div class="field"><label>Cashback %</label><input class="input" data-set="cashback_percent" value="' + escapeHtml(s.cashback_percent || '5') + '"/></div><div class="field"><label>Referral Bonus (৳)</label><input class="input" data-set="referral_bonus" value="' + escapeHtml(s.referral_bonus || '10') + '"/></div></div><div class="row row-2"><div class="field"><label>Daily Reward (৳)</label><input class="input" data-set="daily_reward" value="' + escapeHtml(s.daily_reward || '5') + '"/></div><div class="field"><label>Maintenance Mode</label><select class="input" data-set="maintenance_mode"><option value="0" ' + (Number(s.maintenance_mode) === 1 ? '' : 'selected') + '>Off</option><option value="1" ' + (Number(s.maintenance_mode) === 1 ? 'selected' : '') + '>On</option></select></div></div><div class="row row-2"><div class="field"><label>Daily Reward</label><select class="input" data-set="daily_reward_enabled"><option value="1" ' + (Number(s.daily_reward_enabled) === 0 ? '' : 'selected') + '>Enabled</option><option value="0" ' + (Number(s.daily_reward_enabled) === 0 ? 'selected' : '') + '>Disabled</option></select></div><div class="field"><label>Lucky Spin</label><select class="input" data-set="spin_enabled"><option value="1" ' + (Number(s.spin_enabled) === 0 ? '' : 'selected') + '>Enabled</option><option value="0" ' + (Number(s.spin_enabled) === 0 ? 'selected' : '') + '>Disabled</option></select></div></div><div class="row row-2"><div class="field"><label>Support Email</label><input class="input" data-set="support_email" value="' + escapeHtml(s.support_email || '') + '"/></div><div class="field"><label>Support Phone</label><input class="input" data-set="support_phone" value="' + escapeHtml(s.support_phone || '') + '"/></div></div><div class="field"><label>Public Notice (top of site)</label><textarea class="input" data-set="notice">' + escapeHtml(s.notice || '') + '</textarea></div><div class="row row-2"><div class="field"><label>Facebook URL</label><input class="input" data-set="social_facebook" value="' + escapeHtml(s.social_facebook || '') + '"/></div><div class="field"><label>Telegram URL</label><input class="input" data-set="social_telegram" value="' + escapeHtml(s.social_telegram || '') + '"/></div></div><div class="row row-2"><div class="field"><label>WhatsApp URL</label><input class="input" data-set="social_whatsapp" value="' + escapeHtml(s.social_whatsapp || '') + '"/></div><div class="field"><label>Address</label><input class="input" data-set="contact_address" value="' + escapeHtml(s.contact_address || '') + '"/></div></div><button class="btn btn-primary" id="saveSets">💾 Save Settings</button></div></div>'
        + '<div class="card mt-24"><h3 class="card-title">💰 Wallet Management</h3><div class="row row-2"><div class="field"><label>User ID</label><input class="input" id="wmUid" type="number" placeholder="e.g. 3"/></div><div class="field"><label>Amount (৳)</label><input class="input" id="wmAmt" type="number" placeholder="50"/></div></div><div class="row row-2"><div class="field"><label>Operation</label><select class="input" id="wmOp"><option value="add">Add balance</option><option value="remove">Remove balance</option></select></div><div class="field"><label>Note</label><input class="input" id="wmNote" placeholder="e.g. Support adjustment"/></div></div><button class="btn btn-primary" id="wmSave">Apply</button><p class="muted" style="font-size:12px;margin-top:10px">Every wallet change creates a transaction record visible to the user.</p></div>';
      wireAdminTables(orders, users, pay);
    } catch (e) { content.innerHTML = '<div class="alert error">' + e.message + '</div>'; }
  }
  function renderAdminOrders(orders) {
    const tbody = $('#ordersTbody'); if (!tbody) return;
    tbody.innerHTML = (orders.orders || []).map(o => '<tr><td><code class="kbd">' + escapeHtml(o.id) + '</code></td><td>' + escapeHtml(o.username || 'guest') + '</td><td>' + escapeHtml(o.player_uid) + '</td><td>' + escapeHtml(o.package_label || 'Custom') + ' · ' + Number(o.diamonds).toLocaleString() + ' 💎</td><td style="text-align:right;color:var(--gold);font-weight:700">৳' + fmtMoney(o.amount) + '</td><td>' + escapeHtml(o.payment_method) + '</td><td>' + statusPill(o.status) + '</td><td><select class="input" data-os="' + escapeHtml(o.id) + '" style="padding:6px;background:var(--bg-2);max-width:160px"><option value="pending_payment">pending_payment</option><option value="payment_verification">payment_verification</option><option value="processing">processing</option><option value="completed">completed</option><option value="cancelled">cancelled</option><option value="failed">failed</option></select> <button class="btn btn-sm btn-primary" data-osave="' + escapeHtml(o.id) + '">Save</button></td></tr>').join('') || '<tr><td colspan="8" class="muted">No orders.</td></tr>';
  }
  function renderAdminPackages(packages) {
    const tbody = $('#pkgTbody'); if (!tbody) return;
    tbody.innerHTML = packages.map(p => '<tr><td><input class="input" data-pl="' + p.id + '" value="' + escapeHtml(p.label) + '" style="padding:6px;min-width:160px"/></td><td><input class="input" type="number" data-pd="' + p.id + '" value="' + p.diamonds + '" style="padding:6px;width:90px"/></td><td><input class="input" type="number" data-pp="' + p.id + '" value="' + p.price + '" style="padding:6px;width:90px"/></td><td><input class="input" type="number" data-pop="' + p.id + '" value="' + (p.original_price || '') + '" style="padding:6px;width:90px"/></td><td><input class="input" type="number" data-pdisc="' + p.id + '" value="' + (p.discount || 0) + '" style="padding:6px;width:60px"/></td><td><input class="input" type="number" data-pstk="' + p.id + '" value="' + p.stock + '" style="padding:6px;width:70px"/></td><td><input class="input" data-pb="' + p.id + '" value="' + escapeHtml(p.badge || '') + '" style="padding:6px;min-width:90px"/></td><td><select class="input" data-ppop="' + p.id + '" style="padding:6px;width:80px"><option value="0" ' + (p.popular ? '' : 'selected') + '>No</option><option value="1" ' + (p.popular ? 'selected' : '') + '>Yes</option></select></td><td><select class="input" data-pa="' + p.id + '" style="padding:6px;width:80px"><option value="1" ' + (Number(p.active) !== 0 ? 'selected' : '') + '>On</option><option value="0" ' + (Number(p.active) === 0 ? 'selected' : '') + '>Off</option></select></td><td><button class="btn btn-sm btn-primary" data-psave="' + p.id + '">Save</button></td></tr>').join('');
  }
  function renderAdminUsers(users) {
    const tbody = $('#usersTbody'); if (!tbody) return;
    tbody.innerHTML = users.users.map(u => '<tr><td>' + escapeHtml(u.username) + '</td><td>' + escapeHtml(u.email) + '</td><td><select class="input" data-urole="' + u.id + '" style="padding:6px;width:100px"><option value="user" ' + (u.role !== 'admin' ? 'selected' : '') + '>user</option><option value="admin" ' + (u.role === 'admin' ? 'selected' : '') + '>admin</option></select></td><td><select class="input" data-ustatus="' + u.id + '" style="padding:6px;width:120px"><option value="active" ' + (u.status !== 'disabled' ? 'selected' : '') + '>active</option><option value="disabled" ' + (u.status === 'disabled' ? 'selected' : '') + '>disabled</option></select></td><td style="text-align:right;color:var(--gold)">৳' + fmtMoney(u.wallet_balance) + '</td><td><span class="kbd">' + escapeHtml(u.referral_code) + '</span></td><td class="muted" style="font-size:12px">' + new Date(u.created_at).toLocaleDateString() + '</td><td><button class="btn btn-sm btn-primary" data-usave="' + u.id + '">Save</button></td></tr>').join('') || '<tr><td colspan="8" class="muted">No users.</td></tr>';
  }
  function wireAdminTables(orders, users, pay) {
    renderAdminOrders(orders); renderAdminPackages(state.packages); renderAdminUsers(users);
    $$('[data-osave]').forEach(b => b.onclick = async () => { const id = b.dataset.osave; const sel = $('[data-os="' + id + '"]'); try { await api('/api/orders/' + encodeURIComponent(id) + '/status', { method: 'PUT', body: JSON.stringify({ status: sel.value }) }); toast(id + ' → ' + sel.value, 'ok'); renderAdmin(); } catch (e) { toast(e.message, 'err'); } });
    $('#qbtn').onclick = async () => { const q = $('#q').value.trim(); const s = $('#qstatus').value; const u = new URLSearchParams(); if (q) u.set('q', q); if (s) u.set('status', s); try { const d = await api('/api/admin/orders?' + u.toString()); renderAdminOrders(d); } catch (e) { toast(e.message, 'err'); } };
    $$('[data-psave]').forEach(b => b.onclick = async () => { const id = b.dataset.psave; try { await api('/api/packages/' + id, { method: 'PUT', body: JSON.stringify({ label: $('[data-pl="' + id + '"]').value, diamonds: Number($('[data-pd="' + id + '"]').value), price: Number($('[data-pp="' + id + '"]').value), original_price: Number($('[data-pop="' + id + '"]').value) || null, discount: Number($('[data-pdisc="' + id + '"]').value) || 0, stock: Number($('[data-pstk="' + id + '"]').value), badge: $('[data-pb="' + id + '"]').value, popular: Number($('[data-ppop="' + id + '"]').value) || 0, active: Number($('[data-pa="' + id + '"]').value) || 0 }) }); await loadPackages(); toast('Package saved', 'ok'); renderAdmin(); } catch (e) { toast(e.message, 'err'); } });
    $('#addPkg').onclick = async () => { try { await api('/api/packages', { method: 'POST', body: JSON.stringify({ diamonds: 500, price: 380, label: 'New Package', sort_order: 99 }) }); await loadPackages(); toast('Package added', 'ok'); renderAdmin(); } catch (e) { toast(e.message, 'err'); } };
    $$('[data-usave]').forEach(b => b.onclick = async () => { const id = b.dataset.usave; try { await api('/api/admin/users/' + id, { method: 'PUT', body: JSON.stringify({ role: $('[data-urole="' + id + '"]').value, status: $('[data-ustatus="' + id + '"]').value }) }); toast('User updated', 'ok'); renderAdmin(); } catch (e) { toast(e.message, 'err'); } });
    $('#uQbtn').onclick = async () => { const q = $('#uQ').value.trim(); try { const d = await api('/api/admin/users' + (q ? '?q=' + encodeURIComponent(q) : '')); renderAdminUsers(d); } catch (e) { toast(e.message, 'err'); } };
    $$('[data-pmsave]').forEach(b => b.onclick = async () => { const id = b.dataset.pmsave; try { await api('/api/admin/payment-settings/' + id, { method: 'PUT', body: JSON.stringify({ display_name: $('[data-pmn="' + id + '"]').value, account_number: $('[data-pma="' + id + '"]').value, instructions: $('[data-pmi="' + id + '"]').value }) }); await loadPaymentMethods(); toast('Payment method saved', 'ok'); } catch (e) { toast(e.message, 'err'); } });
    $$('[data-pmtoggle]').forEach(b => b.onclick = async () => { const id = b.dataset.pmtoggle; try { await api('/api/admin/payment-settings/' + id, { method: 'PUT', body: JSON.stringify({ active: Number(b.textContent.trim() === 'Enable' ? 1 : 0) }) }); await loadPaymentMethods(); toast('Toggled', 'ok'); renderAdmin(); } catch (e) { toast(e.message, 'err'); } });
    $('#saveSets').onclick = async () => { const entries = {}; $$('[data-set]').forEach(i => entries[i.dataset.set] = i.value); try { await api('/api/admin/site-settings', { method: 'PUT', body: JSON.stringify({ settings: entries }) }); toast('Settings saved', 'ok'); await loadSiteSettings(); } catch (e) { toast(e.message, 'err'); } };
    $('#wmSave').onclick = async () => { try { const r = await api('/api/wallet/admin/adjust', { method: 'POST', body: JSON.stringify({ user_id: Number($('#wmUid').value), amount: Number($('#wmAmt').value), operation: $('#wmOp').value, note: $('#wmNote').value }) }); toast('Wallet updated. New balance: ৳' + r.new_balance, 'ok'); } catch (e) { toast(e.message, 'err'); } };
  }
  function doRegister(reg) { api('/api/auth/register', { method: 'POST', body: JSON.stringify(reg) }).then(d => { saveAuth(d.user, d.token); toast('Welcome, ' + d.user.username + '!', 'ok'); renderNavCta(); navigate('/dashboard'); }).catch(e => toast(e.message, 'err')); }
  function doLogin(id, pw) { api('/api/auth/login', { method: 'POST', body: JSON.stringify({ identifier: id, password: pw }) }).then(d => { saveAuth(d.user, d.token); toast('Welcome back, ' + d.user.username + '!', 'ok'); renderNavCta(); navigate('/dashboard'); }).catch(e => toast(e.message, 'err')); }
  function wireGlobalAuth() {
    document.addEventListener('click', (e) => {
      const t = e.target; if (!t) return; const id = t.id;
      if (id === 'loginBtn') doLogin($('#loginId').value.trim(), $('#loginPassword').value);
      else if (id === 'regBtn') doRegister({ username: $('#regUsername').value.trim(), email: $('#regEmail').value.trim(), phone: $('#regPhone').value.trim(), password: $('#regPassword').value, referral: $('#regReferral').value.trim() });
      else if (id === 'regBtn2') doRegister({ username: $('#regUsername2').value.trim(), email: $('#regEmail2').value.trim(), phone: $('#regPhone2').value.trim(), password: $('#regPassword2').value, referral: $('#regReferral2').value.trim() });
      else if (id === 'fpBtn') {
        const idv = $('#fpId').value.trim();
        api('/api/auth/forgot-password', { method: 'POST', body: JSON.stringify({ identifier: idv }) }).then(r => {
          if (r.demo_token) {
            $('#fpResult').innerHTML = '<div class="alert success"><strong>Demo mode:</strong> Your reset token is <code class="kbd">' + r.demo_token + '</code>. Use it below.</div><div class="card mt-12"><div class="field"><label>Reset token</label><input class="input" id="rToken" value="' + r.demo_token + '"/></div><div class="field"><label>New Password</label><input class="input" id="rPw" type="password"/></div><button class="btn btn-primary btn-block" id="rApply">Reset Password</button></div>';
            $('#rApply').onclick = async () => { try { await api('/api/auth/reset-password', { method: 'POST', body: JSON.stringify({ token: $('#rToken').value, new_password: $('#rPw').value }) }); toast('Password reset OK — login', 'ok'); navigate('/login'); } catch (e) { toast(e.message, 'err'); } };
          } else { $('#fpResult').innerHTML = '<div class="alert info">If the account exists, a reset link has been sent.</div>'; }
        }).catch(e => toast(e.message, 'err'));
      }
      else if (id === 'trackBtn') renderTrackResult($('#trackInput').value.trim());
      else if (id === 'spinBtn') spinWheel();
      else if (t.classList && t.classList.contains('faq-q')) t.parentElement.classList.toggle('open');
    });
  }
  function animateCounters() {
    $$('[data-count]').forEach(el => { if (!/(<|^|\s)\d/.test(el.textContent)) return; const dur = 1400; const start = performance.now(); const txt = el.textContent.trim(); const m = txt.match(/^([\d,]+)(.*)$/); if (!m) return; const target = Number((m[1] || '0').replace(/,/g,'')||0); const suffix = m[2] || ''; function tick(t){const k=Math.min(1,(t-start)/dur);el.textContent=Math.floor(target*(1-Math.pow(1-k,3))).toLocaleString()+suffix;if(k<1)requestAnimationFrame(tick);else el.textContent=target.toLocaleString()+suffix;} requestAnimationFrame(tick); });
  }
  async function bootstrap() {
    loadAuth(); wireGlobalAuth(); $$('[data-nav]').forEach(a => a.onclick = (e) => { e.preventDefault(); navigate(a.dataset.nav); });
    $('#year').textContent = new Date().getFullYear();
    await Promise.all([loadPackages(), loadPaymentMethods(), loadSiteSettings()]);
    renderNavCta();
    setTimeout(() => { const ls = $('#loadingScreen'); ls.classList.add('hide'); setTimeout(() => ls.remove(), 400); }, 350);
    show(getRoute()); if (getRoute() === '/order-success') showOrderSuccess(); animateCounters();
  }
  document.addEventListener('DOMContentLoaded', bootstrap);
})();
