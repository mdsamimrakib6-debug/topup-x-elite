require('dotenv').config();

const path = require('path');
const express = require('express');
const cookieParser = require('cookie-parser');
const rateLimit = require('express-rate-limit');

const app = express();

app.use(express.json({ limit: '256kb' }));
app.use(express.urlencoded({ extended: true, limit: '256kb' }));
app.use(cookieParser());

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false
});

app.use('/api/auth/login', authLimiter);

// Security headers
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader(
    'Permissions-Policy',
    'geolocation=(), microphone=(), camera=()'
  );
  next();
});

// Routes
app.use('/api/auth', require('./auth'));
app.use('/api/packages', require('./packages'));
app.use('/api/orders', require('./orders'));
app.use('/api/wallet', require('./wallet'));
app.use('/api/admin', require('./admin'));

// Health check
app.get('/api/health', (req, res) => {
  res.json({
    ok: true,
    name: 'TOPUP X ELITE',
    time: Date.now()
  });
});

// Static files
app.use(express.static(__dirname));

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

// Error handler
app.use((err, req, res, next) => {
  console.error('ERROR:', err);
  res.status(500).json({
    error: 'Server error'
  });
});

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`TOPUP X ELITE running on port ${PORT}`);
});
