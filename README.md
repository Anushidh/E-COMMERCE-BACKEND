# E-Commerce Backend API

A full-featured e-commerce backend built with **Node.js**, **Express**, **TypeScript**, and **MongoDB**.

---

## Tech Stack

- **Runtime:** Node.js + TypeScript
- **Framework:** Express.js
- **Database:** MongoDB (Mongoose ODM)
- **Cache/Store:** Redis (ioredis)
- **Authentication:** JWT (access + refresh tokens), Google OAuth 2.0 (Passport.js)
- **Payments:** Razorpay (online) + Cash on Delivery
- **Image Uploads:** Multer + Cloudinary
- **Email:** Nodemailer (SMTP)
- **Validation:** Zod
- **Precision Math:** Decimal.js
- **Logging:** Morgan
- **Rate Limiting:** express-rate-limit

---

## Features

### Auth & User Management

- Email/password signup with OTP verification (stored in Redis)
- Google OAuth 2.0 login via Passport.js
- JWT access + refresh token strategy
- Forgot password via email OTP reset
- Resend OTP with cooldown (60s) + expiry (5 min)
- Logout with token blacklisting (Redis)
- View/edit profile (name, phone, avatar upload)
- Multiple delivery addresses (add, edit, delete, set default)
- Change password

### Products & Catalog

- Create/edit/delete products (admin) with multiple image uploads (Cloudinary)
- Soft delete products and variants
- Product gender targeting: Men / Women / Unisex
- Product variants — size, color, stock per variant
- Product status: Active / Inactive / Out of Stock (auto-updated)
- Related products (same category)
- Full-text product search
- Category CRUD with image upload and gender assignment

### Filters & Search

- Filter by: category, gender, price range, size, color, rating, availability
- Sort by: price (asc/desc), newest, popularity, rating
- Full-text search on product name, description, brand
- Pagination on all list endpoints

### Cart

- Add / remove / update quantity
- Variant-aware cart items (size + color)
- Auto-recalculate totals (Decimal.js precision)
- Stock validation on add and at checkout

### Wishlist

- Add/remove products
- Move to cart (with variant selection)
- Persists across sessions

### Orders & Checkout

- Select address → review cart → apply coupon → place order
- Stock deduction on order placement
- Unique readable order ID generation (e.g., `ORD-LX3F2A-4B7C9E`)
- Razorpay integration (online payment with signature verification)
- Cash on Delivery support
- Payment status tracking: Pending / Paid / Failed / Refunded
- Webhook handling for Razorpay payment confirmation
- View order history (paginated)
- Order detail page with populated product/variant info
- Order status flow: Placed → Confirmed → Shipped → Out for Delivery → Delivered
- Cancel order (before shipped) — restores stock, refunds to wallet
- Return/refund request (after delivered)

### Offers & Discounts

- **Product Offers:** Admin creates % or flat discount on specific products with start/end date
- **Category Offers:** Admin creates offer on an entire category
- **Offer Priority:** If both exist, the better discount is applied automatically
- **Coupon System:**
  - Code, discount type (% or flat), min order value, max discount cap
  - Usage limit per user + total usage limit
  - Expiry date validation
  - Preview coupon discount before checkout
- Coupons stack on top of best offer
- Soft delete for all offers and coupons

### Referrals

- Unique referral code per user (auto-generated on signup)
- Referee signs up + completes first order → referrer gets wallet credit
- Track referral status: Pending / Rewarded
- Referral stats (total, pending, rewarded)

### Wallet

- Wallet balance per user
- Credit from: referrals, refunds, cancelled orders
- Use wallet at checkout (full or partial deduction)
- Wallet transaction history (paginated)

### Ratings & Reviews

- Review only after a delivered order (enforced)
- Rating (1–5) + text review
- One review per product per order
- Admin can soft-delete reviews
- Average rating auto-computed per product

### Admin Dashboard

**Analytics:**
- Total revenue (daily / weekly / monthly / yearly)
- Total orders by status
- Top 10 selling products
- Top 10 selling categories (by quantity + revenue)
- New users over time (last 30 days)
- Best coupon usage stats
- Revenue chart data (monthly, for frontend charts)

**Management:**
- User list — search, block/unblock
- Product management (CRUD + soft delete)
- Category management (CRUD + soft delete)
- Order management — view all, filter by status, update status
- Coupon management (CRUD + soft delete)
- Offer management — product offers + category offers
- Review moderation (soft delete)
- Handle return/refund requests (approve/reject)

### Inventory

- Stock tracked per variant (size + color)
- Low stock alerts (configurable threshold)
- Out of stock auto-status on product when all variants hit 0

### Notifications (Email)

- OTP verification email
- Order confirmation email
- Order status update emails
- Refund confirmation email

---

## Technical Highlights

- **Decimal.js** for all price calculations — no floating point issues
- **Soft delete pattern** across all major collections
- **Centralized error handling** middleware (AppError, Zod, JWT, CastError)
- **Input validation** with Zod schemas on all endpoints
- **Rate limiting** on auth and OTP routes
- **Role-based route guards** (admin / user middleware)
- **ENV-based config** management with sensible defaults
- **Request logging** with Morgan (dev/combined modes)
- **Mongoose indexes** for performance on all query-heavy fields

---

## Project Structure

```
src/
├── config/          # DB, Redis, Cloudinary, Passport, Multer, env
├── controllers/     # Route handlers (auth, user, product, cart, order, etc.)
├── middlewares/     # Auth, error handler, rate limiters
├── models/          # Mongoose schemas (User, Product, Variant, Order, etc.)
├── routes/          # Express route definitions
├── types/           # TypeScript type augmentations
├── utils/           # Helpers, email, token, AppError
├── validators/      # Zod validation schemas
├── app.ts           # Express app setup
└── server.ts        # Entry point — connects DB and starts server
```

---

## Collections

Users, Products, Categories, Variants, Cart, Wishlist, Orders, Payments, Coupons, ProductOffers, CategoryOffers, Reviews, Wallet, WalletTransactions, Referrals, OTPRecords

---

## Getting Started

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
- Cloudinary account
- Razorpay account (for payments)
- SMTP credentials (for emails)

---

## API Base URL

```
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
