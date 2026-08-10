const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const db = require('../db');

const JWT_SECRET = process.env.JWT_SECRET || 'dev-only-secret-CHANGE-IN-PROD';
const TOKEN_TTL = '7d';

function signToken(user) {
  return jwt.sign(
    { id: user.id, username: user.username, email: user.email, role: user.role },
    JWT_SECRET,
    { expiresIn: TOKEN_TTL }
  );
}

function verifyToken(token) {
  try { return jwt.verify(token, JWT_SECRET); } catch { return null; }
}

function authRequired(req, res, next) {
  const header = req.headers.authorization || '';
  const bearer = header.startsWith('Bearer ') ? header.slice(7) : null;
  const token = bearer || req.cookies?.auth_token;
  const payload = token ? verifyToken(token) : null;
  if (!payload) return res.status(401).json({ error: 'Authentication required' });
  const user = db.prepare('SELECT id, username, email, phone, role, wallet_balance, referral_code FROM users WHERE id = ?').get(payload.id);
  if (!user) return res.status(401).json({ error: 'User not found' });
  req.user = user;
  next();
}

function adminRequired(req, res, next) {
  authRequired(req, res, () => {
    if (!req.user || req.user.role !== 'admin') return res.status(403).json({ error: 'Admin access required' });
    next();
  });
}

async function hashPassword(pw) { return bcrypt.hash(pw, 10); }
async function comparePassword(pw, hash) { return bcrypt.compare(pw, hash); }

module.exports = { signToken, verifyToken, authRequired, adminRequired, hashPassword, comparePassword, JWT_SECRET };
