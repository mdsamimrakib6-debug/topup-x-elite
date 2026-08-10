require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const db = require('./db');
const bcrypt = require('bcryptjs');

function upsertSetting(key, value) {
  db.prepare(`INSERT INTO site_settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value`).run(key, String(value));
}

(async function seed() {
  console.log('• Seeding TOPUP X ELITE database…');

  // Default admin
  const adminEmail = (process.env.ADMIN_DEFAULT_EMAIL || '').toLowerCase();
  const adminPass = process.env.ADMIN_DEFAULT_PASSWORD || '';
  const adminUser = process.env.ADMIN_DEFAULT_USERNAME || 'admin';
  if (!adminEmail || !adminPass || adminPass.length < 10) throw new Error('Set ADMIN_DEFAULT_EMAIL and a strong ADMIN_DEFAULT_PASSWORD (10+ chars) in .env before seeding.');
  const found = db.prepare('SELECT id FROM users WHERE email = ?').get(adminEmail);
  if (!found) {
    const hash = await bcrypt.hash(adminPass, 10);
    db.prepare(`INSERT INTO users (username, email, password_hash, role, wallet_balance, referral_code, created_at) VALUES (?,?,?,?,?,?,?)`)
      .run(adminUser, adminEmail, hash, 'admin', 0, (adminUser + '-ROOT').toUpperCase(), Date.now());
    console.log(`  ✓ Admin created → ${adminEmail} (change password after first login)`);
  } else {
    console.log(`  • Admin already exists → ${adminEmail}`);
  }

  // Site settings (demo-tagged, editable from admin)
  const defaults = {
    site_name: 'TOPUP X ELITE',
    site_tagline: 'Fast • Secure • Trusted Top-Up',
    currency: '৳',
    currency_code: 'BDT',
    support_email: 'support@topupxelite.local',
    support_phone: '+880000000000',
    announcement: 'Demo data shown. Connect a real payment gateway before accepting real money.',
    cashback_percent: '5',
    referral_bonus: '10',
    daily_reward: '5'
  };
  Object.entries(defaults).forEach(([k, v]) => upsertSetting(k, v));

  // Payment methods (clearly editable from admin)
  const paySeed = [
    { method: 'bkash', display_name: 'bKash', account_number: '01XXXXXXXXX (editable from Admin)', instructions: 'Send the exact amount to the number above, then enter your bKash Transaction ID (TrxID) on the order form. Do NOT share your PIN with anyone.', active: 1 },
    { method: 'nagad', display_name: 'Nagad', account_number: '01XXXXXXXXX (editable from Admin)', instructions: 'Send the exact amount to the Nagad number above, then enter your Transaction ID on the order form.', active: 1 },
    { method: 'rocket', display_name: 'Rocket', account_number: '01XXXXXXXXX-8 (editable from Admin)', instructions: 'Send the exact amount to the Rocket account above, then enter your Transaction ID on the order form.', active: 1 }
  ];
  paySeed.forEach(p => {
    const ex = db.prepare('SELECT id FROM payment_settings WHERE method = ?').get(p.method);
    if (!ex) {
      db.prepare(`INSERT INTO payment_settings (method, display_name, account_number, instructions, active) VALUES (?,?,?,?,?)`)
        .run(p.method, p.display_name, p.account_number, p.instructions, p.active);
    }
  });

  // Packages (EDITABLE from Admin — these are placeholder pricing)
  const pkgSeed = [
    { diamonds: 25,   price: 19,   label: '25 Diamonds',  bonus: 0,  badge: 'Starter',   sort_order: 1 },
    { diamonds: 50,   price: 38,   label: '50 Diamonds',  bonus: 0,  badge: null,        sort_order: 2 },
    { diamonds: 100,  price: 75,   label: '100 Diamonds', bonus: 0,  badge: 'Popular',  sort_order: 3 },
    { diamonds: 115,  price: 86,   label: '115 Diamonds', bonus: 0,  badge: null,        sort_order: 4 },
    { diamonds: 240,  price: 180,  label: '240 Diamonds', bonus: 0,  badge: null,        sort_order: 5 },
    { diamonds: 355,  price: 265,  label: '355 Diamonds', bonus: 0,  badge: 'Best Buy', sort_order: 6 },
    { diamonds: 480,  price: 358,  label: '480 Diamonds', bonus: 0,  badge: null,        sort_order: 7 },
    { diamonds: 610,  price: 455,  label: '610 Diamonds', bonus: 0,  badge: null,        sort_order: 8 },
    { diamonds: 850,  price: 635,  label: '850 Diamonds', bonus: 0,  badge: null,        sort_order: 9 },
    { diamonds: 1090, price: 810,  label: '1090 Diamonds',bonus: 0,  badge: 'Value',    sort_order: 10 },
    { diamonds: 1360, price: 1015, label: '1360 Diamonds',bonus: 0,  badge: null,        sort_order: 11 },
    { diamonds: 2180, price: 1620, label: '2180 Diamonds',bonus: 0,  badge: 'Pro',      sort_order: 12 }
  ];
  pkgSeed.forEach(p => {
    const ex = db.prepare('SELECT id FROM packages WHERE diamonds = ? AND label = ?').get(p.diamonds, p.label);
    if (!ex) {
      db.prepare(`INSERT INTO packages (diamonds, price, label, bonus, badge, sort_order, active) VALUES (?,?,?,?,?,?,1)`)
        .run(p.diamonds, p.price, p.label, p.bonus, p.badge, p.sort_order);
    }
  });

  // Sample reviews (editable from Admin Panel)
  const reviewCount = db.prepare('SELECT COUNT(*) as c FROM reviews').get().c;
  if (reviewCount === 0) {
    const reviews = [
      ['Arif H.', 'Dhaka', 5, 'Order was completed quickly and tracking was easy.', 1, 1],
      ['Nafisa R.', 'Chattogram', 5, 'Clean interface and clear payment instructions.', 1, 2],
      ['Sabbir K.', 'Sylhet', 4, 'Good package selection and simple order flow.', 1, 3]
    ];
    const stmt = db.prepare('INSERT INTO reviews (name, location, rating, quote, verified, active, sort_order, created_at) VALUES (?,?,?,?,?,?,?,?)');
    reviews.forEach(r => stmt.run(...r, Date.now()));
  }

  // Hero banners (demo content)
  const bannerCount = db.prepare('SELECT COUNT(*) as c FROM banners').get().c;
  if (bannerCount === 0) {
    db.prepare(`INSERT INTO banners (title, subtitle, image_url, cta_text, cta_link, sort_order, active) VALUES (?,?,?,?,?,?,1)`)
      .run('Instant Free Fire Top-Up', 'Diamonds delivered in minutes. Secure payments via bKash, Nagad & Rocket.', null, 'Top Up Now', '/topup', 1);
    db.prepare(`INSERT INTO banners (title, subtitle, image_url, cta_text, cta_link, sort_order, active) VALUES (?,?,?,?,?,?,1)`)
      .run('Daily Rewards & Cashback', 'Spin the wheel every day and earn up to 5% cashback on completed orders.', null, 'Open Rewards', '/rewards', 2);
  }

  console.log('✔ Seed complete.');
})();
