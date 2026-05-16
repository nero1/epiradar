# EpiRadar — Setup Guide

## Prerequisites

- Node.js 20+
- A Supabase project (free tier works for development)
- A Redis instance (Upstash free tier or local Redis)
- Optional: Resend or Postmark account for email
- Optional: Paystack and/or Dodopayments accounts for billing

---

## 1. Clone and Install

```bash
git clone https://github.com/nero1/epiradar.git
cd epiradar
npm install
```

---

## 2. Environment Variables

Copy the example and fill in your values:

```bash
cp .env.local.example .env.local
```

### Required (core functionality)

| Variable | Description |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Your Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase public anon key |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase service role key (server only, never expose to client) |
| `NEXT_PUBLIC_APP_URL` | Your app URL, e.g. `https://epiradar.io` |

### AI pipeline

| Variable | Description |
|---|---|
| `DEEPSEEK_API_KEY` | DeepSeek API key (primary AI provider) |
| `GEMINI_API_KEY` | Google Gemini API key (fallback AI provider) |

### Redis / caching

| Variable | Description |
|---|---|
| `UPSTASH_REDIS_URL` | Upstash Redis REST URL (or leave blank for no caching in dev) |
| `UPSTASH_REDIS_TOKEN` | Upstash Redis REST token |
| `REDIS_PROVIDER` | `upstash` or `ioredis` (default: `upstash`) |

### Email (one of these)

| Variable | Description |
|---|---|
| `EMAIL_PROVIDER` | `resend` or `postmark` (default: `resend`) |
| `RESEND_API_KEY` | Resend API key |
| `POSTMARK_SERVER_TOKEN` | Postmark server token |
| `EMAIL_FROM` | From address, e.g. `alerts@epiradar.io` |

### Payments

| Variable | Description |
|---|---|
| `PAYSTACK_SECRET_KEY` | Paystack secret key (for Nigerian users) |
| `DODOPAYMENTS_API_KEY` | Dodopayments API key (for global users) |
| `DODOPAYMENTS_WEBHOOK_SECRET` | Dodopayments webhook signing secret |

### Bot protection

| Variable | Description |
|---|---|
| `NEXT_PUBLIC_TURNSTILE_SITE_KEY` | Cloudflare Turnstile site key (public) |
| `TURNSTILE_SECRET_KEY` | Cloudflare Turnstile secret key (server only) |

### CRON security

| Variable | Description |
|---|---|
| `CRON_SECRET` | Secret token for securing CRON endpoints |

---

## 3. Database Setup

Run the schema against your Supabase project:

```bash
# Using Supabase CLI
supabase db push

# Or paste supabase/schema.sql into the Supabase SQL editor
```

Key schema elements:
- **5 tables**: `alerts`, `users`, `watchlists`, `ingestion_runs`, `billing_events`
- **`admin_audit_log`**: All admin actions are logged here
- **RLS policies**: Row-level security on all tables — users can only see/modify their own data
- **`decrement_pdf_export_quota`**: Atomic Postgres function preventing race conditions on quota
- **`reset_monthly_pdf_quotas`**: Call on the 1st of each month (or set up a Supabase scheduled function)
- **`handle_new_user`**: Trigger that creates a user profile on first OAuth login

---

## 4. Auth Setup (Google OAuth)

In your Supabase project:
1. Go to **Authentication → Providers → Google**
2. Enable Google OAuth
3. Add your Google OAuth client ID and secret
4. Set redirect URL to: `https://your-domain.com/api/auth/callback`
5. In Google Cloud Console, add `https://your-domain.com/api/auth/callback` as an authorized redirect URI

---

## 5. CRON Setup

### Vercel (primary)
`vercel.json` includes two CRON jobs:
- **Ingestion** (`/api/cron/ingest`): daily at 06:00 UTC
- **Email digest** (`/api/cron/digest`): daily at 07:00 UTC

Both require `Authorization: Bearer {CRON_SECRET}` — Vercel sends this automatically when you set the env var.

### cron-jobs.org (supplementary — higher frequency ingestion)
1. Create a free account at cron-jobs.org
2. Add a job pointing to `https://your-domain.com/api/cron/ingest`
3. Set schedule: every 4 hours
4. Add header: `Authorization: Bearer {your-CRON_SECRET}`
5. Add header: `x-cron-source: external`

---

## 6. Cloudflare Turnstile Setup

1. Go to [Cloudflare Turnstile](https://www.cloudflare.com/products/turnstile/)
2. Create a new site widget
3. Set site key → `NEXT_PUBLIC_TURNSTILE_SITE_KEY`
4. Set secret key → `TURNSTILE_SECRET_KEY`

The `TurnstileWidget` component automatically renders the challenge on login and export forms when the site key is configured. If not configured, the widget is hidden (for local development).

---

## 7. Payment Setup

### Paystack (Nigerian users)
1. Create account at paystack.com
2. Get secret key from Dashboard → Settings → API Keys
3. Set up webhook pointing to `https://your-domain.com/api/webhooks/paystack`
4. Configure webhook to send `charge.success` events

### Dodopayments (global users)
1. Create account at dodopayments.com
2. Get API key and webhook secret
3. Set up webhook pointing to `https://your-domain.com/api/webhooks/dodopayments`
4. Configure to send `payment.succeeded` events

---

## 8. Local Development

```bash
npm run dev
```

The app runs at `http://localhost:3000`. Without Supabase credentials, pages that require data will show empty states gracefully (no crashes).

---

## 9. Running Tests

```bash
# Unit tests (Vitest)
npm test

# E2E tests (Playwright) — requires running server
npm run dev &
npx playwright test tests/e2e/

# Load tests (k6) — requires k6 installed
k6 run tests/load/dashboard.js
```

---

## 10. Deployment

### Vercel (recommended)

```bash
# Install Vercel CLI
npm i -g vercel

# Deploy
vercel --prod
```

Set all environment variables in the Vercel dashboard under **Settings → Environment Variables**.

### Supabase Database Restoration

If you need to restore from backup:
1. Download backup from Supabase dashboard
2. `psql $DATABASE_URL < backup.sql`
3. Verify RLS policies are intact: `\dp` in psql
