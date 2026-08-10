require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const db = require('./db');
const bcrypt = require('bcryptjs');
function upsert(k, v) {
  db.prepare('INSERT INTO site_settings (key, value, updated_at) VALUES (?, ?, ?) ON CONFLICT(key) DO UPDATE SET value=excluded.value, updated_at=excluded.updated_at').run(k, String(v), Date.now());
}
(async () => {
  console.log('• Seeding…');
  const email = (process.env.ADMIN_DEFAULT_EMAIL || 'admin@topupxelite.local').toLowerCase();
  const pass = process.env.ADMIN_DEFAULT_PASSWORD || 'Admin@ChangeMe123';
  const username = process.env.ADMIN_DEFAULT_USERNAME || 'admin';
  const ex = db.prepare('SELECT id FROM users WHERE email = ?').get(email);
  if (!ex) {
    const hash = await bcrypt.hash(pass, 10);
    db.prepare('INSERT INTO users (username, email, password_hash, role, wallet_balance, referral_code, created_at) VALUES (?,?,?,?,?,?,?)').run(username, email, hash, 'admin', 0, 'TXEADM-ROOT', Date.now());
    console.log('  ✓ admin created → '+email);
  } else { db.prepare('UPDATE users SET role = ? WHERE id = ?').run('admin', ex.id); console.log('  • admin exists → '+email); }

  Object.entries({
    site_name: 'TOPUP X ELITE', site_tagline: 'Fast • Secure • Trusted Free Fire Top-Up', currency: '৳', currency_code: 'BDT',
    logo_text: 'X', favicon_url: '',
    notice: 'Demo platform — every value (prices, payment numbers, banners, logos) is editable from the Admin Panel.',
    support_email: 'support@topupxelite.local', support_phone: '+880000000000',
    social_facebook: 'https://facebook.com/yourpage', social_telegram: 'https://t.me/yourpage', social_whatsapp: '',
    cashback_percent: '5', referral_bonus: '10', daily_reward: '5',
    daily_reward_enabled: '1', spin_enabled: '1', maintenance_mode: '0',
    contact_address: 'Dhaka, Bangladesh',
    provider_mode: process.env.TOPUP_PROVIDER_MODE || 'manual',
    hero_headline: 'Instant Free Fire Diamond Top-Up',
    hero_sub: 'Premium diamonds delivered to your account — secure local payments, transparent pricing and a clear order tracker.'
  }).forEach(([k,v]) => upsert(k,v));

  [
    { method: 'bkash', display_name: 'bKash', account_number: '01XXXXXXXXX (Admin editable)', instructions: 'Send the exact total to this bKash number, then enter the TrxID on the order page. Never share your PIN with anyone.', active: 1, icon: 'bkash' },
    { method: 'nagad', display_name: 'Nagad', account_number: '01XXXXXXXXX (Admin editable)', instructions: 'Send the exact total to the Nagad account above, then enter the Transaction ID.', active: 1, icon: 'nagad' },
    { method: 'rocket', display_name: 'Rocket', account_number: '01XXXXXXXXX-8 (Admin editable)', instructions: 'Send the exact total to this Rocket account, then enter the Transaction ID below.', active: 1, icon: 'rocket' }
  ].forEach(p => { if (!db.prepare('SELECT id FROM payment_settings WHERE method=?').get(p.method)) db.prepare('INSERT INTO payment_settings (method, display_name, account_number, instructions, active, icon) VALUES (?,?,?,?,?,?)').run(p.method, p.display_name, p.account_number, p.instructions, p.active, p.icon); });

  [
    { d:25,  p:19,  op:25,   disc:24, l:'25 Diamonds',   b:'Starter',  pop:0, s:1 },
    { d:50,  p:38,  op:50,   disc:24, l:'50 Diamonds',   b:null,       pop:0, s:2 },
    { d:100, p:75,  op:100,  disc:25, l:'100 Diamonds',  b:'Popular',  pop:1, s:3 },
    { d:115, p:86,  op:115,  disc:25, l:'115 Diamonds',  b:null,       pop:0, s:4 },
    { d:240, p:180, op:240,  disc:25, l:'240 Diamonds',  b:null,       pop:0, s:5 },
    { d:355, p:265, op:355,  disc:25, l:'355 Diamonds',  b:'Best Buy', pop:1, s:6 },
    { d:480, p:358, op:480,  disc:25, l:'480 Diamonds',  b:null,       pop:0, s:7 },
    { d:610, p:455, op:610,  disc:25, l:'610 Diamonds',  b:null,       pop:0, s:8 },
    { d:850, p:635, op:850,  disc:25, l:'850 Diamonds',  b:'Value',    pop:1, s:9 },
    { d:1090,p:810, op:1090, disc:26, l:'1090 Diamonds', b:null,       pop:0, s:10 },
    { d:1360,p:1015,op:1360, disc:25, l:'1360 Diamonds', b:null,       pop:0, s:11 },
    { d:2180,p:1620,op:2180, disc:26, l:'2180 Diamonds', b:'Pro',      pop:1, s:12 }
  ].forEach(p => { if (!db.prepare('SELECT id FROM packages WHERE diamonds=? AND label=?').get(p.d, p.l)) db.prepare('INSERT INTO packages (diamonds, price, original_price, discount, label, description, image_url, stock, badge, popular, sort_order, active) VALUES (?,?,?,?,?,?,?,?,?,?,?,1)').run(p.d, p.p, p.op, p.disc, p.l, 'Demo package — pricing editable from Admin.', null, -1, p.b, p.pop, p.s); });

  const bc = db.prepare('SELECT COUNT(*) as c FROM banners').get().c;
  if (bc === 0) {
    db.prepare('INSERT INTO banners (title, subtitle, image_url, cta_text, cta_link, sort_order, active) VALUES (?,?,?,?,?,?,1)').run('Instant Free Fire Top-Up', 'Diamonds, weekly pass and bundles — secure local payments.', null, 'Shop Now', '/shop', 1);
  }
  console.log('✔ seed done');
})();
