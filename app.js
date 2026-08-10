/* ============================================================
   TOPUP X ELITE - Frontend App
   - Talks to /api/* endpoints; stores JWT in localStorage
   - Mobile-first; bottom nav; client-side router
   ============================================================ */
(function () {
  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

  const state = {
    user: null,
    token: null,
    packages: [],
    paymentMethods: [],
    banners: [],
    reviews: [],
    siteSettings: {},
    currentPackage: null,
    selectedPayment: null
  };

  /* ---------------- STORAGE ---------------- */
  function saveAuth(user, token) {
    state.user = user; state.token = token;
    if (token) localStorage.setItem('txe_token', token);
    if (user) localStorage.setItem('txe_user', JSON.stringify(user));
  }
  function loadAuth() {
    state.token = localStorage.getItem('txe_token');
    try { state.user = JSON.parse(localStorage.getItem('txe_user') || 'null'); } catch { state.user = null; }
  }
  function clearAuth() { state.user = null; state.token = null; localStorage.removeItem('txe_token'); localStorage.removeItem('txe_user'); }

  /* ---------------- TOASTS ---------------- */
  function toast(msg, type = '') {
    const el = document.createElement('div');
    el.className = 'toast ' + type;
    el.textContent = msg;
    $('#toasts').appendChild(el);
    setTimeout(() => { el.style.opacity = '0'; el.style.transform = 'translateY(8px)'; setTimeout(() => el.remove(), 250); }, 3500);
  }

  /* ---------------- API ---------------- */
  async function api(path, opts = {}) {
    const headers = { 'Content-Type': 'application/json', ...(opts.headers || {}) };
    if (state.token) headers.Authorization = 'Bearer ' + state.token;
    const res = await fetch(path, { ...opts, headers });
    let data = null;
    try { data = await res.json(); } catch { data = null; }
    if (!res.ok) throw new Error((data && data.error) || `Request failed (${res.status})`);
    return data;
  }

  /* ---------------- ROUTING ---------------- */
  function getRoute() {
    const hash = location.hash.replace('#', '') || '/';
    return hash.startsWith('/') ? hash : '/' + hash;
  }
  function show(route) {
    $$('.page').forEach(p => p.classList.remove('active'));
    const target = document.querySelector(`.page[data-route="${route}"]`) || document.querySelector('.page[data-route="/"]');
    target.classList.add('active');
    $$('[data-nav]').forEach(a => a.classList.toggle('active', a.dataset.nav === route));
    window.scrollTo({ top: 0, behavior: 'instant' });
    if (route === '/topup') renderTopUp();
    if (route === '/' ) renderHomeFeatured();
    if (route === '/order') renderOrderForm();
    if (route === '/track') renderTrackResult('');
    if (route === '/dashboard') renderDashboard();
    if (route === '/orders') renderOrders();
    if (route === '/wallet') renderWallet();
    if (route === '/rewards') renderRewards();
    if (route === '/admin') renderAdmin();
    if (route === '/') { renderReviews(); applySiteSettings(); }
  }
  function navigate(route) {
    if (!route.startsWith('/')) route = '/' + route;
    if (location.hash !== '#' + route) location.hash = '#' + route;
    else show(route);
  }
  window.addEventListener('hashchange', () => show(getRoute()));

  /* ---------------- UI HELPERS ---------------- */
  function renderNavCta() {
    const cta = $('#navCta');
    if (state.user) {
      cta.innerHTML = `<span class="tag tag-gold" style="margin-right:8px">${escapeHtml(state.user.username)} · ${state.user.role === 'admin' ? '🛡 Admin' : '💎 Player'}</span><button class="btn btn-sm" id="logoutBtn">Logout</button>`;
      $('#logoutBtn').onclick = async () => { try { await api('/api/auth/logout', { method: 'POST' }); } catch {} clearAuth(); toast('Logged out', 'ok'); renderNavCta(); navigate('/'); };
    } else {
      cta.innerHTML = `<button class="btn btn-sm" id="loginNavBtn">Login / Register</button>`;
      $('#loginNavBtn').onclick = () => navigate('/auth');
    }
  }
  function escapeHtml(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }
  function fmtMoney(n) { return (Number(n) || 0).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 2 }); }
  function statusPill(s) { return `<span class="status ${s}"><span class="dot"></span>${s}</span>`; }

  /* ---------------- PACKAGE CARD ---------------- */
  function packageCard(pkg, opts = {}) {
    return `<div class="pkg-card ${pkg.badge ? 'featured' : ''}">
      ${pkg.badge ? `<div class="pkg-badge"><span class="tag tag-gold">${escapeHtml(pkg.badge)}</span></div>` : ''}
      <div class="pkg-icon">💎</div>
      <div class="pkg-title">${escapeHtml(pkg.label)}</div>
      <div class="pkg-diamonds">${Number(pkg.diamonds).toLocaleString()} Diamonds${pkg.bonus ? ` <span class="tag tag-cyan" style="margin-left:8px">+${pkg.bonus} bonus</span>` : ''}</div>
      <div class="pkg-price-row">
        <div class="pkg-price"><span class="cur">৳</span>${fmtMoney(pkg.price)}</div>
        <span class="muted" style="font-size:11px">/ unit</span>
      </div>
      <button class="btn btn-primary pkg-btn" data-order="${pkg.id}">Order Now →</button>
    </div>`;
  }
  function wirePackageButtons() {
    $$('[data-order]').forEach(b => b.onclick = () => {
      const id = Number(b.dataset.order);
      const pkg = state.packages.find(p => p.id === id);
      state.currentPackage = pkg;
      navigate('/order');
    });
  }

  async function loadPackages() {
    try {
      const data = await api('/api/packages');
      state.packages = data.packages || [];
    } catch (e) { toast('Failed to load packages', 'err'); }
  }
  async function loadPaymentMethods() {
    try {
      const data = await api('/api/admin/payment-settings');
      state.paymentMethods = (data.methods || []).filter(m => Number(m.active) === 1);
    } catch (e) { /* public endpoint may still be reached without admin */ }
  }
  async function loadBanners() { try { const data = await api('/api/admin/banners'); state.banners = data.banners || []; } catch {} }
  async function loadPublicContent() { try { const [r,s] = await Promise.all([api('/api/admin/reviews'), api('/api/admin/site-settings')]); state.reviews=r.reviews||[]; state.siteSettings=s.settings||{}; } catch {} }
  function renderReviews() { const grid=$('#reviewsGrid'); if(!grid) return; const rows=state.reviews||[]; grid.innerHTML=rows.length ? rows.map(r=>`<div class="card review"><div class="name">${escapeHtml(r.name)} ${Number(r.verified)?'<span class="badge">Verified</span>':''}</div><div class="meta">${escapeHtml(r.location||'')}</div><div class="stars">${'★'.repeat(Number(r.rating))}${'☆'.repeat(5-Number(r.rating))}</div><div class="quote">"${escapeHtml(r.quote)}"</div></div>`).join('') : '<div class="muted">No reviews published yet.</div>'; }
  function applySiteSettings() { const s=state.siteSettings||{}; if(s.site_name){ document.title=`${s.site_name} — ${s.site_tagline||'Fast • Secure • Trusted Top-Up'}`; $$('.brand-title').forEach(e=>e.textContent=s.site_name); } const ann=$('.hero .alert.warn'); if(ann&&s.announcement) ann.innerHTML=`⚠ <strong>Notice:</strong> ${escapeHtml(s.announcement)}`; }

  /* ---------------- HOME RENDER ---------------- */
  function renderHomeFeatured() {
    const grid = $('#featuredPackages');
    if (!grid) return;
    const featured = state.packages.filter(p => p.badge).slice(0, 8);
    const base = featured.length ? featured : state.packages.slice(0, 8);
    grid.innerHTML = base.length ? base.map(p => packageCard(p)).join('') : Array(8).fill('<div class="skeleton" style="height:200px"></div>').join('');
    wirePackageButtons();
  }

  /* ---------------- TOP-UP RENDER ---------------- */
  function renderTopUp() {
    const grid = $('#allPackages');
    grid.innerHTML = state.packages.length ? state.packages.map(p => packageCard(p)).join('') : Array(12).fill('<div class="skeleton" style="height:200px"></div>').join('');
    wirePackageButtons();
    const cd = $('#customDiamonds'), pp = $('#customPricePreview');
    if (cd) cd.oninput = () => { const d = Math.max(1, Number(cd.value) || 0); pp.value = `৳${fmtMoney(Math.round(d * 0.78 * 100) / 100)} (demo rate)`; };
    cd && cd.dispatchEvent(new Event('input'));
    $('#customOrderBtn').onclick = () => {
      const d = Math.max(1, Number($('#customDiamonds').value) || 0);
      state.currentPackage = { id: null, diamonds: d, label: `Custom: ${d} Diamonds`, price: Math.round(d * 0.78 * 100) / 100 };
      navigate('/order');
    };
  }

  /* ---------------- ORDER FORM ---------------- */
  function renderOrderForm() {
    const pkg = state.currentPackage;
    const summary = $('#orderPkgSummary');
    if (pkg) {
      summary.innerHTML = `<strong>${escapeHtml(pkg.label)}</strong> · ${Number(pkg.diamonds).toLocaleString()} Diamonds · <strong style="color:var(--gold)">৳${fmtMoney(pkg.price)}</strong>`;
    } else {
      summary.innerHTML = `<span class="muted">No package selected. <a href="#/topup" data-nav="/topup" style="color:var(--gold)">Choose one →</a></span>`;
    }

    // Payment methods
    const pm = $('#paymentMethods');
    pm.innerHTML = state.paymentMethods.length
      ? state.paymentMethods.map(m => `<div class="pay-card" data-pay="${escapeHtml(m.method)}">
          <div class="pay-head"><div class="pay-chip ${m.method}">${escapeHtml(m.display_name.slice(0,1))}</div><div><div class="pay-name">${escapeHtml(m.display_name)}</div><div class="pay-acc">${escapeHtml(m.account_number || '')}</div></div></div>
          <div class="pay-instr">${escapeHtml((m.instructions || '').slice(0, 110))}${(m.instructions || '').length > 110 ? '…' : ''}</div>
        </div>`).join('')
      : `<div class="alert warn" style="grid-column:1/-1">⚠ No payment methods configured yet. Add them from <a href="#/admin" data-nav="/admin" style="color:var(--gold);font-weight:700">Admin Panel → Payment Methods</a>.</div>`;
    $$('#paymentMethods .pay-card').forEach(c => c.onclick = () => selectPayment(c.dataset.pay));
    if (state.selectedPayment) selectPayment(state.selectedPayment);
    else if (state.paymentMethods[0]) selectPayment(state.paymentMethods[0].method);

    // Login nudge
    $('#loginNudge').classList.toggle('hidden', !!state.user);
    $('#loginNudgeLink').onclick = (e) => { e.preventDefault(); navigate('/auth'); };

    $('#submitOrderBtn').onclick = submitOrder;
  }
  function selectPayment(method) {
    state.selectedPayment = method;
    $$('#paymentMethods .pay-card').forEach(c => c.classList.toggle('selected', c.dataset.pay === method));
    const m = state.paymentMethods.find(x => x.method === method);
    const box = $('#payInstrBox');
    if (m) {
      box.style.display = 'block';
      box.innerHTML = `<strong>${escapeHtml(m.display_name)}</strong> · Pay to <strong>${escapeHtml(m.account_number || '—')}</strong><br/><span style="color:var(--text-dim)">${escapeHtml(m.instructions || '')}</span>`;
      $('#trxField').style.display = 'block';
    }
  }

  async function submitOrder() {
    if (!state.user) { toast('Please login first', 'warn'); navigate('/auth'); return; }
    const pkg = state.currentPackage;
    if (!pkg) { toast('Choose a package first', 'warn'); navigate('/topup'); return; }
    const payload = {
      player_uid: $('#playerUid').value.trim(),
      server_id: $('#serverId').value.trim(),
      customer_phone: $('#customerPhone').value.trim(),
      payment_method: state.selectedPayment,
      transaction_id: $('#trxId').value.trim(),
      note: $('#orderNote').value.trim()
    };
    if (pkg.id) payload.package_id = pkg.id;
    else payload.custom_diamonds = pkg.diamonds;

    try {
      const data = await api('/api/orders', { method: 'POST', body: JSON.stringify(payload) });
      toast('Order placed! Order ID: ' + data.order.id, 'ok');
      navigate('/track');
      $('#trackInput').value = data.order.id;
      renderTrackResult(data.order.id);
    } catch (e) { toast(e.message, 'err'); }
  }

  /* ---------------- ORDER TRACK ---------------- */
  async function renderTrackResult(orderId) {
    const out = $('#trackResult');
    if (!orderId) { out.innerHTML = ''; return; }
    out.innerHTML = `<div class="skeleton" style="height:140px"></div>`;
    try {
      const data = await api('/api/orders/track/' + encodeURIComponent(orderId));
      const o = data.order;
      out.innerHTML = `<div class="card">
        <div class="flex" style="justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px">
          <div><div class="muted" style="font-size:12px;letter-spacing:1px;">ORDER ID</div><div style="font-family:var(--font-display);font-size:22px">${escapeHtml(o.id)}</div></div>
          ${statusPill(o.status)}
        </div>
        <div class="divider"></div>
        <div class="grid grid-2 grid-4" style="gap:10px">
          <div><div class="muted" style="font-size:11px;letter-spacing:1px">PACKAGE</div><div style="font-weight:700">${escapeHtml(o.package_label || 'Custom')}</div></div>
          <div><div class="muted" style="font-size:11px;letter-spacing:1px">DIAMONDS</div><div style="font-weight:700;color:var(--neon-cyan)">${Number(o.diamonds).toLocaleString()}</div></div>
          <div><div class="muted" style="font-size:11px;letter-spacing:1px">AMOUNT</div><div style="font-weight:700;color:var(--gold)">৳${fmtMoney(o.amount)}</div></div>
          <div><div class="muted" style="font-size:11px;letter-spacing:1px">PAYMENT</div><div style="font-weight:700">${escapeHtml(o.payment_method)}</div></div>
          <div><div class="muted" style="font-size:11px;letter-spacing:1px">UID</div><div>${escapeHtml(o.player_uid)}</div></div>
          <div><div class="muted" style="font-size:11px;letter-spacing:1px">PHONE</div><div>${escapeHtml(o.customer_phone)}</div></div>
          <div><div class="muted" style="font-size:11px;letter-spacing:1px">CREATED</div><div>${new Date(o.created_at).toLocaleString()}</div></div>
          <div><div class="muted" style="font-size:11px;letter-spacing:1px">UPDATED</div><div>${new Date(o.updated_at).toLocaleString()}</div></div>
        </div>
        ${o.note ? `<div class="alert info mt-12"><strong>Admin note:</strong> ${escapeHtml(o.note)}</div>` : ''}
      </div>`;
    } catch (e) { out.innerHTML = `<div class="alert error">Order not found. Double-check the Order ID.</div>`; }
  }

  /* ---------------- DASHBOARD ---------------- */
  async function renderDashboard() {
    const out = $('#dashboardContent');
    if (!state.user) {
      out.innerHTML = `<div class="alert warn">Please <a href="#/auth" data-nav="/auth" style="color:var(--gold);font-weight:700">login</a> to view your dashboard.</div>`;
      $$('a[data-nav]').forEach(a => a.onclick = () => navigate(a.dataset.nav));
      return;
    }
    out.innerHTML = `<div class="skeleton" style="height:200px"></div>`;
    try {
      const [me, mine] = await Promise.all([api('/api/auth/me'), api('/api/orders/mine')]);
      const u = me.user;
      const recent = (mine.orders || []).slice(0, 5);
      out.innerHTML = `
        <div class="grid grid-2 grid-3">
          <div class="card"><div class="muted" style="font-size:12px;letter-spacing:1px">USERNAME</div><div style="font-family:var(--font-display);font-size:22px">${escapeHtml(u.username)}</div><div class="muted" style="font-size:12px">${escapeHtml(u.email)}</div></div>
          <div class="card"><div class="muted" style="font-size:12px;letter-spacing:1px">ROLE</div><div style="font-family:var(--font-display);font-size:22px">${u.role === 'admin' ? '🛡 Admin' : '💎 Player'}</div></div>
          <div class="card"><div class="muted" style="font-size:12px;letter-spacing:1px">WALLET</div><div style="font-family:var(--font-display);font-size:26px;color:var(--gold)">৳${fmtMoney(u.wallet_balance)}</div><button class="btn btn-sm mt-12" data-nav="/wallet">Open Wallet →</button></div>
        </div>
        <div class="card mt-24">
          <h3 style="font-family:var(--font-display);margin:0 0 6px">Your Referral Code</h3>
          <p class="muted" style="font-size:13px">Share this to invite friends and earn referral bonuses.</p>
          <div class="alert info mt-12"><code style="font-family:monospace;font-weight:700">${escapeHtml(u.referral_code)}</code> <button class="btn btn-sm" id="copyCode">Copy</button></div>
        </div>
        <div class="card mt-24">
          <h3 style="font-family:var(--font-display);margin:0 0 12px">Recent Orders</h3>
          ${recent.length ? recent.map(orderRow).join('') : '<div class="muted">No orders yet — go to <a href="#/topup" data-nav="/topup" style="color:var(--gold);font-weight:700">Top-Up</a>.</div>'}
          <div class="flex gap-12 mt-16" style="flex-wrap:wrap"><button class="btn" data-nav="/orders">See all orders →</button><button class="btn btn-danger btn-sm" id="logoutBtn2">Logout</button></div>
        </div>
        <div class="card mt-24" id="changePwdCard">
          <h3 style="font-family:var(--font-display);margin:0 0 6px">🔒 Change Password</h3>
          <div class="row row-2">
            <div class="field"><label>Current Password</label><input class="input" id="oldPw" type="password"/></div>
            <div class="field"><label>New Password</label><input class="input" id="newPw" type="password"/></div>
          </div>
          <button class="btn btn-primary" id="changePwBtn">Update Password</button>
        </div>
      `;
      $$('a[data-nav], [data-nav]').forEach(a => a.onclick = () => navigate(a.dataset.nav));
      $('#copyCode').onclick = () => { navigator.clipboard.writeText(u.referral_code); toast('Code copied', 'ok'); };
      $('#logoutBtn2').onclick = async () => { try { await api('/api/auth/logout', { method: 'POST' }); } catch {} clearAuth(); toast('Logged out', 'ok'); renderNavCta(); navigate('/'); };
      $('#changePwBtn').onclick = async () => {
        try {
          await api('/api/auth/change-password', { method: 'POST', body: JSON.stringify({ old_password: $('#oldPw').value, new_password: $('#newPw').value }) });
          toast('Password updated', 'ok'); $('#oldPw').value = ''; $('#newPw').value = '';
        } catch (e) { toast(e.message, 'err'); }
      };
    } catch (e) { out.innerHTML = `<div class="alert error">${e.message}</div>`; }
  }
  function orderRow(o) {
    return `<div class="card" style="padding:14px;margin-bottom:10px">
      <div class="flex" style="justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px">
        <div><div style="font-family:var(--font-display);font-weight:700">${escapeHtml(o.id)}</div><div class="muted" style="font-size:12px">${escapeHtml(o.package_label || 'Custom')} · ${Number(o.diamonds).toLocaleString()} 💎</div></div>
        <div style="text-align:right"><div style="font-family:var(--font-display);font-weight:700;color:var(--gold)">৳${fmtMoney(o.amount)}</div>${statusPill(o.status)}</div>
      </div>
    </div>`;
  }

  async function renderOrders() {
    const out = $('#ordersList');
    if (!state.user) { out.innerHTML = `<div class="alert warn">Please <a href="#/auth" data-nav="/auth" style="color:var(--gold);font-weight:700">login</a> to see your orders.</div>`; $$('a[data-nav]').forEach(a => a.onclick = () => navigate(a.dataset.nav)); return; }
    out.innerHTML = `<div class="skeleton" style="height:140px"></div>`;
    try {
      const data = await api('/api/orders/mine');
      const orders = data.orders || [];
      if (!orders.length) { out.innerHTML = `<div class="alert info">No orders yet · <a href="#/topup" data-nav="/topup" style="color:var(--gold);font-weight:700">place your first top-up</a>.</div>`; return; }
      out.innerHTML = orders.map(o => `<div class="card" style="margin-bottom:10px">
        <div class="flex" style="justify-content:space-between;align-items:center;flex-wrap:wrap;gap:10px">
          <div>
            <div style="font-family:var(--font-display);font-weight:700">${escapeHtml(o.id)}</div>
            <div class="muted" style="font-size:12px">${escapeHtml(o.package_label || 'Custom')} · ${Number(o.diamonds).toLocaleString()} 💎 · ৳${fmtMoney(o.amount)}</div>
            <div class="muted" style="font-size:11px">UID ${escapeHtml(o.player_uid)} · ${escapeHtml(o.payment_method)} · ${new Date(o.created_at).toLocaleString()}</div>
          </div>
          <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">${statusPill(o.status)}<button class="btn btn-sm" data-track="${escapeHtml(o.id)}">View</button>${o.status === 'completed' ? `<button class="btn btn-sm btn-primary" data-cashback="${escapeHtml(o.id)}">Claim Cashback</button>` : ''}</div>
        </div>
      </div>`).join('');
      $$('[data-track]').forEach(b => b.onclick = () => { navigate('/track'); $('#trackInput').value = b.dataset.track; renderTrackResult(b.dataset.track); });
      $$('[data-cashback]').forEach(b => b.onclick = async () => {
        try { const r = await api('/api/wallet/reward/cashback', { method: 'POST', body: JSON.stringify({ order_id: b.dataset.cashback }) }); toast('Cashback claimed: ৳' + r.claimed, 'ok'); renderOrders(); } catch (e) { toast(e.message, 'err'); }
      });
    } catch (e) { out.innerHTML = `<div class="alert error">${e.message}</div>`; }
  }

  /* ---------------- WALLET ---------------- */
  async function renderWallet() {
    const out = $('#walletContent');
    if (!state.user) { out.innerHTML = `<div class="alert warn">Please <a href="#/auth" data-nav="/auth" style="color:var(--gold);font-weight:700">login</a> to use the wallet.</div>`; $$('a[data-nav]').forEach(a => a.onclick = () => navigate(a.dataset.nav)); return; }
    out.innerHTML = `<div class="skeleton" style="height:160px"></div>`;
    try {
      const data = await api('/api/wallet/me');
      out.innerHTML = `
        <div class="grid grid-2">
          <div class="card" style="display:flex;align-items:center;justify-content:space-between;gap:14px;flex-wrap:wrap">
            <div><div class="muted" style="font-size:12px;letter-spacing:1px">CURRENT BALANCE</div><div style="font-family:var(--font-display);font-size:40px;color:var(--gold);font-weight:700">৳${fmtMoney(data.balance)}</div></div>
            <div class="flex gap-8"> <button class="btn btn-primary" data-toggle="topup">+ Add Money</button><button class="btn" data-toggle="history">View History</button></div>
          </div>
          <div class="card">
            <h3 style="font-family:var(--font-display);margin:0 0 8px">💸 Add Money (DEMO)</h3>
            <p class="muted" style="font-size:13px">Wallet top-up uses a mock flow with simulated payment confirmation. For real money movement, integrate a real gateway (bKash/Nagad API) and confirm via webhook.</p>
            <div class="row row-2">
              <div class="field"><label>Amount (৳)</label><input class="input" id="topAmt" type="number" min="10" value="100"/></div>
              <div class="field"><label>Payment Method</label>
                <select class="input" id="topMethod">${state.paymentMethods.map(m => `<option value="${escapeHtml(m.method)}">${escapeHtml(m.display_name)}</option>`).join('')}</select>
              </div>
            </div>
            <div class="field"><label>Mock Transaction ID</label><input class="input" id="topTrx" value="DEMO${Date.now().toString().slice(-6)}"/></div>
            <button class="btn btn-primary btn-block" id="topupBtn">Add to Wallet</button>
            <div class="alert warn mt-12" style="font-size:12px">⚠ No real money is processed. Connect a real gateway (and confirm via webhook) before going live.</div>
          </div>
        </div>
        <div class="card mt-24">
          <h3 style="font-family:var(--font-display);margin:0 0 8px">Transaction History</h3>
          ${(data.transactions || []).length ? `<table style="width:100%;border-collapse:collapse"><thead><tr><th style="text-align:left;padding:8px">Type</th><th style="text-align:right;padding:8px">Amount</th><th style="text-align:right;padding:8px">Balance</th><th style="text-align:left;padding:8px">When</th><th style="text-align:left;padding:8px">Note</th></tr></thead><tbody>
            ${data.transactions.map(t => `<tr style="border-top:1px solid var(--border)"><td style="padding:8px"><span class="tag">${escapeHtml(t.type)}</span></td><td style="padding:8px;text-align:right;color:${t.amount >= 0 ? 'var(--success)' : 'var(--danger)'};font-weight:700">${t.amount >= 0 ? '+' : ''}৳${fmtMoney(t.amount)}</td><td style="padding:8px;text-align:right">৳${fmtMoney(t.balance_after)}</td><td style="padding:8px">${new Date(t.created_at).toLocaleString()}</td><td style="padding:8px" class="muted">${escapeHtml(t.note || '')}</td></tr>`).join('')}
          </tbody></table>` : '<div class="muted">No transactions yet.</div>'}
        </div>
      `;
      $('#topupBtn').onclick = async () => {
        try {
          const r = await api('/api/wallet/topup', { method: 'POST', body: JSON.stringify({ amount: Number($('#topAmt').value), payment_method: $('#topMethod').value, transaction_id: $('#topTrx').value }) });
          toast('Demo top-up successful: ৳' + r.balance.toLocaleString(), 'ok'); renderWallet();
        } catch (e) { toast(e.message, 'err'); }
      };
    } catch (e) { out.innerHTML = `<div class="alert error">${e.message}</div>`; }
  }

  /* ---------------- REWARDS ---------------- */
  async function renderRewards() {
    if (!state.user) { $('#rewardsHistory').innerHTML = `<div class="alert warn">Please <a href="#/auth" data-nav="/auth" style="color:var(--gold);font-weight:700">login</a> to see rewards.</div>`; $$('a[data-nav]').forEach(a => a.onclick = () => navigate(a.dataset.nav)); return; }
    try {
      const data = await api('/api/wallet/rewards/history');
      $('#rewardsHistory').innerHTML = (data.rewards && data.rewards.length) ? `<table style="width:100%;border-collapse:collapse"><thead><tr><th style="text-align:left;padding:8px">Type</th><th style="text-align:right;padding:8px">Amount</th><th style="text-align:left;padding:8px">Description</th><th style="text-align:left;padding:8px">When</th></tr></thead><tbody>
        ${data.rewards.map(r => `<tr style="border-top:1px solid var(--border)"><td style="padding:8px"><span class="tag tag-gold">${escapeHtml(r.reward_type)}</span></td><td style="padding:8px;text-align:right;color:var(--gold);font-weight:700">৳${fmtMoney(r.amount)}</td><td style="padding:8px">${escapeHtml(r.description || '')}</td><td style="padding:8px" class="muted">${new Date(r.created_at).toLocaleString()}</td></tr>`).join('')}
      </tbody></table>` : '<div class="muted">No rewards yet. Claim your daily bonus above!</div>';
    } catch {}
    $('#dailyClaimBtn').onclick = async () => { try { const r = await api('/api/wallet/reward/daily', { method: 'POST' }); toast('Daily +৳' + r.claimed, 'ok'); renderRewards(); } catch (e) { toast(e.message, 'warn'); } };
    $('#spinBtn').onclick = spinWheel;
  }
  async function spinWheel() {
    try {
      const wheel = $('#wheel');
      wheel.style.transition = 'transform 1s ease';
      wheel.style.transform = `rotate(${Math.random() * 360}deg)`;
      const r = await api('/api/wallet/reward/spin', { method: 'POST' });
      setTimeout(() => {
        wheel.style.transition = 'transform 4s cubic-bezier(0.18, 0.9, 0.2, 1)';
        wheel.style.transform = `rotate(${360 * 5 + Math.random() * 360}deg)`;
        const msg = r.prize > 0 ? `🎉 You won ৳${r.prize}! Balance: ৳${r.balance}` : 'No win this time — try again tomorrow!';
        $('#spinResult').innerHTML = `<strong>${msg}</strong>`; $('#spinResult').className = r.prize > 0 ? 'alert success text-center mt-16' : 'alert warn text-center mt-16';
        toast(r.prize > 0 ? 'Spin won: ৳' + r.prize : 'Spin complete', r.prize > 0 ? 'ok' : 'warn');
      }, 100);
    } catch (e) { toast(e.message, 'err'); }
  }

  /* ---------------- AUTH ---------------- */
  function wireAuth() {
    $('#regBtn').onclick = async () => {
      try {
        const data = await api('/api/auth/register', { method: 'POST', body: JSON.stringify({
          username: $('#regUsername').value.trim(),
          email: $('#regEmail').value.trim(),
          phone: $('#regPhone').value.trim(),
          password: $('#regPassword').value,
          referral: $('#regReferral').value.trim()
        }) });
        saveAuth(data.user, data.token); toast('Welcome, ' + data.user.username + '!', 'ok'); renderNavCta(); navigate('/dashboard');
      } catch (e) { toast(e.message, 'err'); }
    };
    $('#loginBtn').onclick = async () => {
      try {
        const data = await api('/api/auth/login', { method: 'POST', body: JSON.stringify({ identifier: $('#loginId').value.trim(), password: $('#loginPassword').value }) });
        saveAuth(data.user, data.token); toast('Welcome back, ' + data.user.username + '!', 'ok'); renderNavCta(); navigate('/dashboard');
      } catch (e) { toast(e.message, 'err'); }
    };
  }
  $$('.faq-q').forEach(q => q.onclick = () => q.parentElement.classList.toggle('open'));
  $('#trackBtn').onclick = () => renderTrackResult($('#trackInput').value.trim());

  /* ---------------- ADMIN ---------------- */
  async function renderAdmin() {
    const guard = $('#adminGuard'), content = $('#adminContent');
    if (!state.user || state.user.role !== 'admin') {
      guard.className = 'alert warn'; guard.innerHTML = `⚠ Admin access required. <a href="#/auth" data-nav="/auth" style="color:var(--gold);font-weight:700">Login as admin →</a>`;
      $$('[data-nav]').forEach(a => a.onclick = () => navigate(a.dataset.nav)); content.classList.add('hidden'); return;
    }
    guard.classList.add('hidden'); content.classList.remove('hidden');
    content.innerHTML = `<div class="skeleton" style="height:140px"></div>`;
    try {
      const [stats, orders, u, pay, banks, banners, settings] = await Promise.all([
        api('/api/admin/stats'), api('/api/admin/orders'), api('/api/admin/users'),
        api('/api/admin/payment-settings'), api('/api/admin/payment-settings'), api('/api/admin/banners'),
        api('/api/admin/site-settings')
      ]);
      const totals = stats.totals || {};
      const set = settings.settings || {};
      content.innerHTML = `
        <div class="grid grid-2 grid-4">
          <div class="stat"><div class="num">${stats.total_orders || totals.total_orders || 0}</div><div class="label">Total Orders</div></div>
          <div class="stat"><div class="num" style="color:var(--warn)">${totals.pending || 0}</div><div class="label">Pending</div></div>
          <div class="stat"><div class="num" style="color:var(--success)">${totals.completed || 0}</div><div class="label">Completed</div></div>
          <div class="stat"><div class="num" style="color:var(--gold)">৳${fmtMoney(totals.revenue || 0)}</div><div class="label">Revenue</div></div>
        </div>

        <div class="card mt-24">
          <h3 style="font-family:var(--font-display);margin:0 0 8px">📦 Order Management</h3>
          <div class="muted" style="font-size:13px;margin-bottom:10px">Update order status. Changes are reflected instantly to the user via track-order & dashboard.</div>
          <div style="overflow:auto">
          <table id="ordersTable" style="width:100%;border-collapse:collapse;min-width:760px">
            <thead><tr><th style="text-align:left;padding:8px">Order ID</th><th style="text-align:left;padding:8px">User</th><th style="text-align:right;padding:8px">Amount</th><th style="text-align:right;padding:8px">Diamonds</th><th style="text-align:left;padding:8px">Payment</th><th style="text-align:left;padding:8px">Status</th><th style="text-align:left;padding:8px">Action</th></tr></thead>
            <tbody>${(orders.orders || []).map(o => `<tr style="border-top:1px solid var(--border)"><td style="padding:8px;font-family:monospace">${escapeHtml(o.id)}</td><td style="padding:8px">${escapeHtml(o.username || 'guest')}</td><td style="padding:8px;text-align:right">৳${fmtMoney(o.amount)}</td><td style="padding:8px;text-align:right">${Number(o.diamonds).toLocaleString()}</td><td style="padding:8px">${escapeHtml(o.payment_method)}</td><td style="padding:8px">${statusPill(o.status)}</td><td style="padding:8px"><select class="select" data-os="${escapeHtml(o.id)}" style="background:var(--bg-2);border:1px solid var(--border);border-radius:8px;color:#fff;padding:6px"><option value="pending">pending</option><option value="processing">processing</option><option value="completed">completed</option><option value="cancelled">cancelled</option></select><button class="btn btn-sm btn-primary" data-osave="${escapeHtml(o.id)}">Save</button></td></tr>`).join('')}</tbody>
          </table>
          </div>
          ${(orders.orders || []).length === 0 ? '<div class="muted mt-12">No orders yet.</div>' : ''}
        </div>

        <div class="card mt-24">
          <h3 style="font-family:var(--font-display);margin:0 0 8px">💎 Diamond Packages (Pricing)</h3>
          <p class="muted" style="font-size:13px;margin-bottom:10px">Edit price and label of each package. Changes apply instantly site-wide.</p>
          <div style="overflow:auto">
          <table id="pkgTable" style="width:100%;border-collapse:collapse;min-width:600px"><thead><tr><th style="text-align:left;padding:8px">Label</th><th style="text-align:right;padding:8px">Diamonds</th><th style="text-align:right;padding:8px">Price</th><th style="text-align:left;padding:8px">Badge</th><th style="text-align:left;padding:8px">Save</th></tr></thead><tbody>
            ${(await api('/api/packages')).packages.map(p => `<tr style="border-top:1px solid var(--border)"><td style="padding:8px"><input class="input" data-pl="${p.id}" value="${escapeHtml(p.label)}" style="padding:6px"/></td><td style="padding:8px;text-align:right">${Number(p.diamonds).toLocaleString()}</td><td style="padding:8px"><input type="number" min="0" class="input" data-pp="${p.id}" value="${Number(p.price)}" style="padding:6px;text-align:right"/></td><td style="padding:8px"><input class="input" data-pb="${p.id}" value="${escapeHtml(p.badge || '')}" placeholder="Popular / Best Buy…" style="padding:6px"/></td><td style="padding:8px"><button class="btn btn-sm btn-primary" data-psave="${p.id}">Save</button></td></tr>`).join('')}
          </tbody></table>
          </div>
        </div>

        <div class="card mt-24">
          <h3 style="font-family:var(--font-display);margin:0 0 8px">👥 Users</h3>
          <div style="overflow:auto">
          <table style="width:100%;border-collapse:collapse;min-width:540px"><thead><tr><th style="text-align:left;padding:8px">User</th><th style="text-align:left;padding:8px">Email</th><th style="text-align:right;padding:8px">Wallet</th><th style="text-align:left;padding:8px">Role</th></tr></thead><tbody>
            ${(u.users || []).map(usr => `<tr style="border-top:1px solid var(--border)"><td style="padding:8px">${escapeHtml(usr.username)}</td><td style="padding:8px">${escapeHtml(usr.email)}</td><td style="padding:8px;text-align:right;color:var(--gold)">৳${fmtMoney(usr.wallet_balance)}</td><td style="padding:8px"><span class="tag ${usr.role === 'admin' ? 'tag-gold' : ''}">${escapeHtml(usr.role)}</span></td></tr>`).join('')}
          </tbody></table>
          </div>
        </div>

        <div class="grid grid-2 mt-24">
          <div class="card">
            <h3 style="font-family:var(--font-display);margin:0 0 8px">💳 Payment Methods</h3>
            <p class="muted" style="font-size:13px;margin-bottom:8px">Account numbers & instructions shown above are demo content — replace before going live.</p>
            ${pay.methods.map(m => `<div class="card" style="margin-bottom:10px">
              <div class="row row-2">
                <div class="field"><label>Display Name</label><input class="input" data-pmn="${m.id}" value="${escapeHtml(m.display_name)}"/></div>
                <div class="field"><label>Account Number</label><input class="input" data-pma="${m.id}" value="${escapeHtml(m.account_number || '')}"/></div>
              </div>
              <div class="field"><label>Instructions</label><textarea class="input" data-pmi="${m.id}">${escapeHtml(m.instructions || '')}</textarea></div>
              <div class="flex gap-8"><button class="btn btn-sm btn-primary" data-pmsave="${m.id}">Save</button><span class="muted" style="align-self:center;font-size:12px">Method: ${escapeHtml(m.method)}</span></div>
            </div>`).join('')}
          </div>
          <div class="card">
            <h3 style="font-family:var(--font-display);margin:0 0 8px">⚙ Site Settings</h3>
            <div class="field"><label>Site Name</label><input class="input" data-set="site_name" value="${escapeHtml(set.site_name || 'TOPUP X ELITE')}"/></div>
            <div class="field"><label>Tagline</label><input class="input" data-set="site_tagline" value="${escapeHtml(set.site_tagline || '')}"/></div>
            <div class="row row-2">
              <div class="field"><label>Currency Symbol</label><input class="input" data-set="currency" value="${escapeHtml(set.currency || '৳')}"/></div>
              <div class="field"><label>Currency Code</label><input class="input" data-set="currency_code" value="${escapeHtml(set.currency_code || 'BDT')}"/></div>
            </div>
            <div class="row row-2">
              <div class="field"><label>Cashback %</label><input class="input" data-set="cashback_percent" value="${escapeHtml(set.cashback_percent || '5')}"/></div>
              <div class="field"><label>Daily Reward (৳)</label><input class="input" data-set="daily_reward" value="${escapeHtml(set.daily_reward || '5')}"/></div>
            </div>
            <div class="field"><label>Referral Bonus (৳)</label><input class="input" data-set="referral_bonus" value="${escapeHtml(set.referral_bonus || '10')}"/></div>
            <div class="field"><label>Support Email</label><input class="input" data-set="support_email" value="${escapeHtml(set.support_email || '')}"/></div>
            <div class="field"><label>Support Phone</label><input class="input" data-set="support_phone" value="${escapeHtml(set.support_phone || '')}"/></div>
            <div class="field"><label>Announcement</label><textarea class="input" data-set="announcement">${escapeHtml(set.announcement || '')}</textarea></div>
            <button class="btn btn-primary" id="saveSettings">💾 Save Settings</button>
          </div>
        </div>

        <div class="card mt-24">
          <h3 style="font-family:var(--font-display);margin:0 0 8px">🏞 Banners</h3>
          <p class="muted" style="font-size:13px;margin-bottom:8px">Manage homepage banners. (Hero content is currently inline — banners feed into future rotation.)</p>
          ${(banners.banners || []).map(b => `<div class="card" style="margin-bottom:10px">
            <div class="row row-2">
              <div class="field"><label>Title</label><input class="input" data-bt="${b.id}" value="${escapeHtml(b.title)}"/></div>
              <div class="field"><label>Subtitle</label><input class="input" data-bs="${b.id}" value="${escapeHtml(b.subtitle || '')}"/></div>
            </div>
            <div class="row row-2">
              <div class="field"><label>Button Text</label><input class="input" data-bct="${b.id}" value="${escapeHtml(b.cta_text || '')}"/></div>
              <div class="field"><label>Button Link</label><input class="input" data-bcl="${b.id}" value="${escapeHtml(b.cta_link || '')}"/></div>
            </div>
            <button class="btn btn-sm btn-primary" data-bsave="${b.id}">Save</button>
          </div>`).join('') || '<div class="muted">No banners.</div>'}
        </div>
      `;
      const reviewBox = document.createElement('div');
      reviewBox.className = 'card mt-24';
      reviewBox.innerHTML = `<h3 style="font-family:var(--font-display);margin:0 0 8px">⭐ Reviews</h3>
        <div class="row row-2"><input class="input" id="newReviewName" placeholder="Name"><input class="input" id="newReviewLocation" placeholder="Location"></div>
        <div class="row row-2"><input class="input" id="newReviewRating" type="number" min="1" max="5" value="5"><input class="input" id="newReviewQuote" placeholder="Review text"></div>
        <button class="btn btn-primary" id="addReviewBtn">➕ Add Review</button>
        <div class="mt-12">${(state.reviews||[]).map(r=>`<div class="card" style="margin-bottom:10px"><strong>${escapeHtml(r.name)}</strong> · ${Number(r.rating)}/5<br><textarea class="input" data-rquote="${r.id}">${escapeHtml(r.quote)}</textarea><button class="btn btn-sm btn-primary" data-rsave="${r.id}">Save</button> <button class="btn btn-sm" data-rhide="${r.id}">Hide</button></div>`).join('') || '<div class="muted">No reviews yet.</div>'}</div>`;
      content.appendChild(reviewBox);
      $('#addReviewBtn').onclick = async () => { try { await api('/api/admin/reviews',{method:'POST',body:JSON.stringify({name:$('#newReviewName').value,location:$('#newReviewLocation').value,rating:Number($('#newReviewRating').value),quote:$('#newReviewQuote').value})}); toast('Review added','ok'); await loadPublicContent(); renderAdmin(); } catch(e){toast(e.message,'err');} };
      $$('[data-rsave]').forEach(b=>b.onclick=async()=>{try{await api(`/api/admin/reviews/${b.dataset.rsave}`,{method:'PUT',body:JSON.stringify({quote:$(`[data-rquote="${b.dataset.rsave}"]`).value})});toast('Review saved','ok');await loadPublicContent();renderAdmin();}catch(e){toast(e.message,'err')}});
      $$('[data-rhide]').forEach(b=>b.onclick=async()=>{try{await api(`/api/admin/reviews/${b.dataset.rhide}`,{method:'DELETE'});toast('Review hidden','ok');await loadPublicContent();renderAdmin();}catch(e){toast(e.message,'err')}});
      // Wire order-status updates
      $$('[data-osave]').forEach(b => b.onclick = async () => {
        const id = b.dataset.osave; const sel = $(`[data-os="${id}"]`);
        try { await api(`/api/orders/${encodeURIComponent(id)}/status`, { method: 'PUT', body: JSON.stringify({ status: sel.value }) }); toast('Status updated to ' + sel.value, 'ok'); renderAdmin(); } catch (e) { toast(e.message, 'err'); }
      });
      $$('[data-os]').forEach(s => s.value = (orders.orders.find(o => o.id === s.dataset.os) || {}).status || 'pending');
      $$('[data-psave]').forEach(b => b.onclick = async () => {
        const id = b.dataset.psave;
        try { await api(`/api/packages/${id}`, { method: 'PUT', body: JSON.stringify({ label: $(`[data-pl="${id}"]`).value, price: Number($(`[data-pp="${id}"]`).value), badge: $(`[data-pb="${id}"]`).value }) }); toast('Package saved', 'ok'); await loadPackages(); renderAdmin(); } catch (e) { toast(e.message, 'err'); }
      });
      $$('[data-pmsave]').forEach(b => b.onclick = async () => {
        const id = b.dataset.pmsave;
        try { await api(`/api/admin/payment-settings/${id}`, { method: 'PUT', body: JSON.stringify({ display_name: $(`[data-pmn="${id}"]`).value, account_number: $(`[data-pma="${id}"]`).value, instructions: $(`[data-pmi="${id}"]`).value }) }); toast('Payment settings saved', 'ok'); await loadPaymentMethods(); } catch (e) { toast(e.message, 'err'); }
      });
      $$('[data-bsave]').forEach(b => b.onclick = async () => {
        const id = b.dataset.bsave;
        try { await api(`/api/admin/banners/${id}`, { method: 'PUT', body: JSON.stringify({ title: $(`[data-bt="${id}"]`).value, subtitle: $(`[data-bs="${id}"]`).value, cta_text: $(`[data-bct="${id}"]`).value, cta_link: $(`[data-bcl="${id}"]`).value }) }); toast('Banner saved', 'ok'); } catch (e) { toast(e.message, 'err'); }
      });
      $('#saveSettings').onclick = async () => {
        const entries = {}; $$('[data-set]').forEach(i => entries[i.dataset.set] = i.value);
        try { await api('/api/admin/site-settings', { method: 'PUT', body: JSON.stringify({ settings: entries }) }); toast('Settings saved', 'ok'); } catch (e) { toast(e.message, 'err'); }
      };
    } catch (e) { content.innerHTML = `<div class="alert error">${e.message}</div>`; }
  }

  loadPublicContent().then(() => { renderReviews(); applySiteSettings(); });

  /* ---------------- COUNTERS ---------------- */
  function animateCounters() {
    $$('[data-count]').forEach(el => {
      const target = Number(el.dataset.target) || 0;
      const suffix = el.dataset.suffix || '';
      const dur = 1400; const start = performance.now();
      function tick(t) {
        const k = Math.min(1, (t - start) / dur);
        const ease = 1 - Math.pow(1 - k, 3);
        el.textContent = Math.floor(target * ease).toLocaleString() + suffix;
        if (k < 1) requestAnimationFrame(tick);
        else el.textContent = target.toLocaleString() + suffix;
      }
      requestAnimationFrame(tick);
    });
  }

  /* ---------------- BOOT ---------------- */
  async function bootstrap() {
    loadAuth();
    $$('[data-nav]').forEach(a => a.onclick = (e) => { e.preventDefault(); navigate(a.dataset.nav); });
    $('#year').textContent = new Date().getFullYear();
    await Promise.all([loadPackages(), loadPaymentMethods(), loadBanners()]);
    renderNavCta(); wireAuth();

    // hide loader
    setTimeout(() => { const ls = $('#loadingScreen'); ls.classList.add('hide'); setTimeout(() => ls.remove(), 400); }, 400);
    show(getRoute());
    animateCounters();
  }
  document.addEventListener('DOMContentLoaded', bootstrap);
})();
