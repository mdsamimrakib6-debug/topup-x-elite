require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const express = require('express');
const path = require('path');
const cookieParser = require('cookie-parser');
const db = require('./db');

const app = express();
app.disable('x-powered-by');
app.set('trust proxy', 1);
app.use(express.json({ limit: '256kb' }));
app.use(express.urlencoded({ extended: true, limit: '256kb' }));
app.use(cookieParser());
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'geolocation=(), microphone=(), camera=()');
  next();
});

app.use((req, res, next) => {
  if (req.path.startsWith('/api') || req.path.startsWith('/css') || req.path.startsWith('/js') || req.path.startsWith('/assets')) return next();
  const s = db.prepare("SELECT value FROM site_settings WHERE key='maintenance_mode'").get();
  if (s && Number(s.value) === 1) {
    const n = db.prepare("SELECT value FROM site_settings WHERE key='notice'").get();
    res.setHeader('Retry-After','3600');
    return res.status(503).send('<!doctype html><html><head><title>Maintenance</title><meta name="viewport" content="width=device-width,initial-scale=1"><style>body{margin:0;background:#050608;color:#f4f5f7;font-family:system-ui;display:grid;place-items:center;height:100vh;text-align:center;padding:24px}h1{color:#f5c542;font-size:32px;margin:0 0 12px}p{color:#9aa0ad}</style></head><body><div><div style="font-size:64px">🔧</div><h1>TOPUP X ELITE — Under Maintenance</h1><p>' + (n?.value || 'We are upgrading. Please check back soon.') + '</p></div></body></html>');
  }
  next();
});

app.use('/api/auth', require('./routes/auth'));
app.use('/api/packages', require('./routes/packages'));
app.use('/api/orders', require('./routes/orders'));
app.use('/api/wallet', require('./routes/wallet'));
app.use('/api/admin', require('./routes/admin'));

app.get('/api/health', (req, res) => res.json({ ok: true, name: 'TOPUP X ELITE', time: Date.now(), provider_mode: process.env.TOPUP_PROVIDER_MODE || 'manual' }));
app.get('/api/site-settings', (req, res) => { const m={}; db.prepare('SELECT * FROM site_settings').all().forEach(r => m[r.key] = r.value); res.json({ settings: m }); });

app.get('/robots.txt', (req, res) => {
  const base = process.env.PUBLIC_BASE_URL || ('http://localhost:' + (process.env.PORT || 3000));
  res.type('text/plain').send('User-agent: *\nAllow: /\nSitemap: ' + base + '/sitemap.xml\n');
});
app.get('/sitemap.xml', (req, res) => {
  const base = process.env.PUBLIC_BASE_URL || ('http://localhost:' + (process.env.PORT || 3000));
  const urls = ['', '/shop', '/track', '/rewards', '/contact', '/login', '/register'].map(p => '<url><loc>'+base+p+'</loc><changefreq>daily</changefreq></url>').join('');
  res.type('application/xml').send('<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">'+urls+'</urlset>');
});

app.use(express.static(path.join(__dirname, '..', 'public')));
app.get('*', (req, res) => res.sendFile(path.join(__dirname, '..', 'public', 'index.html')));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log('✔ TOPUP X ELITE running at http://localhost:'+PORT);
  console.log('  • Provider mode: '+ (process.env.TOPUP_PROVIDER_MODE || 'manual'));
});
