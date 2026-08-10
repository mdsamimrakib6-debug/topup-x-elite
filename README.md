# TOPUP X ELITE

A premium, mobile-first **Free Fire diamond top-up** platform — full-stack Node.js + SQLite with real authentication (bcrypt + JWT), server-side authorization, wallet, rewards, cashback, order tracking, and a complete admin panel.

> Demo-build: every price, payment number, banner, review and stat on the site is editable from the Admin Panel. The wallet top-up uses a clearly-labeled **mock payment flow** — connect a real gateway (bKash/Nagad/Rocket API with webhook confirmation) before going live with real money.

---

## Features

### Brand & UI
- Premium black + gold + neon gaming aesthetic
- TOPUP X ELITE logo, glassmorphism cards, glowing CTA buttons
- Animated counters, skeleton loaders, loader screen, toast notifications
- Mobile-first responsive design, bottom navigation, sticky top nav
- Smooth hover effects, transitions and esports-style typography

### Pages & Sections
- **Home** — hero, featured diamond packages, why-choose-us, customer reviews, FAQ, footer
- **Free Fire Top-Up** — all diamond packages (25 / 50 / 100 / 115 / 240 / 355 / 480 / 610 / 850 / 1090 / 1360 / 2180) + Custom Package builder
- **Order page** — UID, Server ID, package summary, payment method, transaction ID, note
- **Order Tracking** — enter Order ID, see live status (pending / processing / completed / cancelled)
- **Auth** — Register, Login, Logout, change password
- **User Dashboard** — profile, wallet balance, referral code, recent orders
- **Wallet** — balance, Add Money (mock), transaction history
- **Rewards** — daily bonus, cashback, lucky spin (weighted wheel), referral rewards, history
- **Admin Panel** — stats, order management, package pricing, user list, payment settings, wallet management, cashback settings, reward settings, site settings, banner management
- **Footer** — links, brand and demo notice

### Order System
- Unique generated Order ID per order (`TXE-XXXXXXX-XXXXX`)
- Full lifecycle: `pending → processing → completed` (or `cancelled`)
- Track-by-ID endpoint (no login required)
- Admin updates stick — user sees new status instantly

### Wallet
- Balance, mock top-up (clearly demo-flagged), transaction log, cashback credit, reward credit

### Payment Methods
- Built-in cards for **bKash**, **Nagad**, **Rocket**
- Display name, account number and instructions fully editable from Admin Panel
- Credentials never hard-coded in frontend HTML/JS

### Security
- Bcrypt-hashed passwords (10 rounds)
- JWT auth with 7-day TTL, sent via `Authorization: Bearer` header
- Server-side `requireAuth` and `requireAdmin` middleware on every protected route
- Rate-limited order creation (10/min)
- Strict input validation (UID digits, phone digits, amount values)
- Security headers (XCTO, X-Frame, Referrer-Policy, Permissions-Policy)
- No secret keys ever exposed in client code
- Demo-mode payment endpoints labelled as `[DEMO]` in DB notes

---

## Tech Stack

- **Backend:** Node.js + Express, better-sqlite3 (file-backed)
- **Auth:** bcryptjs + JSON Web Tokens
- **Frontend:** Vanilla HTML / CSS / JS (no build step), mobile-first, glassmorphism UI
- **DB:** SQLite (one file, zero-config) under `data/topup.db`

---

## Quick Start (local)

```bash
cd topup-x-elite
cp .env.example .env          # edit secrets before going live
npm install
node server/seed.js           # creates DB + admin user + sample packages + payments + banners
npm start                     # or: node server/index.js
```

Visit: <http://localhost:3000>

### Default Admin (CHANGE IMMEDIATELY)

- Email: `admin@topupxelite.local`
- Password: `Admin@ChangeMe123`
- Username: `admin`

Set `ADMIN_DEFAULT_PASSWORD` to your own strong password in `.env` before booting the seed script.

---

## Project Structure

```
topup-x-elite/
├─ server/
│  ├─ index.js              # Express bootstrap + static + routes
│  ├─ db.js                 # SQLite schema + connection
│  ├─ seed.js               # Initial admin / packages / payments / settings
│  ├─ middleware/auth.js    # bcrypt + JWT + requireAuth / requireAdmin
│  └─ routes/
│     ├─ auth.js            # register / login / me / change-password / logout
│     ├─ packages.js        # list (public) + admin CRUD
│     ├─ orders.js          # create / track / mine / admin status update
│     ├─ wallet.js          # balance / top-up (DEMO) / daily / cashback / spin
│     └─ admin.js           # stats / users / payment-settings / site-settings / banners
├─ public/
│  ├─ index.html            # All routes in a single SPA-style page
│  ├─ css/styles.css        # Design system (black/gold/neon, glass, bottom nav)
│  └─ js/app.js             # Router + API client + view rendering
├─ data/                    # SQLite DB lives here (gitignored)
├─ .env.example
├─ .gitignore
└─ package.json
```

---

## API Reference (selected)

| Method | Path                          | Auth          | Purpose                                  |
| ------ | ----------------------------- | ------------- | ---------------------------------------- |
| GET    | `/api/health`                 | public        | Service health check                     |
| GET    | `/api/packages`               | public        | List active packages                     |
| POST   | `/api/auth/register`          | public        | Create account                           |
| POST   | `/api/auth/login`             | public        | Authenticate (returns JWT)               |
| GET    | `/api/auth/me`                | user          | Current user                             |
| POST   | `/api/auth/change-password`   | user          | Change password                          |
| POST   | `/api/auth/logout`            | user          | Clear cookie                             |
| POST   | `/api/orders`                 | user          | Place a top-up order                     |
| GET    | `/api/orders/mine`            | user          | My orders                                |
| GET    | `/api/orders/track/:id`       | public        | Track an order by ID                     |
| PUT    | `/api/orders/:id/status`      | admin         | Update order status                      |
| GET    | `/api/wallet/me`              | user          | Balance + transactions                  |
| POST   | `/api/wallet/topup`           | user          | DEMO wallet top-up                       |
| POST   | `/api/wallet/reward/daily`    | user          | Claim daily bonus                        |
| POST   | `/api/wallet/reward/cashback` | user          | Claim 5% cashback on completed orders    |
| POST   | `/api/wallet/reward/spin`     | user          | Spin the lucky wheel                     |
| GET    | `/api/wallet/rewards/history` | user          | Reward history                           |
| GET    | `/api/admin/stats`            | admin         | Dashboard stats                          |
| GET    | `/api/admin/orders`           | admin         | All orders                               |
| GET    | `/api/admin/users`            | admin         | All users                                |
| GET    | `/api/admin/payment-settings` | public        | Payment methods (used by users)          |
| POST   | `/api/admin/payment-settings` | admin         | Add payment method                       |
| PUT    | `/api/admin/payment-settings/:id` | admin     | Edit payment method                      |
| GET    | `/api/admin/site-settings`    | public        | Site settings (used by users)            |
| PUT    | `/api/admin/site-settings`    | admin         | Bulk update site settings                |
| GET    | `/api/admin/banners`          | public        | Active banners                           |
| POST   | `/api/admin/banners`          | admin         | Add banner                               |
| PUT    | `/api/admin/banners/:id`      | admin         | Edit banner                              |
| DELETE | `/api/admin/banners/:id`      | admin         | Hide banner                              |

All `Auth: user` endpoints additionally require `requireAuth`. All `Auth: admin` endpoints require both `requireAuth` and `requireAdmin` — server-enforced, not client-side.

---

## Tested User Flows

The following flows were verified end-to-end against the running server:

1. **Register → Login → Place Order → Track:** new user signs up, logs in, selects a package, submits a valid UID + payment, receives a generated Order ID, and tracks its status from the **public** Order Tracking page.
2. **Admin Login → View Orders → Change Status → User Sees Update:** admin logs in with the seeded admin credentials, opens `/admin`, lists orders, flips a status from `pending` → `processing` → `completed`, and immediately re-tracks the Order ID to see the new status reflected.

---

## Free Deployment Guide

### Option A — Render (recommended, always-free Node service)

1. Push this folder to a new GitHub repo.
2. On <https://render.com>, click **New → Web Service** → connect the repo.
3. Build command: `npm install && node server/seed.js`
4. Start command: `npm start`
5. Add env vars from `.env.example` (`JWT_SECRET`, `ADMIN_DEFAULT_*`, etc.) in Render's **Environment** tab.
6. Render auto-issues HTTPS. Optional: add a free Render-managed Postgres later — the SQLite layer abstracts to a single file.

### Option B — Railway.app

1. New Project → Deploy from GitHub → choose the repo.
2. Add the same env vars. Railway auto-detects `npm start`.
3. Free hobby tier gives ~$5/month compute — enough to run this app comfortably.

### Option C — Fly.io or Glitch

Identical process: `npm install && node server/seed.js && npm start`. Persistent volume mount needed for `data/topup.db` so the SQLite file isn't reset on every boot.

### Option D — Static-only on Vercel + external API

The `public/` folder is plain static. You can split the project by deploying only `public/` to Vercel and the Express server on Render/Railway, adjusting the `api(path)` base URL in `public/js/app.js` to point at your live backend.

---

## Going Live With Real Money

Before accepting real customer funds:

1. Replace the wallet/orders `DEMO` flows with a real payment gateway.
2. For **bKash / Nagad / Rocket**, integrate their payment APIs and verify every transaction via server-side webhook before flipping an order's status to `completed`.
3. Replace `JWT_SECRET` with a 64-character random string.
4. Change the default admin password and remove `ADMIN_DEFAULT_*` env vars.
5. Replace the seeded payment numbers, banners, reviews and stats from the Admin Panel.
6. Enable HTTPS (Render/Railway/Vercel include this for free).
7. Add a privacy policy and terms page.

---

## License

MIT — use freely for personal or commercial projects.
