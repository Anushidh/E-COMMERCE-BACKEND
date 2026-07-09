# Wearhaus Backend API

A mathematically precise, full-featured e-commerce backend built with **Node.js**, **Express**, **TypeScript**, and **MongoDB**. This engine is designed to mimic enterprise-grade e-commerce operations, featuring advanced inventory locks, cryptographic payment verifications, and strict atomic transactions.

---

## 🛠️ The Technology Stack

- **Runtime:** Node.js + TypeScript
- **Framework:** Express.js
- **Database:** MongoDB (Mongoose) with strict `Session` Transactions
- **Cache/Store:** Redis (ioredis) for OTPs and session blacklisting
- **Authentication:** JWT (access + refresh tokens), Google OAuth 2.0 (Passport.js)
- **Payments:** Razorpay (online) + Cash on Delivery
- **Image Uploads:** Multer + Cloudinary (Stateless processing)
- **Email:** Nodemailer (SMTP)
- **Validation:** Zod
- **Precision Math:** `decimal.js` (Bypassing IEEE 754 floating-point errors)
- **Logging:** Morgan
- **Rate Limiting:** express-rate-limit

---

## 📦 Core Architecture & Modules

The backend is heavily modularized. Detailed technical documentation for each component can be found in the root `modules/` directory.

### 1. Catalog & Inventory Management
- **Products & Categories**: Hierarchical taxonomy with soft-delete patterns.
- **Variant-Level Stock**: Inventory is tracked strictly at the Size/Color level. Stock is atomically decremented upon order placement to prevent overselling.
- **Garbage-Collected Uploads**: Stateless Cloudinary streaming architecture prevents the local disk from filling up with temporary files.

### 2. The Calculation Engine (Finance & Taxes)
- **Zero Floating-Point Errors**: All financial operations (Cart totals, Wallets, Coupons, Taxes) use `decimal.js`.
- **MRP-First Tax Extraction**: GST (CGST/SGST vs IGST) is reverse-calculated from inclusive MRPs based on shipping state borders (Maharashtra).
- **Wallet & Referrals**: Atomic ledger tracking for refunds, promotional credits, and referral rewards (which are strictly held in escrow until an order is officially `Delivered`).

### 3. Promotions & Discounts
- **Multi-Tiered Offers**: Global Category Offers and specific Product Offers auto-calculate the best possible discount for the user.
- **Coupon Logic**: Supports minimum cart thresholds, maximum discount caps, and usage frequency limits.

### 4. Payments & Order Lifecycle
- **Strict State Machine**: Orders follow a strict, one-way sequential flow: `Placed` → `Confirmed` → `Shipped` → `Out for Delivery` → `Delivered`.
- **Razorpay Cryptography**: Webhook signatures are verified using `crypto` to prevent spoofed payment confirmations.
- **Automated PDF Invoices**: Programmatic `pdfkit` generation creates dynamic, paginated invoices with Financial Year sequence formatting (e.g., `ORD-FY24-X8J9`).

### 5. Background Automation (Cron Jobs)
- **The Cart Sweeper**: Automatically flags abandoned carts.
- **The Inventory Liberator**: Automatically cancels stale, unpaid Razorpay orders after 30 minutes, releasing locked stock back into the live inventory.

---

## 🔒 Technical Highlights & Security

- **Mongoose Sessions**: Complex operations (like checking out with a Wallet + Razorpay + Stock reduction) are wrapped in `mongo.startSession()`. If any step fails, the entire transaction rolls back.
- **Role-Based Guards**: Strict `userOnly` and `adminOnly` middlewares protect sensitive routes.
- **Token Blacklisting**: Logout instantly pushes the JWT to a Redis blacklist to prevent replay attacks.
- **Zod Validation**: 100% of incoming payloads are validated at the router level.
- **Debounced Search**: The API is optimized to handle rapid frontend debounce bursts.

---

## 🚀 Getting Started

```bash
# Install dependencies
npm install

# Copy env file and fill in your values
cp .env.example .env

# Run in development
npm run dev

# Build for production
npm run build
npm start
```

### Prerequisites
- Node.js 18+
- MongoDB (local or Atlas)
- Redis (local or cloud)
- Cloudinary, Razorpay, and SMTP credentials.

---

## 🌐 API Base URL

```text
http://localhost:5000/api
```

### Route Groups

| Prefix | Description |
|--------|-------------|
| `/api/auth` | Signup, login, OTP, OAuth, logout |
| `/api/users` | Profile, addresses, password |
| `/api/categories` | Category CRUD |
| `/api/products` | Product CRUD, variants, filters |
| `/api/cart` | Cart operations |
| `/api/wishlist` | Wishlist operations |
| `/api/orders` | Checkout, order history, cancel/return |
| `/api/coupons` | Coupon CRUD + apply |
| `/api/offers` | Product & category offers |
| `/api/reviews` | Product reviews |
| `/api/wallet` | Balance + transaction history |
| `/api/referrals` | Referral info + stats |
| `/api/admin` | Dashboard, user/order/inventory management |
