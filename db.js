const path = require('path');
const fs = require('fs');
const Database = require('better-sqlite3');
const DB_PATH = process.env.DB_PATH || path.join(__dirname, '..', 'data', 'topup.db');
fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT UNIQUE NOT NULL,
  email TEXT UNIQUE NOT NULL,
  phone TEXT,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'user',
  status TEXT NOT NULL DEFAULT 'active',
  wallet_balance REAL NOT NULL DEFAULT 0,
  referral_code TEXT UNIQUE NOT NULL,
  referred_by TEXT,
  created_at INTEGER NOT NULL,
  last_login_at INTEGER
);
CREATE TABLE IF NOT EXISTS password_resets (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  token TEXT UNIQUE NOT NULL,
  expires_at INTEGER NOT NULL,
  used INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  FOREIGN KEY(user_id) REFERENCES users(id)
);
CREATE TABLE IF NOT EXISTS orders (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  order_id TEXT UNIQUE NOT NULL,
  user_id INTEGER,
  package_id INTEGER,
  diamonds INTEGER NOT NULL,
  amount REAL NOT NULL,
  discount REAL NOT NULL DEFAULT 0,
  player_uid TEXT NOT NULL,
  server_id TEXT,
  payment_method TEXT NOT NULL,
  transaction_id TEXT,
  customer_phone TEXT NOT NULL,
  note TEXT,
  status TEXT NOT NULL DEFAULT 'pending_payment',
  delivery_status TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  FOREIGN KEY(user_id) REFERENCES users(id),
  FOREIGN KEY(package_id) REFERENCES packages(id)
);
CREATE TABLE IF NOT EXISTS packages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  diamonds INTEGER NOT NULL,
  price REAL NOT NULL,
  original_price REAL,
  discount REAL NOT NULL DEFAULT 0,
  label TEXT NOT NULL,
  description TEXT,
  image_url TEXT,
  stock INTEGER NOT NULL DEFAULT -1,
  badge TEXT,
  popular INTEGER NOT NULL DEFAULT 0,
  active INTEGER NOT NULL DEFAULT 1,
  sort_order INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS wallet_transactions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  type TEXT NOT NULL,
  amount REAL NOT NULL,
  balance_after REAL NOT NULL,
  note TEXT,
  reference TEXT,
  created_at INTEGER NOT NULL,
  FOREIGN KEY(user_id) REFERENCES users(id)
);
CREATE TABLE IF NOT EXISTS rewards (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  reward_type TEXT NOT NULL,
  amount REAL NOT NULL,
  description TEXT,
  reference TEXT,
  created_at INTEGER NOT NULL,
  FOREIGN KEY(user_id) REFERENCES users(id)
);
CREATE TABLE IF NOT EXISTS referrals (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  referrer_id INTEGER NOT NULL,
  referee_id INTEGER NOT NULL,
  bonus REAL NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  UNIQUE(referrer_id, referee_id),
  FOREIGN KEY(referrer_id) REFERENCES users(id),
  FOREIGN KEY(referee_id) REFERENCES users(id)
);
CREATE TABLE IF NOT EXISTS payment_settings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  method TEXT UNIQUE NOT NULL,
  display_name TEXT NOT NULL,
  account_number TEXT,
  instructions TEXT,
  active INTEGER NOT NULL DEFAULT 1,
  icon TEXT
);
CREATE TABLE IF NOT EXISTS site_settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS banners (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  subtitle TEXT,
  image_url TEXT,
  cta_text TEXT,
  cta_link TEXT,
  active INTEGER NOT NULL DEFAULT 1,
  sort_order INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_orders_user ON orders(user_id);
CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status);
CREATE INDEX IF NOT EXISTS idx_orders_uid ON orders(player_uid);
CREATE INDEX IF NOT EXISTS idx_packages_active ON packages(active);
CREATE INDEX IF NOT EXISTS idx_wallet_user ON wallet_transactions(user_id);
`);
module.exports = db;
