# TOPUP X ELITE

Premium mobile-first Free Fire diamond top-up demo platform built with Node.js, Express, SQLite and vanilla HTML/CSS/JS.

## Important before going live
- Wallet top-up is **DEMO/MOCK**. Do not accept real customer funds until a real payment gateway and server-side webhook verification are integrated.
- Never commit `.env`, `data/topup.db`, or database WAL/SHM files.
- Change the admin password immediately after first login.
- Replace all demo payment numbers, prices, banners, reviews and notices from the Admin Panel.
- Use a strong `JWT_SECRET` (64+ random characters) in production.

## Features
- User registration/login and password change
- Admin authorization enforced server-side
- Diamond package CRUD from Admin Panel
- Order creation, tracking and status management
- bKash/Nagad/Rocket payment display settings
- Wallet and transaction history
- Daily reward, cashback and referral bonus settings
- Lucky spin
- Banner management
- Review management
- Site settings
- User role/phone/wallet management

## Project structure
```text
topup-x-elite/
├─ server/
│  ├─ index.js
│  ├─ db.js
│  ├─ seed.js
│  ├─ middleware/auth.js
│  └─ routes/
│     ├─ auth.js
│     ├─ packages.js
│     ├─ orders.js
│     ├─ wallet.js
│     └─ admin.js
├─ public/
│  ├─ index.html
│  ├─ css/styles.css
│  └─ js/app.js
├─ data/                 # local SQLite database; ignored by git
├─ .env.example
├─ .gitignore
└─ package.json
```

## Local setup
```bash
npm install
cp .env.example .env
# edit .env with your own secrets
npm run seed
npm start
```
Open `http://localhost:3000`.

## Admin
The seed script creates the admin using `ADMIN_DEFAULT_*` values from `.env`. Do not publish those values. Change the password immediately after first login.

## Deployment
Render/Railway/Fly can run the Node service. SQLite needs persistent storage; otherwise the database can reset on redeploy/restart. For serious production use, move the data layer to a managed database.

## Real payments
For bKash/Nagad/Rocket or another provider, create a server-side payment initiation + webhook verification flow. Never trust a transaction ID submitted by the browser as proof of payment.
