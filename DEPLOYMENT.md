# Backend Deployment — Render

## Stack

- **Runtime** — Node.js on Render Web Service
- **Database** — MongoDB Atlas ✅ already configured
- **Cache / Sessions** — Redis Cloud ✅ already configured
- **Media** — Cloudinary ✅ already configured
- **Payments** — Razorpay ✅ already configured

---

## Prerequisites

- GitHub account
- Render account → [render.com](https://render.com)
- MongoDB Atlas cluster already created ✅
- Redis Cloud database already set up ✅
- Cloudinary account already set up ✅
- Google Cloud Console project set up for OAuth ✅

Push `e-commerce-backend` to GitHub before starting.

---

## Step 1 — MongoDB Atlas connection string

Your Atlas cluster is already provisioned. Get the connection string:

1. Go to **Atlas dashboard** → your cluster → **Connect**
2. Choose **Connect your application** → Driver: **Node.js**
3. Copy the `mongodb+srv://...` connection string
4. Replace `<password>` with your DB user password
5. Add the database name before `?`: `...mongodb.net/ecommerce?retryWrites=true&w=majority`

> **Network access** — In Atlas → Network Access, add `0.0.0.0/0` (allow all IPs).
> Render's outbound IPs change on every deploy so IP whitelisting doesn't work on the free plan.

---

## Step 2 — Redis Cloud connection string

1. Go to **Redis Cloud dashboard** → your database
2. Under **Configuration**, copy the **Public endpoint** (host:port)
3. Copy the **Default user password**
4. Build the URL: `redis://default:<password>@<host>:<port>`

---

## Step 3 — Deploy on Render

1. Go to Render dashboard → **New** → **Web Service**
2. Connect your GitHub repo → select `e-commerce-backend`
3. Fill in:
   - **Name:** `ecommerce-backend`
   - **Region:** Singapore (`ap-southeast-1`) — closest to Atlas ap-south / Redis ap-south
   - **Branch:** `main`
   - **Runtime:** `Node`
   - **Build Command:** `npm install && npm run build`
   - **Start Command:** `npm start`
   - **Plan:** Free (spins down after 15 min inactivity) or Starter $7/mo for always-on

4. Under **Environment Variables**, add all the required variables from your local `.env` file into the Render dashboard.

5. Click **Create Web Service**
6. Wait for build + deploy (~3–5 minutes)
7. Test: `https://<your-backend>.onrender.com/api/health`
   → should return `{ "success": true, "message": "Server is running" }`

---

## Step 4 — Register OAuth callback URLs

After deploy, register the production callback in Google Cloud Console:

1. Go to [console.cloud.google.com](https://console.cloud.google.com) → **APIs & Services** → **Credentials**
2. Click your OAuth 2.0 Client ID
3. Under **Authorized redirect URIs**, add:
   ```
   https://<your-backend>.onrender.com/api/auth/google/callback
   ```
4. Save

---

## Step 5 — Prevent Cold Starts (UptimeRobot)

Render's free tier spins down after 15 minutes of inactivity — ~30s cold start on next request.
UptimeRobot pings every 5 minutes to keep it warm. Free forever.

1. Go to [uptimerobot.com](https://uptimerobot.com) → sign up → **Add New Monitor**
2. Fill in:
   - **Monitor Type:** HTTP(s)
   - **Friendly Name:** `Wearhaus Backend`
   - **URL:** `https://<your-backend>.onrender.com/api/health`
   - **Monitoring Interval:** 5 minutes
3. Click **Create Monitor**

> Alternatively, upgrade to Render's **Starter plan ($7/mo)** and the service never spins down.

---

## Step 6 — After frontend is deployed on Vercel

Once your Vercel frontend URL is known, come back and update these env vars in Render:

```
CLIENT_URL=https://<your-frontend>.vercel.app
GOOGLE_CALLBACK_URL=https://<your-backend>.onrender.com/api/auth/google/callback
```

Then click **Manual Deploy** → **Deploy latest commit** in Render to apply.

Also update the **Authorized redirect URI** in Google Cloud Console if not done in Step 4.

---

## Troubleshooting

| Symptom | Likely cause | Fix |
|---|---|---|
| Build fails with `tsc` errors | Type errors in source | Run `npm run build` locally first |
| `MongoDB connection error` on startup | Atlas IP not whitelisted | Add `0.0.0.0/0` in Atlas → Network Access |
| `Redis connection error` on startup | Wrong `REDIS_URL` format | Verify host/port/password from Redis Cloud dashboard |
| `Admin seeded` not appearing in logs | Admin already exists in DB | Expected — runs silently after first boot |
| Google OAuth redirect fails | Callback URL not registered | Add production URL to Google Cloud Console |
| 500 on `/api/auth/google/callback` | `CLIENT_URL` not updated | Set `CLIENT_URL` to Vercel frontend URL |
| Cold start on first request | Free tier spin-down | Set up UptimeRobot (Step 5) |

---

## Quick Reference

| Service | URL |
|---|---|
| Backend API | `https://<your-backend>.onrender.com/api` |
| Health Check | `https://<your-backend>.onrender.com/api/health` |
| MongoDB Atlas | [cloud.mongodb.com](https://cloud.mongodb.com) |
| Redis Cloud | [app.redislabs.com](https://app.redislabs.com) |
| Cloudinary | [cloudinary.com/console](https://cloudinary.com/console) |
| Render Dashboard | [dashboard.render.com](https://dashboard.render.com) |

---

## Checklist

- [ ] Repo pushed to GitHub
- [ ] MongoDB Atlas — `0.0.0.0/0` added to Network Access
- [ ] Deployed on Render — `/api/health` returns 200
- [ ] Admin seed confirmed in Render logs (`Admin seeded: ...`)
- [ ] Google OAuth callback URL registered in Google Cloud Console
- [ ] `CLIENT_URL` updated after Vercel frontend deploy
- [ ] UptimeRobot monitor set up (or upgraded to Starter plan)
